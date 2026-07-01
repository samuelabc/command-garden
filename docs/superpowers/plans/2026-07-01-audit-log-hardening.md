# Audit Log Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden commandGarden's audit log for MVP enterprise compliance — add missing event types, step-level pipeline visibility, connector hashing, correlation IDs, and audit-or-fail policy.

**Architecture:** Changes flow bottom-up through the monorepo: shared types first (new event types, StepSummary, arg redaction), then daemon storage + server (schema migration, new audit events, correlation IDs), then extension (step summary collection), then CLI (query filters, `audit show` command). Each layer is independently testable.

**Tech Stack:** TypeScript, Vitest, SQLite (better-sqlite3), Commander.js, Fastify, Chrome MV3 extension.

## Global Constraints

- Node.js >= 20, npm >= 9 (with workspaces)
- All tests use Vitest with `describe`/`it`/`expect`/`vi` from `vitest`
- Imports use `.js` extensions for ESM compatibility
- Run tests per-workspace: `npm test -w shared`, `npm test -w daemon`, etc.
- Build order: `shared` → `daemon` → `cli` → `chrome`
- All new fields on `AuditEvent` are optional (nullable) for backward compatibility
- Redaction pattern: `/token|password|secret|api_key|credential|auth/i`

---

### Task 1: Shared — Expand Event Types, Add New Fields, Add Arg Redaction

**Files:**
- Modify: `commandGarden/shared/src/events.ts`
- Modify: `commandGarden/shared/src/events.test.ts`
- Modify: `commandGarden/shared/src/index.ts`

**Interfaces:**
- Consumes: nothing new
- Produces:
  - `StepSummary` type: `{ step: string; index: number; capability?: string; durationMs: number; error?: string }`
  - `AuditEvent` gains optional fields: `correlationId?: string`, `connectorHash?: string`, `steps?: StepSummary[]`, `source?: string`, `previousValue?: string`, `newValue?: string`
  - `AUDIT_EVENT_TYPES` expands to 8 entries (adds `auth.failed`, `approval.granted`, `approval.rejected`, `config.changed`)
  - `redactArgs(args: Record<string, string>): Record<string, string>` — pure function
  - `createAuditEvent()` auto-applies `redactArgs` to `args`

- [ ] **Step 1: Write failing tests for new event types and fields**

Add these tests to `commandGarden/shared/src/events.test.ts`:

```typescript
// Add inside existing describe('AUDIT_EVENT_TYPES') block:
it('defines exactly 8 event types', () => {
  expect(AUDIT_EVENT_TYPES).toHaveLength(8);
});

it('includes new event types', () => {
  expect(AUDIT_EVENT_TYPES).toContain('auth.failed');
  expect(AUDIT_EVENT_TYPES).toContain('approval.granted');
  expect(AUDIT_EVENT_TYPES).toContain('approval.rejected');
  expect(AUDIT_EVENT_TYPES).toContain('config.changed');
});
```

Add a new `describe('createAuditEvent — new fields')` block:

```typescript
describe('createAuditEvent — new fields', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-23T12:00:00Z'));
  });
  afterEach(() => { vi.useRealTimers(); });

  it('includes correlationId when provided', () => {
    const event = createAuditEvent({
      type: 'command.start', connector: 'a/b', correlationId: 'corr-1',
    });
    expect(event.correlationId).toBe('corr-1');
  });

  it('includes connectorHash when provided', () => {
    const event = createAuditEvent({
      type: 'command.start', connector: 'a/b', connectorHash: 'abc123',
    });
    expect(event.connectorHash).toBe('abc123');
  });

  it('includes steps when provided', () => {
    const steps = [{ step: 'navigate', index: 0, durationMs: 100 }];
    const event = createAuditEvent({
      type: 'command.success', connector: 'a/b', steps,
    });
    expect(event.steps).toEqual(steps);
  });

  it('includes source, previousValue, newValue for config.changed', () => {
    const event = createAuditEvent({
      type: 'config.changed', connector: '_system/config',
      source: 'security.approvedHighRisk', previousValue: '[]', newValue: '["a/b"]',
    });
    expect(event.source).toBe('security.approvedHighRisk');
    expect(event.previousValue).toBe('[]');
    expect(event.newValue).toBe('["a/b"]');
  });
});
```

Add a new `describe('redactArgs')` block (import `redactArgs` at top):

```typescript
describe('redactArgs', () => {
  it('redacts keys matching sensitive pattern', () => {
    const result = redactArgs({ token: 'abc', password: '123', month: '2026-06' });
    expect(result.token).toBe('[REDACTED]');
    expect(result.password).toBe('[REDACTED]');
    expect(result.month).toBe('2026-06');
  });

  it('is case-insensitive', () => {
    const result = redactArgs({ API_KEY: 'xyz', Secret: 'shhh' });
    expect(result.API_KEY).toBe('[REDACTED]');
    expect(result.Secret).toBe('[REDACTED]');
  });

  it('passes through non-matching keys', () => {
    const result = redactArgs({ month: '2026-06', room: 'Vista' });
    expect(result).toEqual({ month: '2026-06', room: 'Vista' });
  });

  it('handles empty args', () => {
    expect(redactArgs({})).toEqual({});
  });
});

describe('createAuditEvent — auto-redaction', () => {
  it('redacts sensitive args automatically', () => {
    const event = createAuditEvent({
      type: 'command.start', connector: 'a/b',
      args: { token: 'secret-value', month: '2026-06' },
    });
    expect(event.args.token).toBe('[REDACTED]');
    expect(event.args.month).toBe('2026-06');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -w shared -- --run`

Expected: Multiple failures — `AUDIT_EVENT_TYPES` has 4 not 8, `redactArgs` is not defined, new fields don't exist on `AuditEvent`.

- [ ] **Step 3: Implement the changes in events.ts**

Update `commandGarden/shared/src/events.ts` to:

```typescript
import { randomUUID } from 'node:crypto';

export const AUDIT_EVENT_TYPES = [
  'command.start',
  'command.success',
  'command.error',
  'command.denied',
  'auth.failed',
  'approval.granted',
  'approval.rejected',
  'config.changed',
] as const;

export type AuditEventType = (typeof AUDIT_EVENT_TYPES)[number];

export interface StepSummary {
  step: string;
  index: number;
  capability?: string;
  durationMs: number;
  error?: string;
}

export interface AuditEvent {
  id: string;
  timestamp: string;
  type: AuditEventType;
  user: string;
  connector: string;
  args: Record<string, string>;
  domains: string[];
  capabilities: string[];
  rowCount?: number;
  columns?: string[];
  durationMs: number;
  error?: string;
  denialReason?: string;
  correlationId?: string;
  connectorHash?: string;
  steps?: StepSummary[];
  source?: string;
  previousValue?: string;
  newValue?: string;
}

const SENSITIVE_PATTERN = /token|password|secret|api_key|credential|auth/i;

export function redactArgs(args: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [k, v] of Object.entries(args)) {
    result[k] = SENSITIVE_PATTERN.test(k) ? '[REDACTED]' : v;
  }
  return result;
}

export function createAuditEvent(
  overrides: Partial<AuditEvent> & Pick<AuditEvent, 'type' | 'connector'>,
): AuditEvent {
  const base: AuditEvent = {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    user: '',
    args: {},
    domains: [],
    capabilities: [],
    durationMs: 0,
    ...overrides,
  };
  base.args = redactArgs(base.args);
  return base;
}
```

- [ ] **Step 4: Update existing test assertion**

In `commandGarden/shared/src/events.test.ts`, update the existing test:

```typescript
// Change:
it('defines exactly 4 event types', () => {
  expect(AUDIT_EVENT_TYPES).toHaveLength(4);
});
// To:
it('defines exactly 8 event types', () => {
  expect(AUDIT_EVENT_TYPES).toHaveLength(8);
});
```

Remove the duplicate new test for "defines exactly 8 event types" you added in Step 1 (keep one).

- [ ] **Step 5: Update shared/src/index.ts exports**

Add `StepSummary` and `redactArgs` to the audit events export block:

```typescript
export {
  AUDIT_EVENT_TYPES,
  type AuditEvent,
  type AuditEventType,
  type StepSummary,
  createAuditEvent,
  redactArgs,
} from './events.js';
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test -w shared -- --run`

Expected: All tests PASS.

- [ ] **Step 7: Commit**

```bash
git add commandGarden/shared/src/events.ts commandGarden/shared/src/events.test.ts commandGarden/shared/src/index.ts
git commit -m "feat(shared): expand audit event types, add StepSummary, correlationId, connectorHash, arg redaction"
```

---

### Task 2: Shared — Add `steps` to `ExtensionResponse`

**Files:**
- Modify: `commandGarden/shared/src/protocol.ts`

**Interfaces:**
- Consumes: `StepSummary` from Task 1
- Produces: `ExtensionResponse.steps?: StepSummary[]` — backward-compatible addition

- [ ] **Step 1: Add `steps` field to `ExtensionResponse`**

In `commandGarden/shared/src/protocol.ts`, add the import and field:

```typescript
// Add to imports at top:
import type { StepSummary } from './events.js';

// Update ExtensionResponse:
export interface ExtensionResponse {
  id: string;
  ok: boolean;
  data: Record<string, unknown>[];
  error?: string;
  steps?: StepSummary[];
}
```

- [ ] **Step 2: Verify `isExtensionResponse` still works (no change needed)**

The type guard checks `id`, `ok`, `data` — `steps` is optional so no guard change required.

Run: `npm test -w shared -- --run`

Expected: All tests PASS (no behavioral change).

- [ ] **Step 3: Commit**

```bash
git add commandGarden/shared/src/protocol.ts
git commit -m "feat(shared): add steps field to ExtensionResponse"
```

---

### Task 3: Daemon — Schema Migration, New Columns, `getById`, `type` Filter, File Permissions

**Files:**
- Modify: `commandGarden/daemon/src/audit-store.ts`
- Modify: `commandGarden/daemon/src/audit-store.test.ts`

**Interfaces:**
- Consumes: `AuditEvent` with new fields from Task 1
- Produces:
  - `AuditStore.list(opts?)` — gains `type?: string` in opts
  - `AuditStore.getById(id: string): AuditEvent | undefined`
  - Constructor auto-migrates schema with new columns
  - Constructor sets `0o600` on db file (skipped for `:memory:`)

- [ ] **Step 1: Write failing tests for new store features**

Add to `commandGarden/daemon/src/audit-store.test.ts`:

```typescript
import { createAuditEvent, type StepSummary } from '@commandgarden/shared';

// Add inside describe('AuditStore'):

it('inserts and retrieves new fields (correlationId, connectorHash, steps, source)', () => {
  const steps: StepSummary[] = [
    { step: 'navigate', index: 0, capability: 'navigate', durationMs: 200 },
    { step: 'extract', index: 1, capability: 'dom_read', durationMs: 50 },
  ];
  const evt = createAuditEvent({
    type: 'command.success', connector: 'a/b', user: 'alice',
    correlationId: 'corr-1', connectorHash: 'sha256-abc', steps,
    source: '/api/run', durationMs: 250,
  });
  store.insert(evt);
  const [row] = store.list();
  expect(row.correlationId).toBe('corr-1');
  expect(row.connectorHash).toBe('sha256-abc');
  expect(row.steps).toEqual(steps);
  expect(row.source).toBe('/api/run');
});

it('inserts and retrieves config.changed fields', () => {
  const evt = createAuditEvent({
    type: 'config.changed', connector: '_system/config', user: 'alice',
    source: 'security.approvedHighRisk', previousValue: '[]', newValue: '["a/b"]',
  });
  store.insert(evt);
  const [row] = store.list();
  expect(row.previousValue).toBe('[]');
  expect(row.newValue).toBe('["a/b"]');
});

it('getById returns the event', () => {
  const evt = createAuditEvent({ type: 'command.start', connector: 'a/b', user: 'u' });
  store.insert(evt);
  const found = store.getById(evt.id);
  expect(found).toBeDefined();
  expect(found!.id).toBe(evt.id);
});

it('getById returns undefined for unknown id', () => {
  expect(store.getById('no-such-id')).toBeUndefined();
});

it('filters by type pattern', () => {
  store.insert(createAuditEvent({ type: 'command.start', connector: 'a/b', user: 'u' }));
  store.insert(createAuditEvent({ type: 'command.denied', connector: 'a/b', user: 'u' }));
  store.insert(createAuditEvent({ type: 'auth.failed', connector: '', user: 'u' }));
  expect(store.list({ type: 'command.*' })).toHaveLength(2);
  expect(store.list({ type: 'auth.failed' })).toHaveLength(1);
});

it('combines type filter with connector filter', () => {
  store.insert(createAuditEvent({ type: 'command.start', connector: 'a/b', user: 'u' }));
  store.insert(createAuditEvent({ type: 'command.start', connector: 'x/y', user: 'u' }));
  store.insert(createAuditEvent({ type: 'auth.failed', connector: '', user: 'u' }));
  expect(store.list({ type: 'command.*', connector: 'a/*' })).toHaveLength(1);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -w daemon -- --run`

Expected: Multiple failures — new fields undefined, `getById` not found, `type` filter not supported.

- [ ] **Step 3: Implement the AuditStore changes**

Replace `commandGarden/daemon/src/audit-store.ts` with:

```typescript
// src/audit-store.ts
import Database from 'better-sqlite3';
import { chmodSync, existsSync } from 'node:fs';
import type { AuditEvent, StepSummary } from '@commandgarden/shared';

export class AuditStore {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(`CREATE TABLE IF NOT EXISTS audit_events (
      id TEXT PRIMARY KEY, timestamp TEXT NOT NULL, type TEXT NOT NULL,
      user TEXT NOT NULL, connector TEXT NOT NULL, args TEXT NOT NULL,
      domains TEXT NOT NULL, capabilities TEXT NOT NULL, row_count INTEGER,
      columns TEXT, duration_ms INTEGER NOT NULL, error TEXT, denial_reason TEXT
    )`);
    this.migrate();
    if (dbPath !== ':memory:') {
      try { chmodSync(dbPath, 0o600); } catch { /* ignore for read-only fs */ }
    }
  }

  private migrate(): void {
    const cols = new Set(
      (this.db.pragma('table_info(audit_events)') as { name: string }[]).map(c => c.name),
    );
    const additions: [string, string][] = [
      ['correlation_id', 'TEXT'],
      ['connector_hash', 'TEXT'],
      ['steps', 'TEXT'],
      ['source', 'TEXT'],
      ['previous_value', 'TEXT'],
      ['new_value', 'TEXT'],
    ];
    for (const [name, type] of additions) {
      if (!cols.has(name)) {
        this.db.exec(`ALTER TABLE audit_events ADD COLUMN ${name} ${type}`);
      }
    }
  }

  insert(event: AuditEvent): void {
    this.db.prepare(
      `INSERT INTO audit_events (id, timestamp, type, user, connector, args, domains,
       capabilities, row_count, columns, duration_ms, error, denial_reason,
       correlation_id, connector_hash, steps, source, previous_value, new_value)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      event.id, event.timestamp, event.type, event.user, event.connector,
      JSON.stringify(event.args), JSON.stringify(event.domains),
      JSON.stringify(event.capabilities), event.rowCount ?? null,
      event.columns ? JSON.stringify(event.columns) : null,
      event.durationMs, event.error ?? null, event.denialReason ?? null,
      event.correlationId ?? null, event.connectorHash ?? null,
      event.steps ? JSON.stringify(event.steps) : null,
      event.source ?? null, event.previousValue ?? null, event.newValue ?? null,
    );
  }

  list(opts?: { connector?: string; since?: Date; limit?: number; type?: string }): AuditEvent[] {
    let sql = 'SELECT * FROM audit_events WHERE 1=1';
    const params: unknown[] = [];
    if (opts?.connector) { sql += ' AND connector LIKE ?'; params.push(opts.connector.replace('*', '%')); }
    if (opts?.type) { sql += ' AND type LIKE ?'; params.push(opts.type.replace('*', '%')); }
    if (opts?.since) { sql += ' AND timestamp >= ?'; params.push(opts.since.toISOString()); }
    sql += ' ORDER BY timestamp DESC';
    if (opts?.limit) { sql += ' LIMIT ?'; params.push(opts.limit); }
    return (this.db.prepare(sql).all(...params) as Record<string, unknown>[]).map(r => this.toEvent(r));
  }

  getById(id: string): AuditEvent | undefined {
    const row = this.db.prepare('SELECT * FROM audit_events WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    return row ? this.toEvent(row) : undefined;
  }

  prune(retentionDays: number): number {
    const cutoff = new Date(Date.now() - retentionDays * 86_400_000).toISOString();
    return this.db.prepare('DELETE FROM audit_events WHERE timestamp < ?').run(cutoff).changes;
  }

  close(): void { this.db.close(); }

  private toEvent(r: Record<string, unknown>): AuditEvent {
    return {
      id: r.id as string, timestamp: r.timestamp as string,
      type: r.type as AuditEvent['type'], user: r.user as string,
      connector: r.connector as string,
      args: JSON.parse(r.args as string), domains: JSON.parse(r.domains as string),
      capabilities: JSON.parse(r.capabilities as string),
      rowCount: r.row_count as number | undefined,
      columns: r.columns ? JSON.parse(r.columns as string) : undefined,
      durationMs: r.duration_ms as number,
      error: r.error as string | undefined,
      denialReason: r.denial_reason as string | undefined,
      correlationId: r.correlation_id as string | undefined,
      connectorHash: r.connector_hash as string | undefined,
      steps: r.steps ? JSON.parse(r.steps as string) as StepSummary[] : undefined,
      source: r.source as string | undefined,
      previousValue: r.previous_value as string | undefined,
      newValue: r.new_value as string | undefined,
    };
  }
}
```

- [ ] **Step 4: Update the test import to include StepSummary**

At top of `commandGarden/daemon/src/audit-store.test.ts`, ensure:

```typescript
import { createAuditEvent, type StepSummary } from '@commandgarden/shared';
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -w daemon -- --run`

Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add commandGarden/daemon/src/audit-store.ts commandGarden/daemon/src/audit-store.test.ts
git commit -m "feat(daemon): audit store schema migration, new columns, getById, type filter, file permissions"
```

---

### Task 4: Daemon — Registry `getWithMeta()` for Connector Hashing

**Files:**
- Modify: `commandGarden/daemon/src/registry.ts`
- Create: `commandGarden/daemon/src/registry.test.ts`

**Interfaces:**
- Consumes: nothing new
- Produces: `ConnectorRegistry.getWithMeta(key: string): { connector: ConnectorDef; yamlContent: string; filePath: string } | undefined`

- [ ] **Step 1: Write failing test**

Create `commandGarden/daemon/src/registry.test.ts`:

```typescript
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ConnectorRegistry } from './registry.js';

const YAML = `site: test
name: cmd
version: "1.0"
domains: ["example.com"]
capabilities: ["navigate"]
columns: [{ name: "id", type: "string" }]
pipeline:
  - step: navigate
    url: "https://example.com"
`;

describe('ConnectorRegistry.getWithMeta', () => {
  let tmpDir: string;

  afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

  it('returns connector, yamlContent, and filePath', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'cg-reg-'));
    writeFileSync(join(tmpDir, 'cmd.yaml'), YAML);
    const reg = new ConnectorRegistry([tmpDir]);
    reg.load();
    const meta = reg.getWithMeta('test/cmd');
    expect(meta).toBeDefined();
    expect(meta!.connector.site).toBe('test');
    expect(meta!.yamlContent).toBe(YAML);
    expect(meta!.filePath).toContain('cmd.yaml');
  });

  it('returns undefined for unknown key', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'cg-reg-'));
    const reg = new ConnectorRegistry([tmpDir]);
    reg.load();
    expect(reg.getWithMeta('no/such')).toBeUndefined();
  });

  it('produces stable hash from same content', () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'cg-reg-'));
    writeFileSync(join(tmpDir, 'cmd.yaml'), YAML);
    const reg = new ConnectorRegistry([tmpDir]);
    reg.load();
    const { createHash } = await import('node:crypto');
    const meta = reg.getWithMeta('test/cmd')!;
    const hash1 = createHash('sha256').update(meta.yamlContent).digest('hex');
    const hash2 = createHash('sha256').update(meta.yamlContent).digest('hex');
    expect(hash1).toBe(hash2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w daemon -- --run registry`

Expected: FAIL — `getWithMeta` is not a function.

- [ ] **Step 3: Implement `getWithMeta` in registry.ts**

In `commandGarden/daemon/src/registry.ts`, add a parallel Map and the method:

```typescript
// Add a new private field:
private meta = new Map<string, { yamlContent: string; filePath: string }>();

// Inside the load() for-loop, after the connectors.set() line, add:
this.meta.set(`${result.data.site}/${result.data.name}`, {
  yamlContent: content,
  filePath: join(resolved, file),
});

// Clear it at the top of load():
this.meta.clear();

// Add the method after keys():
getWithMeta(key: string): { connector: ConnectorDef; yamlContent: string; filePath: string } | undefined {
  const connector = this.connectors.get(key);
  const m = this.meta.get(key);
  if (!connector || !m) return undefined;
  return { connector, ...m };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -w daemon -- --run`

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add commandGarden/daemon/src/registry.ts commandGarden/daemon/src/registry.test.ts
git commit -m "feat(daemon): add getWithMeta to ConnectorRegistry for connector hashing"
```

---

### Task 5: Daemon — Server Hardening (Auth Logging, Correlation ID, Connector Hash, Audit-or-Fail)

**Files:**
- Modify: `commandGarden/daemon/src/server.ts`
- Modify: `commandGarden/daemon/src/server.test.ts`

**Interfaces:**
- Consumes: `AuditStore.getById()` and `type` filter from Task 3, `ConnectorRegistry.getWithMeta()` from Task 4, `createAuditEvent` with new fields from Task 1
- Produces:
  - `GET /api/audit` accepts `type` query parameter
  - `GET /api/audit/:id` returns single event
  - `preHandler` logs `auth.failed` events
  - `/api/run` uses `correlationId` and `connectorHash`
  - `/api/run` rejects if `command.start` audit insert fails

- [ ] **Step 1: Write failing tests for auth failure logging**

Add to `commandGarden/daemon/src/server.test.ts`:

```typescript
it('logs auth.failed event for missing CSRF header', async () => {
  const app = await createServer(deps);
  await app.inject({
    method: 'POST', url: '/api/run',
    headers: { authorization: 'Bearer test-token-abc' },
    payload: { connector: 'test/cmd', args: {} },
  });
  const events = deps.auditStore.list({ type: 'auth.failed' });
  expect(events).toHaveLength(1);
  expect(events[0].type).toBe('auth.failed');
  expect(events[0].source).toBe('/api/run');
});

it('logs auth.failed event for invalid token', async () => {
  const app = await createServer(deps);
  await app.inject({
    method: 'POST', url: '/api/run',
    headers: { 'x-commandgarden': '1', authorization: 'Bearer wrong' },
    payload: { connector: 'test/cmd', args: {} },
  });
  const events = deps.auditStore.list({ type: 'auth.failed' });
  expect(events).toHaveLength(1);
});
```

- [ ] **Step 2: Write failing tests for correlation ID and connector hash**

```typescript
it('command.start and command.denied share no correlationId (denied has none)', async () => {
  const app = await createServer(deps);
  await app.inject({
    method: 'POST', url: '/api/run',
    headers: { 'x-commandgarden': '1', authorization: 'Bearer test-token-abc' },
    payload: { connector: 'no/such', args: {} },
  });
  const events = deps.auditStore.list();
  expect(events).toHaveLength(1);
  expect(events[0].type).toBe('command.denied');
});

it('GET /api/audit supports type filter', async () => {
  const app = await createServer(deps);
  deps.auditStore.insert(createAuditEvent({ type: 'auth.failed', connector: '', user: 'u', source: '/api/run' }));
  deps.auditStore.insert(createAuditEvent({ type: 'command.denied', connector: 'no/such', user: 'u' }));
  const res = await app.inject({
    method: 'GET', url: '/api/audit?type=auth.failed',
    headers: { 'x-commandgarden': '1', authorization: 'Bearer test-token-abc' },
  });
  const body = JSON.parse(res.body);
  expect(body.events).toHaveLength(1);
  expect(body.events[0].type).toBe('auth.failed');
});

it('GET /api/audit/:id returns single event', async () => {
  const app = await createServer(deps);
  const evt = createAuditEvent({ type: 'command.start', connector: 'a/b', user: 'u' });
  deps.auditStore.insert(evt);
  const res = await app.inject({
    method: 'GET', url: `/api/audit/${evt.id}`,
    headers: { 'x-commandgarden': '1', authorization: 'Bearer test-token-abc' },
  });
  expect(res.statusCode).toBe(200);
  const body = JSON.parse(res.body);
  expect(body.ok).toBe(true);
  expect(body.event.id).toBe(evt.id);
});

it('GET /api/audit/:id returns 404 for unknown', async () => {
  const app = await createServer(deps);
  const res = await app.inject({
    method: 'GET', url: '/api/audit/no-such-id',
    headers: { 'x-commandgarden': '1', authorization: 'Bearer test-token-abc' },
  });
  expect(res.statusCode).toBe(404);
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test -w daemon -- --run`

Expected: Multiple failures.

- [ ] **Step 4: Implement server changes**

In `commandGarden/daemon/src/server.ts`:

**Add import:**
```typescript
import { createHash } from 'node:crypto';
```

**Update `preHandler` hook** to log auth failures:

```typescript
app.addHook('preHandler', async (req, reply) => {
  if (req.url === '/api/status' || req.url === '/ws/extension') return;
  const csrf = req.headers['x-commandgarden'];
  if (!csrf) {
    try { deps.auditStore.insert(createAuditEvent({ type: 'auth.failed', connector: '', user, source: req.url })); } catch { /* audit best-effort for auth failures */ }
    reply.code(403).send({ ok: false, error: 'Missing X-CommandGarden header' }); return;
  }
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    try { deps.auditStore.insert(createAuditEvent({ type: 'auth.failed', connector: '', user, source: req.url })); } catch { /* audit best-effort */ }
    reply.code(401).send({ ok: false, error: 'Unauthorized' }); return;
  }
  if (!validateToken(auth.slice(7), deps.sessionToken)) {
    try { deps.auditStore.insert(createAuditEvent({ type: 'auth.failed', connector: '', user, source: req.url })); } catch { /* audit best-effort */ }
    reply.code(401).send({ ok: false, error: 'Invalid token' }); return;
  }
});
```

**Update `GET /api/audit`** to accept `type` parameter:

```typescript
app.get('/api/audit', async (req) => {
  const query = req.query as Record<string, string>;
  const since = query.since ? new Date(query.since) : undefined;
  const connector = query.connector;
  const type = query.type;
  const limit = query.limit ? parseInt(query.limit, 10) : 100;
  const events = deps.auditStore.list({ since, connector, type, limit });
  return { ok: true, events, count: events.length };
});
```

**Add `GET /api/audit/:id`:**

```typescript
app.get('/api/audit/:id', async (req, reply) => {
  const { id } = req.params as { id: string };
  const event = deps.auditStore.getById(id);
  if (!event) {
    reply.code(404).send({ ok: false, error: 'Event not found' }); return;
  }
  return { ok: true, event };
});
```

**Update `/api/run` handler** to add correlation ID, connector hash, steps, and audit-or-fail:

In the `POST /api/run` handler, after `const connector = validation.connector!;`, add:

```typescript
const { randomUUID } = await import('node:crypto');
const correlationId = randomUUID();
const meta = deps.registry.getWithMeta(body.connector);
const connectorHash = meta
  ? createHash('sha256').update(meta.yamlContent).digest('hex').slice(0, 16)
  : undefined;
```

Wrap the `command.start` insert in try/catch for audit-or-fail:

```typescript
try {
  deps.auditStore.insert(createAuditEvent({
    type: 'command.start', connector: body.connector, user,
    args: body.args as Record<string, string>,
    domains: connector.domains, capabilities: [...connector.capabilities],
    correlationId, connectorHash,
  }));
} catch (err) {
  reply.code(500).send({ ok: false, error: 'Audit system unavailable — command blocked' }); return;
}
```

In `runPipeline`, add `correlationId`, `connectorHash`, and `steps` to the success/error inserts:

```typescript
// In the success path:
deps.auditStore.insert(createAuditEvent({
  type: resp.ok ? 'command.success' : 'command.error',
  connector: body.connector, user,
  args: body.args as Record<string, string>,
  domains: connector.domains, capabilities: [...connector.capabilities],
  rowCount: resp.data.length,
  columns: connector.columns?.map(c => c.name),
  durationMs, error: resp.error,
  correlationId, connectorHash, steps: resp.steps,
}));

// In the catch path:
deps.auditStore.insert(createAuditEvent({
  type: 'command.error', connector: body.connector, user,
  args: body.args as Record<string, string>, durationMs, error,
  correlationId, connectorHash,
}));
```

Move the `const { randomUUID }` import to the top of the `POST /api/run` handler (it's now used for both correlationId and the approval requestId).

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -w daemon -- --run`

Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add commandGarden/daemon/src/server.ts commandGarden/daemon/src/server.test.ts
git commit -m "feat(daemon): auth failure logging, correlation ID, connector hash, audit-or-fail, type filter, audit show endpoint"
```

---

### Task 6: Daemon — Approval Logging and Pruning Audit Event

**Files:**
- Modify: `commandGarden/daemon/src/server.ts`
- Modify: `commandGarden/daemon/src/main.ts`
- Modify: `commandGarden/daemon/src/server.test.ts`

**Interfaces:**
- Consumes: `createAuditEvent` with `source`, `previousValue`, `newValue` from Task 1
- Produces: `approval.granted`/`approval.rejected` events in audit store; pruning synthetic event on daemon start

- [ ] **Step 1: Write failing test for approval logging**

Add to `commandGarden/daemon/src/server.test.ts`:

```typescript
it('logs approval.granted when approval resolves true', async () => {
  const app = await createServer(deps);
  // Simulate: insert an approval event directly to verify the shape
  deps.auditStore.insert(createAuditEvent({
    type: 'approval.granted', connector: 'test/cmd', user: 'u',
    correlationId: 'corr-1', source: 'cli',
  }));
  const events = deps.auditStore.list({ type: 'approval.granted' });
  expect(events).toHaveLength(1);
  expect(events[0].source).toBe('cli');
  expect(events[0].correlationId).toBe('corr-1');
});
```

- [ ] **Step 2: Implement approval logging in server.ts**

In the `POST /api/approval` handler, after `const resolved = deps.wsRelay.resolveApproval(...)`, add:

```typescript
const pending = deps.wsRelay.getPendingApproval(body.approvalId);
try {
  deps.auditStore.insert(createAuditEvent({
    type: body.approved ? 'approval.granted' : 'approval.rejected',
    connector: pending?.request.connectorKey ?? '',
    user,
    source: 'cli',
    correlationId: pending?.request.requestId,
  }));
} catch { /* audit best-effort for approvals */ }
```

Note: The `getPendingApproval` call must happen **before** `resolveApproval` deletes the entry. Reorder: look up first, then resolve.

In the `wsRelay.onApprovalRequest` callback (where extension approval responses arrive via WebSocket), add similar logging with `source: 'extension'`. This requires listening for the approval resolution. The simplest approach: in the `resolveApproval` call in the `POST /api/approval` handler, the source is 'cli'. For extension-originated responses, they're handled in `ws-relay.ts` when an `ApprovalResponse` comes in — the server needs to log there too.

Add to the `onApprovalRequest` handler area:

```typescript
deps.wsRelay.onApprovalResolved((approvalId: string, approved: boolean, request: ApprovalRequest) => {
  try {
    deps.auditStore.insert(createAuditEvent({
      type: approved ? 'approval.granted' : 'approval.rejected',
      connector: request.connectorKey,
      user,
      source: 'extension',
      correlationId: request.requestId,
    }));
  } catch { /* audit best-effort */ }
});
```

This requires adding `onApprovalResolved` to `WsRelay` — a callback that fires when an extension-originated `ApprovalResponse` is handled. Add to `ws-relay.ts`:

```typescript
private approvalResolvedHandler: ((id: string, approved: boolean, req: ApprovalRequest) => void) | null = null;

onApprovalResolved(handler: (id: string, approved: boolean, req: ApprovalRequest) => void): void {
  this.approvalResolvedHandler = handler;
}
```

And in the `isApprovalResponse` branch of `attach()`, before resolving, call:

```typescript
if (this.approvalResolvedHandler) {
  this.approvalResolvedHandler(data.approvalId, data.approved, entry.request);
}
```

- [ ] **Step 3: Implement pruning audit event in main.ts**

In `commandGarden/daemon/src/main.ts`, after the `prune()` call:

```typescript
const pruned = auditStore.prune(config.audit.retentionDays);
if (pruned > 0) {
  console.log(`Pruned ${pruned} old audit events`);
  auditStore.insert(createAuditEvent({
    type: 'config.changed', connector: '_system/prune', user: userInfo().username,
    source: 'audit.prune',
    previousValue: String(pruned), newValue: '0',
    args: { retentionDays: String(config.audit.retentionDays) },
  }));
}
```

Add imports at top of `main.ts`:

```typescript
import { createAuditEvent } from '@commandgarden/shared';
import { userInfo } from 'node:os';
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -w daemon -- --run`

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add commandGarden/daemon/src/server.ts commandGarden/daemon/src/server.test.ts commandGarden/daemon/src/ws-relay.ts commandGarden/daemon/src/main.ts
git commit -m "feat(daemon): approval logging, pruning audit event"
```

---

### Task 7: Extension — Step Summary Collection in PipelineRunner

**Files:**
- Modify: `commandGarden/chrome/src/pipeline/runner.ts`
- Modify: `commandGarden/chrome/src/pipeline/runner.test.ts`

**Interfaces:**
- Consumes: `StepSummary` from Task 1, `ExtensionResponse.steps` from Task 2
- Produces: `PipelineRunner.run()` returns `ExtensionResponse` with `steps` populated

- [ ] **Step 1: Write failing tests for step summaries**

Add to `commandGarden/chrome/src/pipeline/runner.test.ts`:

```typescript
it('includes step summaries in successful response', async () => {
  const adapter = mockAdapter({
    executeInContent: vi.fn().mockResolvedValue([{ name: 'Alice' }]),
  });
  const runner = new PipelineRunner(adapter);
  const connector = makeConnector([
    { step: 'navigate', url: 'https://example.com' },
    { step: 'extract', selector: 'tr', fields: { name: 'td' } },
  ]);
  const result = await runner.run(connector, {});
  expect(result.ok).toBe(true);
  expect(result.steps).toBeDefined();
  expect(result.steps).toHaveLength(2);
  expect(result.steps![0].step).toBe('navigate');
  expect(result.steps![0].index).toBe(0);
  expect(result.steps![0].capability).toBe('navigate');
  expect(result.steps![0].durationMs).toBeGreaterThanOrEqual(0);
  expect(result.steps![1].step).toBe('extract');
  expect(result.steps![1].index).toBe(1);
});

it('includes step summaries on error with failed step marked', async () => {
  const adapter = mockAdapter({
    navigateTab: vi.fn().mockResolvedValue(1),
    waitForTabLoad: vi.fn().mockResolvedValue(undefined),
    executeInContent: vi.fn().mockRejectedValue(new Error('DOM error')),
  });
  const runner = new PipelineRunner(adapter);
  const connector = makeConnector([
    { step: 'navigate', url: 'https://example.com' },
    { step: 'extract', selector: 'tr', fields: { name: 'td' } },
  ]);
  const result = await runner.run(connector, {});
  expect(result.ok).toBe(false);
  expect(result.steps).toBeDefined();
  expect(result.steps).toHaveLength(2);
  expect(result.steps![0].error).toBeUndefined();
  expect(result.steps![1].error).toContain('DOM error');
});

it('steps with no capability have capability undefined', async () => {
  const adapter = mockAdapter({
    executeInContent: vi.fn().mockResolvedValue([{ name: 'A', score: 5 }]),
  });
  const runner = new PipelineRunner(adapter);
  const connector = makeConnector([
    { step: 'navigate', url: 'https://example.com' },
    { step: 'extract', selector: 'tr', fields: { name: 'td' } },
    { step: 'map', fields: { title: '${{ row.name }}' } },
  ]);
  const result = await runner.run(connector, {});
  expect(result.steps![2].step).toBe('map');
  expect(result.steps![2].capability).toBeUndefined();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -w chrome -- --run`

Expected: `result.steps` is undefined.

- [ ] **Step 3: Implement step summary collection**

In `commandGarden/chrome/src/pipeline/runner.ts`, update the `run` method:

Add import at top:

```typescript
import type { StepSummary } from '@commandgarden/shared';
```

In the `run()` method, add `stepSummaries` array and timing:

```typescript
async run(
  connector: ConnectorDef,
  args: Record<string, string | number | boolean>,
): Promise<ExtensionResponse> {
  const ctx = new PipelineContext(args);
  let tabId = -1;
  const stepSummaries: StepSummary[] = [];

  try {
    for (let i = 0; i < connector.pipeline.length; i++) {
      const step = connector.pipeline[i];
      await this.checkApproval(step, i);
      const stepStart = Date.now();
      try {
        switch (step.step) {
          // ... existing cases unchanged ...
        }
        stepSummaries.push({
          step: step.step, index: i,
          capability: STEP_CAPABILITY_MAP[step.step] ?? undefined,
          durationMs: Date.now() - stepStart,
        });
      } catch (err) {
        stepSummaries.push({
          step: step.step, index: i,
          capability: STEP_CAPABILITY_MAP[step.step] ?? undefined,
          durationMs: Date.now() - stepStart,
          error: err instanceof Error ? err.message : String(err),
        });
        throw err;
      }
    }
    return { id: '', ok: true, data: ctx.getData(), steps: stepSummaries };
  } catch (err) {
    return { id: '', ok: false, data: [], error: err instanceof Error ? err.message : String(err), steps: stepSummaries };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -w chrome -- --run`

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add commandGarden/chrome/src/pipeline/runner.ts commandGarden/chrome/src/pipeline/runner.test.ts
git commit -m "feat(chrome): collect step summaries in PipelineRunner"
```

---

### Task 8: CLI — `--type` Filter, `audit show`, CSV Export Fix

**Files:**
- Modify: `commandGarden/cli/src/commands/audit.ts`
- Modify: `commandGarden/cli/src/commands/audit.test.ts`
- Modify: `commandGarden/cli/src/main.ts`

**Interfaces:**
- Consumes: `GET /api/audit?type=...` and `GET /api/audit/:id` from Task 5, `AuditEvent` with new fields from Task 1
- Produces:
  - `executeAuditList` accepts `type?: string` in filter
  - `executeAuditShow(client, id): Promise<string>` — new function
  - `cg audit list --type <pattern>` CLI option
  - `cg audit show <id>` CLI subcommand
  - CSV export includes all columns

- [ ] **Step 1: Write failing tests**

Add to `commandGarden/cli/src/commands/audit.test.ts`:

```typescript
import { executeAuditList, executeAuditExport, executeAuditShow } from './audit.js';

// Update EVENTS to include new fields:
const EVENTS_WITH_STEPS = [
  {
    id: 'evt-1', timestamp: '2026-06-24T10:00:00Z', type: 'command.success',
    user: 'alice', connector: 'test/cmd', args: {}, domains: ['example.com'],
    capabilities: ['navigate'], rowCount: 5, durationMs: 120,
    correlationId: 'corr-1', connectorHash: 'abc123',
    steps: [
      { step: 'navigate', index: 0, capability: 'navigate', durationMs: 80 },
      { step: 'extract', index: 1, capability: 'dom_read', durationMs: 40 },
    ],
  },
];

describe('executeAuditList — type filter', () => {
  it('passes type parameter', async () => {
    const client = mockClient();
    await executeAuditList(client, { type: 'auth.failed' });
    expect(client.get).toHaveBeenCalledWith(expect.stringContaining('type=auth.failed'));
  });
});

describe('executeAuditShow', () => {
  it('displays full event detail with steps', async () => {
    const client = {
      get: vi.fn().mockResolvedValue({ ok: true, event: EVENTS_WITH_STEPS[0] }),
    } as unknown as DaemonClient;
    const output = await executeAuditShow(client, 'evt-1');
    expect(output).toContain('evt-1');
    expect(output).toContain('command.success');
    expect(output).toContain('navigate');
    expect(output).toContain('extract');
    expect(output).toContain('abc123');
  });

  it('returns error for unknown event', async () => {
    const client = {
      get: vi.fn().mockRejectedValue(new Error('Event not found')),
    } as unknown as DaemonClient;
    const output = await executeAuditShow(client, 'no-such');
    expect(output).toContain('Error');
  });
});

describe('executeAuditExport — expanded CSV columns', () => {
  it('includes correlationId and connectorHash in CSV', async () => {
    const client = {
      get: vi.fn().mockResolvedValue({ ok: true, events: EVENTS_WITH_STEPS, count: 1 }),
    } as unknown as DaemonClient;
    const output = await executeAuditExport(client, {}, 'csv');
    expect(output).toContain('correlationId');
    expect(output).toContain('connectorHash');
    expect(output).toContain('corr-1');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -w cli -- --run`

Expected: `executeAuditShow` not found, type filter not passed, CSV columns missing.

- [ ] **Step 3: Implement audit.ts changes**

Update `commandGarden/cli/src/commands/audit.ts`:

Add `type` to `AuditFilter` and `buildQueryString`:

```typescript
interface AuditFilter {
  since?: string;
  connector?: string;
  type?: string;
  limit?: number;
}

function buildQueryString(filter: AuditFilter): string {
  const params = new URLSearchParams();
  if (filter.since) params.set('since', filter.since);
  if (filter.connector) params.set('connector', filter.connector);
  if (filter.type) params.set('type', filter.type);
  if (filter.limit) params.set('limit', String(filter.limit));
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}
```

Add `Source` column to the table in `executeAuditList`:

```typescript
const table = new Table({
  head: ['Timestamp', 'Type', 'Connector', 'User', 'Duration', 'Rows', 'Source', 'Error'],
  style: { head: ['cyan'] },
});
for (const e of resp.events) {
  table.push([
    e.timestamp.replace('T', ' ').slice(0, 19),
    e.type,
    e.connector,
    e.user,
    `${e.durationMs}ms`,
    e.rowCount?.toString() ?? '-',
    e.source ?? '-',
    e.error ?? e.denialReason ?? '',
  ]);
}
```

Update `AUDIT_COLUMNS`:

```typescript
const AUDIT_COLUMNS = [
  'id', 'timestamp', 'type', 'user', 'connector', 'durationMs', 'rowCount',
  'error', 'denialReason', 'correlationId', 'connectorHash', 'source',
  'args', 'domains', 'capabilities', 'steps',
];
```

In `executeAuditExport` CSV serialization, handle JSON fields:

```typescript
const val = (e as unknown as Record<string, unknown>)[col];
let str: string;
if (val === null || val === undefined) {
  str = '';
} else if (typeof val === 'object') {
  str = JSON.stringify(val);
} else {
  str = String(val);
}
return str.includes(',') || str.includes('"') || str.includes('\n')
  ? `"${str.replace(/"/g, '""')}"` : str;
```

Add `executeAuditShow`:

```typescript
export async function executeAuditShow(
  client: DaemonClient,
  id: string,
): Promise<string> {
  try {
    const resp = await client.get<{ ok: boolean; event: AuditEvent }>(`/api/audit/${id}`);
    const e = resp.event;
    const lines: string[] = [
      `Event: ${e.id}`,
      `Type: ${e.type}`,
      `Connector: ${e.connector}${e.connectorHash ? ` (hash: ${e.connectorHash})` : ''}`,
      `Correlation: ${e.correlationId ?? '-'}`,
      `User: ${e.user}`,
      `Timestamp: ${e.timestamp.replace('T', ' ').slice(0, 19)}`,
      `Duration: ${e.durationMs}ms`,
    ];
    if (e.rowCount !== undefined) lines.push(`Rows: ${e.rowCount}`);
    if (e.error) lines.push(`Error: ${e.error}`);
    if (e.denialReason) lines.push(`Denial: ${e.denialReason}`);
    if (e.source) lines.push(`Source: ${e.source}`);
    if (e.previousValue !== undefined) lines.push(`Previous: ${e.previousValue}`);
    if (e.newValue !== undefined) lines.push(`New: ${e.newValue}`);
    if (Object.keys(e.args).length > 0) {
      lines.push(`Args: ${JSON.stringify(e.args)}`);
    }
    if (e.steps && e.steps.length > 0) {
      lines.push('');
      lines.push('Pipeline Steps:');
      const stepTable = new Table({
        head: ['#', 'Step', 'Capability', 'Duration', 'Error'],
        style: { head: ['cyan'] },
      });
      for (const s of e.steps) {
        stepTable.push([
          s.index + 1,
          s.step,
          s.capability ?? '-',
          `${s.durationMs}ms`,
          s.error ?? '',
        ]);
      }
      lines.push(stepTable.toString());
    }
    return lines.join('\n');
  } catch (err) {
    return `Error: ${err instanceof Error ? err.message : String(err)}`;
  }
}
```

- [ ] **Step 4: Register `audit show` and `--type` in main.ts**

In `commandGarden/cli/src/main.ts`:

Update import:

```typescript
import { executeAuditList, executeAuditExport, executeAuditShow } from './commands/audit.js';
```

Add `--type` to `audit list` and `audit export`:

```typescript
audit
  .command('list')
  .description('List recent audit events')
  .option('--since <duration>', 'time window, e.g. 7d, 2w, 12h')
  .option('--connector <pattern>', 'filter by connector pattern, e.g. test/*')
  .option('--type <pattern>', 'filter by event type, e.g. auth.failed, command.*')
  .option('--limit <n>', 'max events to return', '100')
  .action(async (opts: { since?: string; connector?: string; type?: string; limit: string }) => {
    const client = createClient();
    const filter: { since?: string; connector?: string; type?: string; limit?: number } = {};
    if (opts.since) filter.since = parseDuration(opts.since).toISOString();
    if (opts.connector) filter.connector = opts.connector;
    if (opts.type) filter.type = opts.type;
    filter.limit = parseInt(opts.limit, 10);
    console.log(await executeAuditList(client, filter));
  });
```

Add `--type` to `audit export` similarly.

Add `audit show`:

```typescript
audit
  .command('show <id>')
  .description('Show full details of an audit event')
  .action(async (id: string) => {
    const client = createClient();
    console.log(await executeAuditShow(client, id));
  });
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -w cli -- --run`

Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add commandGarden/cli/src/commands/audit.ts commandGarden/cli/src/commands/audit.test.ts commandGarden/cli/src/main.ts
git commit -m "feat(cli): add --type filter, audit show command, expand CSV columns"
```

---

### Task 9: Daemon — Config Change Logging via API

**Files:**
- Modify: `commandGarden/daemon/src/server.ts`
- Modify: `commandGarden/daemon/src/server.test.ts`
- Modify: `commandGarden/cli/src/commands/config-cmd.ts`
- Modify: `commandGarden/cli/src/commands/config-cmd.test.ts`
- Modify: `commandGarden/cli/src/main.ts`

**Interfaces:**
- Consumes: `AuditStore` from Task 3, `createAuditEvent` from Task 1
- Produces:
  - `POST /api/config` endpoint — accepts `{ key, value }`, writes config, logs `config.changed`
  - `executeConfigSet` updated to call daemon API instead of writing file directly

- [ ] **Step 1: Write failing test for config endpoint**

Add to `commandGarden/daemon/src/server.test.ts`:

```typescript
it('POST /api/config logs config.changed audit event', async () => {
  const app = await createServer(deps);
  const res = await app.inject({
    method: 'POST', url: '/api/config',
    headers: { 'x-commandgarden': '1', authorization: 'Bearer test-token-abc' },
    payload: { key: 'audit.retentionDays', value: '180' },
  });
  expect(res.statusCode).toBe(200);
  const events = deps.auditStore.list({ type: 'config.changed' });
  expect(events).toHaveLength(1);
  expect(events[0].source).toBe('audit.retentionDays');
  expect(events[0].newValue).toBe('180');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w daemon -- --run`

Expected: 404 — `/api/config` doesn't exist.

- [ ] **Step 3: Implement `POST /api/config`**

In `commandGarden/daemon/src/server.ts`, add the endpoint. This requires the config file path, so add `configPath` to `ServerDeps`:

```typescript
export interface ServerDeps {
  config: DaemonConfig;
  configPath: string;  // NEW
  sessionToken: string;
  registry: ConnectorRegistry;
  auditStore: AuditStore;
  wsRelay: WsRelay;
}
```

Add the endpoint:

```typescript
app.post('/api/config', async (req, reply) => {
  const body = req.body as { key?: string; value?: string };
  if (!body.key || body.value === undefined) {
    reply.code(400).send({ ok: false, error: 'Missing key or value' }); return;
  }
  const parts = body.key.split('.');
  if (parts.length !== 2) {
    reply.code(400).send({ ok: false, error: 'Key must be section.property' }); return;
  }

  // Read current config, get old value
  const { readFileSync, writeFileSync, mkdirSync, existsSync } = await import('node:fs');
  const { dirname } = await import('node:path');
  const { parse: parseYaml, stringify: stringifyYaml } = await import('yaml');

  let config: Record<string, Record<string, unknown>> = {};
  if (existsSync(deps.configPath)) {
    config = (parseYaml(readFileSync(deps.configPath, 'utf-8')) as Record<string, Record<string, unknown>>) ?? {};
  }

  const [section, prop] = parts;
  const previousValue = JSON.stringify(config[section]?.[prop] ?? null);

  if (!config[section]) config[section] = {};
  let parsed: unknown = body.value;
  if (body.value === 'true') parsed = true;
  else if (body.value === 'false') parsed = false;
  else if (!isNaN(Number(body.value)) && body.value !== '') parsed = Number(body.value);
  config[section][prop] = parsed;

  mkdirSync(dirname(deps.configPath), { recursive: true });
  writeFileSync(deps.configPath, stringifyYaml(config), 'utf-8');

  deps.auditStore.insert(createAuditEvent({
    type: 'config.changed', connector: '_system/config', user,
    source: body.key, previousValue, newValue: JSON.stringify(parsed),
  }));

  return { ok: true, key: body.key, value: body.value };
});
```

Update the test `makeDeps` to include `configPath`:

```typescript
function makeDeps(tmpDir: string): ServerDeps {
  writeFileSync(join(tmpDir, 'cmd.yaml'), CONN_YAML);
  const registry = new ConnectorRegistry([tmpDir]);
  registry.load();
  return {
    config: configSchema.parse({}),
    configPath: join(tmpDir, 'config.yaml'),
    sessionToken: 'test-token-abc',
    registry,
    auditStore: new AuditStore(':memory:'),
    wsRelay: new WsRelay(),
  };
}
```

Update `main.ts` to pass `configPath` to `createServer`:

```typescript
const configPath = join(cgHome, 'config.yaml');
const config = loadConfig(configPath);
// ...
const app = await createServer({ config, configPath, sessionToken, registry, auditStore, wsRelay });
```

- [ ] **Step 4: Update CLI `config set` to use daemon API**

In `commandGarden/cli/src/commands/config-cmd.ts`, update `executeConfigSet` to optionally use a `DaemonClient`:

```typescript
export async function executeConfigSet(
  client: DaemonClient,
  key: string,
  value: string,
): Promise<string> {
  try {
    await client.post('/api/config', { key, value });
    return `Set ${key} = ${value}`;
  } catch (err) {
    return `Error: ${err instanceof Error ? err.message : String(err)}`;
  }
}
```

Update `main.ts` to pass `createClient()` to `executeConfigSet`:

```typescript
config
  .command('set <key> <value>')
  .description('Set a configuration value (e.g. daemon.port 9999)')
  .action(async (key: string, value: string) => {
    const client = createClient();
    console.log(await executeConfigSet(client, key, value));
  });
```

Update `config-cmd.test.ts` to mock the client.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -w daemon -- --run && npm test -w cli -- --run`

Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add commandGarden/daemon/src/server.ts commandGarden/daemon/src/server.test.ts commandGarden/daemon/src/main.ts commandGarden/cli/src/commands/config-cmd.ts commandGarden/cli/src/commands/config-cmd.test.ts commandGarden/cli/src/main.ts
git commit -m "feat: audited config changes via POST /api/config"
```

---

### Task 10: Full Build & Integration Verification

**Files:** None new — verification only.

**Interfaces:**
- Consumes: All previous tasks

- [ ] **Step 1: Build all packages**

Run: `npm run build` (from `commandGarden/`)

Expected: Clean build, no type errors.

- [ ] **Step 2: Run all tests**

Run: `npm test` (from `commandGarden/`)

Expected: All tests PASS across shared, daemon, cli, chrome.

- [ ] **Step 3: Verify backward compatibility**

Open an existing `audit.db` with the new code (the migration should add columns without data loss). This is already tested in Task 3 via `:memory:` but verify manually if an existing db file exists.

- [ ] **Step 4: Final commit if any fixups needed**

```bash
git add -A && git commit -m "fix: integration fixups for audit hardening" --allow-empty
```
