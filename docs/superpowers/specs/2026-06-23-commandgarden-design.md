# commandGarden — Enterprise Browser Automation Extension

Design spec for commandGarden, a standalone enterprise-focused Chrome extension + daemon + CLI that turns websites into secure, auditable CLI commands using declarative YAML connectors.

---

## Context & Motivation

**OpenCLI** (jackwener) and **AutoCLI** (nashsu) both solve the same problem: give humans and AI agents a unified CLI to interact with any website by reusing authenticated browser sessions. They share a similar architecture (Chrome extension → WebSocket daemon → CLI) and adapter model (YAML/TS definitions per site).

**Enterprise gaps in both projects:**
- Broad permissions (`<all_urls>`, `debugger`, `cookies`) — hard to pass IT security review
- No domain-scoped capability declarations — connectors can do anything on any site
- JS `eval` in template engine (OpenCLI) — arbitrary code execution risk
- No formal "connector" concept — adapters are loosely defined
- No structured audit logging for compliance
- No admin-controlled security policies

**commandGarden** fills these gaps with a clean-sheet design focused on security, simplicity, and auditability.

---

## 1. Architecture Overview

> **Terminology**: In commandGarden, a **connector** is a declarative YAML file that defines how to interact with a specific website — what domains it accesses, what capabilities it uses, and what pipeline steps to execute. This replaces the "adapter" concept from OpenCLI/AutoCLI.

Three components communicating via localhost:

```
┌─────────────┐      HTTP       ┌──────────────┐    WebSocket    ┌───────────────────┐
│  CLI Client  │ ──────────────→ │   Daemon     │ ←────────────→ │  Chrome Extension  │
│  (Node.js)   │   (localhost)   │  (Node.js)   │                │  (MV3, TypeScript) │
└─────────────┘                  └──────────────┘                └───────────────────┘
                                       │
                                       ▼
                                 ┌──────────────┐
                                 │  Audit Log   │
                                 │  (SQLite)    │
                                 └──────────────┘
```

**Flow:**
1. CLI sends a command as HTTP POST to daemon
2. Daemon validates (auth token, connector exists, domains approved), logs audit event, relays to extension via WebSocket
3. Extension executes declared pipeline steps (only on approved domains), returns structured data
4. Daemon relays response to CLI, logs result

**Directory structure** (in `opencli-poc` repo, top-level `commandGarden/`):

```
commandGarden/
  cli/              # CLI client (npx commandgarden ...)
  daemon/           # Local WebSocket relay + audit logger
  chrome/           # Chrome MV3 extension source
  connectors/       # Built-in YAML connector definitions
  shared/           # Shared types: connector schema, events, protocol
  package.json      # Workspace root (npm workspaces)
```

**Tech stack:** Node.js/TypeScript throughout. Chrome extension uses MV3 + Vite build.

---

## 2. Security Model

### 2.1 Domain Allowlist

Each connector declares the exact domains it needs. The extension merges all installed connectors' domains into a single allowlist. Any request to a domain not on this list is silently blocked. The extension only requests Chrome permissions for declared domains — no `<all_urls>`.

### 2.2 Capability System

Seven capabilities a connector can declare:

| Capability | What it allows | Risk level |
|---|---|---|
| `navigate` | Open a URL in a tab | Low |
| `cookie_read` | Read cookies for declared domains | Medium |
| `cookie_write` | Set/delete cookies | **High** |
| `dom_read` | Read DOM elements (querySelector) | Low |
| `dom_write` | Click, type, modify DOM | Medium |
| `intercept_response` | Read network response bodies | Medium |
| `js_evaluate` | Run sandboxed JS expression in page | **High** |

- Connectors must declare every capability they use.
- Daemon validates capabilities before forwarding to extension.
- `js_evaluate` and `cookie_write` require explicit admin approval in config.

### 2.3 Daemon Auth

- **Per-session token**: On startup, daemon generates a random 256-bit token, writes to `~/.commandgarden/session-token` (user-only readable). CLI reads this file to authenticate.
- **Localhost-only binding**: Daemon binds to `127.0.0.1`, never `0.0.0.0`.
- **Extension ID verification**: Daemon only accepts WebSocket from the specific extension ID (Origin header check).
- **Request validation**: Every command checked against connector's declared domains and capabilities before forwarding.
- **CSRF defense**: Custom `X-CommandGarden` header required on HTTP requests. No CORS headers on command endpoints.
- **Body size limit**: 1 MB max.

### 2.4 No Credential Handling

commandGarden never touches credentials. It reuses existing browser sessions via cookies. The extension reads cookies from Chrome's cookie store for declared domains only. Credentials never leave the browser.

### 2.5 Step Approval (Confirmation Gate)

Pipeline steps can require interactive user approval before execution. This is a runtime confirmation layer on top of the static `approvedHighRisk` config — even after a connector is approved to use a high-risk capability, individual steps can still pause for confirmation.

**Configuration** (in `~/.commandgarden/config.yaml`, under `security`):

| Field | Type | Description |
|---|---|---|
| `approvalRequired` | `string[]` | Capabilities that require user confirmation per step (e.g., `js_evaluate`, `dom_write`) |
| `autoApproveConnectors` | `string[]` | Connector keys (`site/name`) that skip approval entirely |
| `approvalTimeoutMs` | `number` | How long to wait for approval before aborting (default: 120000) |

**Protocol**:

1. Daemon checks if the connector's pipeline contains steps matching `approvalRequired` capabilities. If so, it returns HTTP 202 with a `requestId` and sets up an SSE stream at `/api/run/events/:requestId`.
2. CLI connects to the SSE stream to receive approval events.
3. Extension executes the pipeline. Before each step with a matching capability, it sends an `ApprovalRequest` to the daemon via WebSocket.
4. Daemon fans out the request to the CLI (via SSE) and registers a pending approval with timeout.
5. User approves/rejects via either:
   - **CLI terminal** — interactive `y/n` prompt
   - **Chrome extension popup** — Approve/Reject buttons
6. Whichever surface responds first resolves the approval. The response propagates to both daemon and extension.
7. If rejected, the pipeline aborts. If the timeout expires, the step is auto-rejected.

**Message types**:

```typescript
interface ApprovalRequest {
  type: 'approval.request';
  approvalId: string;
  requestId: string;
  connectorKey: string;
  stepIndex: number;
  stepType: PipelineStepType;
  capability: Capability;
  description: string;
}

interface ApprovalResponse {
  type: 'approval.response';
  approvalId: string;
  approved: boolean;
}
```

**Relationship to `approvedHighRisk`**: `approvedHighRisk` is a static gate — connectors not on the list are blocked entirely from using high-risk capabilities. `approvalRequired` is a runtime gate — even approved connectors pause for per-step confirmation. Both can be active simultaneously.

---

## 3. Connector Format & Pipeline Engine

### 3.1 YAML Connector Schema

```yaml
site: timetracking
name: report
version: "1.0"
description: "Fetch monthly time tracking report"
access: read                          # read | write

# Security declarations
domains:
  - "timetracking.example.com"
  - "login.microsoftonline.com"
capabilities:
  - navigate
  - cookie_read
  - dom_read
  - intercept_response

# CLI arguments
args:
  - name: month
    type: string
    required: false
    default: ""
    help: "Month in YYYY-MM format"
    pattern: "^\\d{4}-\\d{2}$"

# Output schema
columns:
  - name: date
    type: string
  - name: project
    type: string
  - name: hours
    type: number

# Execution pipeline
pipeline:
  - step: navigate
    url: "https://timetracking.example.com/report"
  - step: wait
    selector: "#report-table"
    timeout: 10000
  - step: extract
    selector: "#report-table tbody tr"
    fields:
      date: "td:nth-child(1)"
      project: "td:nth-child(2)"
      hours: "td:nth-child(3)"
```

### 3.2 Pipeline Steps (v1)

| Step | Purpose | Capability required |
|---|---|---|
| `navigate` | Go to a URL | `navigate` |
| `wait` | Wait for selector or timeout | `navigate` |
| `extract` | Read data from DOM elements | `dom_read` |
| `click` | Click an element | `dom_write` |
| `type` | Type text into an input | `dom_write` |
| `intercept` | Capture network response matching URL pattern | `intercept_response` |
| `cookie` | Read cookies for a domain | `cookie_read` |
| `fetch` | HTTP request from page context | `cookie_read` |
| `map` | Transform extracted data (rename, format) | none |
| `filter` | Filter rows by condition | none |
| `set` | Set a variable for later steps | none |

### 3.3 Expression Syntax

`${{ }}` template expressions — no JS eval:

- **Variable access**: `args.month`, `vars.token`, `cookies.name`
- **String concat**: `"Bearer " + vars.token`
- **Pipe filters**: `args.month | default("2026-06")`, `value | number`, `text | trim`
- **NO** function calls, loops, or arbitrary code

---

## 4. Audit & Event Logging

### 4.1 Event Schema

```typescript
interface AuditEvent {
  id: string;                    // UUID
  timestamp: string;             // ISO 8601
  type: "command.start" | "command.success" | "command.error" | "command.denied";
  user: string;                  // OS username
  connector: string;             // e.g., "timetracking/report"
  args: Record<string, string>;  // sanitized args (no secrets)
  domains: string[];             // domains actually accessed
  capabilities: string[];        // capabilities actually used
  rowCount?: number;
  columns?: string[];
  durationMs: number;
  error?: string;
  denialReason?: string;
}
```

### 4.2 Storage & Export

- **SQLite** at `~/.commandgarden/audit.db`
- **CLI query**: `commandgarden audit list --since 7d --connector timetracking/*`
- **JSON export**: `commandgarden audit export --format json --since 30d`
- **Auto-rotation**: prune events older than configurable retention (default: 90 days)
- **No data content**: events record what was accessed and row count, never actual data values

### 4.3 Denial Logging

Blocked commands (unapproved domain, missing capability, invalid token) log `command.denied` with reason.

---

## 5. CLI Interface

```bash
# Run a connector
commandgarden run <site>/<command> [--args...]
commandgarden run timetracking/report --month 2026-06 --format json

# Daemon management
commandgarden daemon start
commandgarden daemon stop
commandgarden daemon status

# Connector management
commandgarden list                  # list all installed connectors
commandgarden inspect <site>/<command>  # show connector details
commandgarden validate <file.yaml>  # validate connector YAML

# Audit
commandgarden audit list [--since <duration>] [--connector <pattern>]
commandgarden audit export --format json [--since <duration>]

# Config
commandgarden config show
commandgarden config set <key> <value>
```

---

## 6. Configuration

Stored at `~/.commandgarden/config.yaml`:

```yaml
daemon:
  port: 19825
  host: "127.0.0.1"

security:
  extensionId: "abcdef..."
  highRiskCapabilities:
    - js_evaluate
    - cookie_write
  approvedHighRisk: []              # connectors approved for high-risk capabilities
  approvalRequired: []              # capabilities requiring per-step user confirmation
  autoApproveConnectors: []         # connector keys that skip step approval
  approvalTimeoutMs: 120000         # timeout before auto-rejecting (ms)

connectors:
  paths:
    - "./connectors"                # built-in
    - "~/.commandgarden/connectors" # user-defined

audit:
  retentionDays: 90
  dbPath: "~/.commandgarden/audit.db"

output:
  defaultFormat: table              # table | json | csv
```

---

## 7. Output Formats

`--format table` (default), `--format json`, `--format csv`.

JSON envelope:

```json
{
  "ok": true,
  "connector": "timetracking/report",
  "rowCount": 42,
  "columns": ["date", "project", "hours"],
  "data": [...]
}
```

---

## 8. Key Differences from OpenCLI/AutoCLI

| Aspect | OpenCLI/AutoCLI | commandGarden |
|---|---|---|
| Permissions | `<all_urls>`, `debugger` | Domain-scoped per connector |
| Connector format | YAML + TypeScript (arbitrary code) | YAML-only (no code execution) |
| Template engine | JS `eval` / Rust PEG parser | `${{ }}` expressions (no eval) |
| Capability control | None — connectors can do anything | 7 declared capabilities, high-risk needs approval |
| Audit | None | Structured event log with SQLite |
| Auth model | Shared daemon, no per-session auth | Per-session token, extension ID verification |
| AI agent features | Auto-discover, auto-generate, self-repair | Not in v1 (future consideration) |

---

## 9. Test Strategy

- **Shared types**: Unit tests for connector schema validation, expression parser, audit event serialization
- **Daemon**: Integration tests for auth token validation, capability checking, WebSocket relay, audit logging
- **Extension**: Unit tests for pipeline step execution, domain allowlist enforcement
- **CLI**: Integration tests for command parsing, output formatting, daemon communication
- **End-to-end**: Verify a sample connector runs through the full CLI → daemon → extension → response → audit chain

---

## Next Steps

1. Write implementation plan (invoke writing-plans skill)
2. Scaffold `commandGarden/` directory with npm workspaces
3. Implement shared types first (connector schema, protocol, events)
4. Build daemon with auth + audit
5. Build Chrome extension with pipeline engine
6. Build CLI client
7. Port `timetracking/report` to YAML connector format as proof of concept
