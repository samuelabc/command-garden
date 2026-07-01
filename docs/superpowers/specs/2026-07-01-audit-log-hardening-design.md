# Audit Log Hardening — Pipeline Transparency

Design spec for hardening commandGarden's audit log to meet MVP enterprise compliance requirements, adding pipeline-level visibility and closing security gaps identified during review.

---

## Context

commandGarden's existing audit log captures command-level events (start, success, error, denied) in a local SQLite database. This is a solid foundation, but a security review identified gaps that would surface during an IT security evaluation:

- Auth failures (bad tokens, missing CSRF) leave no trace
- Approval decisions (step-level approve/reject) aren't recorded
- Config mutations (e.g., adding a connector to approvedHighRisk) are untracked
- No correlation between start and end events for the same command execution
- No visibility into which pipeline steps actually executed
- No record of which connector version was running
- Commands can proceed even if audit writes fail
- Arg values aren't sanitized for sensitive content
- audit.db file permissions aren't restricted

**Deployment model:** Each user runs their own local daemon. Logs stay local. IT security may request exported logs during audits.

**Scope:** This spec covers the "Pipeline Transparency" approach — fixing all critical compliance gaps plus adding step-level execution visibility and connector content hashing.

---

## 1. Event Schema Changes

### 1.1 New Event Types

Expanding from 4 to 8 event types:

```typescript
const AUDIT_EVENT_TYPES = [
  // Existing
  'command.start',
  'command.success',
  'command.error',
  'command.denied',
  // New
  'auth.failed',         // bad token, missing CSRF header
  'approval.granted',    // step approval approved
  'approval.rejected',   // step approval rejected
  'config.changed',      // cg config set <key> <value>
] as const;
```

### 1.2 New Fields on AuditEvent

| Field | Type | Used by | Purpose |
|---|---|---|---|
| `correlationId` | `string` | `command.*`, `approval.*` | Shared UUID linking start → success/error for the same execution, and any approval decisions within it |
| `connectorHash` | `string?` | `command.start`, `command.success`, `command.error` | SHA-256 of the connector YAML file content |
| `steps` | `StepSummary[]?` | `command.success`, `command.error` | Compact execution trace of pipeline steps |
| `source` | `string?` | `auth.failed`, `approval.*`, `config.changed` | Context: request path, "cli"/"extension", or config key |
| `previousValue` | `string?` | `config.changed` | The old config value |
| `newValue` | `string?` | `config.changed` | The new config value |

### 1.3 StepSummary Type

```typescript
interface StepSummary {
  step: string;        // "navigate", "extract", "js_evaluate", etc.
  index: number;       // 0-based step index in the pipeline
  capability?: string; // capability required by this step, if any
  durationMs: number;  // wall-clock time for this step
  error?: string;      // populated only if this step failed
}
```

### 1.4 Arg Redaction

Args with keys matching `/token|password|secret|api_key|credential|auth/i` get their values replaced with `[REDACTED]` before logging. Applied in `createAuditEvent()` so all callers benefit. The pattern avoids overly generic terms like `key` to prevent false positives on legitimate field names.

---

## 2. Storage Changes

### 2.1 SQLite Schema Migration

New columns added via `ALTER TABLE` on `AuditStore` construction. All nullable for backward compatibility with existing `audit.db` files:

```sql
ALTER TABLE audit_events ADD COLUMN correlation_id TEXT;
ALTER TABLE audit_events ADD COLUMN connector_hash TEXT;
ALTER TABLE audit_events ADD COLUMN steps TEXT;           -- JSON array of StepSummary
ALTER TABLE audit_events ADD COLUMN source TEXT;
ALTER TABLE audit_events ADD COLUMN previous_value TEXT;
ALTER TABLE audit_events ADD COLUMN new_value TEXT;
```

Migration checks if columns exist before altering (via `PRAGMA table_info`).

### 2.2 File Permissions

`AuditStore` constructor sets `chmod 0o600` on the db file after creation, matching the session-token file's security posture.

### 2.3 Pruning Audit Event

When `prune()` deletes records on daemon startup, a synthetic event is inserted:

```
type: 'config.changed'
connector: '_system/prune'
user: <os-user>
source: 'audit.prune'
previousValue: '<count-of-pruned-records>'
newValue: '0'
args: { retentionDays: "<days>" }
```

This reuses the `config.changed` type (audit state was changed) rather than misusing `command.start`. The pruning action is visible in the audit trail and queryable via `--type config.changed`.

---

## 3. Daemon Changes

### 3.1 Audit-or-Fail Policy

The `command.start` audit insert is wrapped so that if it throws (disk full, corruption), the command is rejected with HTTP 500 and the error message `"Audit system unavailable — command blocked"`. Commands must not execute without a successful audit record.

`command.success`/`command.error` insert failures are logged to stderr but do not retroactively fail the already-completed command (data is already returned to the client).

### 3.2 Auth Failure Logging

The `preHandler` hook in `server.ts` inserts `auth.failed` events for:
- Missing `X-CommandGarden` header
- Missing or invalid Bearer token

These events have minimal fields: `timestamp`, `type: 'auth.failed'`, `user` (OS user running daemon), `source` (the request URL path).

### 3.3 Correlation ID

A `correlationId` (UUID) is generated once per command execution. Used in:
- `command.start` — set when command begins
- `command.success` or `command.error` — same ID, links to the start event
- `approval.granted`/`approval.rejected` — same ID, links approval to the command

### 3.4 Connector Hash

Before sending a command to the extension, the daemon computes `SHA-256` of the connector's raw YAML content. This hash is stored in `command.start`, `command.success`, and `command.error` events. If the connector YAML file changes between runs, the hash changes — visible in the audit trail.

Requires `ConnectorRegistry` to expose a `getWithMeta(key)` method returning `{ connector, yamlContent, filePath }`.

### 3.5 Approval Logging

When `resolveApproval()` is called (either from CLI's `POST /api/approval` or from the extension via WebSocket):
- If approved: insert `approval.granted` event with `correlationId`, `source` ("cli" or "extension"), and step info
- If rejected: insert `approval.rejected` event with the same fields

### 3.6 Config Change Logging

When `cg config set` mutates a config value, the daemon logs a `config.changed` event with:
- `source`: the config key (e.g., `security.approvedHighRisk`)
- `previousValue`: the old value (JSON-stringified)
- `newValue`: the new value (JSON-stringified)

This requires either a daemon endpoint for config changes or the CLI calling through to the daemon. Since config changes are currently file-based (CLI writes YAML directly), the simplest approach is to add a `POST /api/config` endpoint that the CLI calls instead of writing the file directly. The daemon performs the write and logs the audit event atomically.

---

## 4. Extension Changes

### 4.1 Step Summary Collection

`PipelineRunner.run()` collects `StepSummary[]` during execution. Each step iteration:

1. Records `Date.now()` before the step
2. After the step completes, pushes a `StepSummary` with step type, index, capability, and duration
3. On step failure, the summary includes the error message

The `StepSummary[]` is included in the `ExtensionResponse`.

### 4.2 ExtensionResponse Type Change

```typescript
interface ExtensionResponse {
  id: string;
  ok: boolean;
  data: Record<string, unknown>[];
  error?: string;
  steps?: StepSummary[];  // NEW: pipeline execution trace
}
```

This is a backward-compatible addition. The daemon reads `steps` if present.

---

## 5. CLI Changes

### 5.1 New `--type` Filter

```bash
cg audit list --type command.denied --since 7d
cg audit list --type auth.failed --since 24h
cg audit list --type approval.* --since 30d
```

Accepts exact type or glob pattern. Added to both `cg audit list` and `cg audit export`. Passed as `type` query parameter to `GET /api/audit`.

### 5.2 API Query Parameter

`GET /api/audit` gains a `type` query parameter:

```
GET /api/audit?type=auth.failed&since=2026-06-01
GET /api/audit?type=command.*&connector=teams/*
```

`AuditStore.list()` gains `type?: string` in its options, using `AND type LIKE ?` with the same glob-to-SQL translation as `connector`.

### 5.3 Table Display Update

`cg audit list` table adds a `Source` column. Shows `-` for events that don't have a source.

### 5.4 CSV Export Fix

`AUDIT_COLUMNS` expanded to include: `correlationId`, `connectorHash`, `source`, `args`, `domains`, `capabilities`. The `steps` field is serialized as a compact JSON string. `args`, `domains`, and `capabilities` (already present in JSON export but missing from CSV) are serialized as JSON strings.

### 5.5 New `cg audit show <id>` Subcommand

Displays a single event's full detail:

```
Event: evt-abc-123
Type: command.success
Connector: teams/room-availability (hash: a1b2c3...)
Correlation: corr-xyz-789
User: samuel
Timestamp: 2026-07-01 20:15:00
Duration: 1200ms
Rows: 24

Pipeline Steps:
  #  STEP         CAPABILITY          DURATION
  1  navigate     navigate            320ms
  2  wait         navigate            450ms
  3  js_evaluate  js_evaluate         280ms
  4  map          -                   2ms
  5  filter       -                   1ms
```

Requires a new API endpoint `GET /api/audit/:id` and a corresponding `AuditStore.getById(id)` method.

---

## 6. Test Strategy

### 6.1 Shared (events.ts)
- `AUDIT_EVENT_TYPES` has 8 entries
- `createAuditEvent` with new fields: `correlationId`, `connectorHash`, `steps`, `source` all round-trip correctly
- Arg redaction: keys matching sensitive pattern → `[REDACTED]`, others unchanged
- Redaction edge cases: empty args, no matching keys, mixed sensitive/non-sensitive

### 6.2 Daemon (audit-store.ts)
- Schema migration: opening existing DB (without new columns) adds them. No data loss.
- Insert/retrieve with new fields: `correlationId`, `steps` (JSON), `connectorHash` survive round-trip
- `list()` with `type` filter: exact match, glob pattern, combined with `since` and `connector`
- `getById()`: returns single event with all fields
- File permissions: DB file created with `0o600`

### 6.3 Daemon (server.ts)
- Auth failure logging: invalid token → `auth.failed` event with source. Missing CSRF → same.
- Correlation ID: `command.start` and `command.success`/`error` share `correlationId`
- Connector hash: `command.start` includes hash matching the connector file content
- Audit-or-fail: audit insert throws → `/api/run` returns 500, command does not execute
- Approval logging: approve → `approval.granted` with correlationId and source. Reject → `approval.rejected`.
- Steps in response: extension returns `steps` → included in `command.success` audit event

### 6.4 Extension (pipeline/runner.ts)
- Step summaries collected: each step produces `StepSummary` with correct type, index, capability, duration
- Failed step has error: if step 3 throws, `steps[2].error` is populated and summary is included in error response
- Timing accuracy: durations are non-negative and roughly sum to total `durationMs`

### 6.5 CLI (commands/audit.ts)
- `--type` filter: passes through to API as query parameter
- `cg audit show`: displays full event detail including steps table
- CSV export: new columns present, JSON fields serialized correctly

### 6.6 Registry
- `getWithMeta()`: returns connector + YAML content + file path
- Hash stability: same YAML content produces same hash across runs

---

## 7. Summary of Changes by Package

| Package | Files touched | Nature of change |
|---|---|---|
| `shared` | `events.ts` | New event types, new fields, `StepSummary` type, arg redaction |
| `daemon` | `audit-store.ts` | Schema migration, new columns, `getById()`, `type` filter, file permissions |
| `daemon` | `server.ts` | Auth failure logging, correlation ID, connector hash, audit-or-fail, approval logging |
| `daemon` | `registry.ts` | `getWithMeta()` method |
| `daemon` | `config.ts` / new `config-api.ts` | `POST /api/config` endpoint for audited config changes |
| `chrome` | `pipeline/runner.ts` | Step summary collection |
| `shared` | Protocol types | `ExtensionResponse.steps` field |
| `cli` | `commands/audit.ts` | `--type` filter, `cg audit show`, CSV column expansion |
| `cli` | `main.ts` | Register `audit show` subcommand, route config set through daemon |
