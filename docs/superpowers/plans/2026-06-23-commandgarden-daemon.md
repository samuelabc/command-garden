# commandGarden Daemon Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the commandGarden daemon — a localhost HTTP + WebSocket relay that validates CLI requests against connector security declarations, forwards them to the Chrome extension, and logs structured audit events to SQLite.

**Architecture:** Fastify HTTP server accepts JSON commands from CLI, validates auth tokens and connector capabilities, then relays requests to Chrome extension over WebSocket. All operations logged as structured audit events in SQLite. Binds exclusively to 127.0.0.1 with per-session auth tokens.

**Tech Stack:** TypeScript 5.4, Fastify 5.x, @fastify/websocket 11.x, better-sqlite3 11.x, yaml 2.x, Vitest 2.x, Zod 3.23 (via @commandgarden/shared)

**Branch:** `feat/commandgarden-daemon` (branch from `feat/commandgarden-shared`)

**Depends on:** `@commandgarden/shared` (Plan 1 — completed, 97 tests passing)

---

## File Map

```
commandGarden/daemon/
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── src/
    ├── main.ts               # Entry point: bootstrap, PID file, graceful shutdown
    ├── config.ts             # Zod schema for config.yaml + loader with defaults
    ├── config.test.ts
    ├── auth.ts               # Session token generation, file I/O, validation
    ├── auth.test.ts
    ├── audit-store.ts        # SQLite-backed AuditEvent CRUD, filter, prune
    ├── audit-store.test.ts
    ├── registry.ts           # ConnectorRegistry: scan dirs, load YAMLs, index by key
    ├── registry.test.ts
    ├── validator.ts          # Request validation: connector exists, high-risk approval
    ├── validator.test.ts
    ├── ws-relay.ts           # WebSocket relay: extension connection, request/response
    ├── ws-relay.test.ts
    ├── server.ts             # createServer(): Fastify + WS + routes + hooks
    └── server.test.ts        # HTTP routes, auth, CSRF, body limits, integration
```

---

## Task 1: Daemon Package Scaffold

**Files:**
- Create: `commandGarden/daemon/package.json`
- Create: `commandGarden/daemon/tsconfig.json`
- Create: `commandGarden/daemon/vitest.config.ts`
- Create: `commandGarden/daemon/src/main.ts`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "@commandgarden/daemon",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./dist/main.js",
  "scripts": {
    "build": "tsc",
    "start": "node dist/main.js",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@commandgarden/shared": "*",
    "better-sqlite3": "^11.0.0",
    "fastify": "^5.0.0",
    "@fastify/websocket": "^11.0.0",
    "yaml": "^2.4.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.0",
    "@types/node": "^22.0.0",
    "@types/ws": "^8.5.0",
    "typescript": "^5.4.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": { "outDir": "./dist", "rootDir": "./src" },
  "include": ["src/**/*.ts"],
  "exclude": ["src/**/*.test.ts"]
}
```

- [ ] **Step 3: Create `vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['src/**/*.test.ts'] } });
```

- [ ] **Step 4: Create placeholder `src/main.ts`**

```typescript
// Entry point — populated in Task 9
console.log('commandGarden daemon');
```

- [ ] **Step 5: Install deps and verify**

Run: `npm install` from `commandGarden/daemon/`
Run: `npx tsc --noEmit`
Expected: both exit 0

- [ ] **Step 6: Commit**

```bash
git add commandGarden/daemon/
git commit -m "chore: scaffold @commandgarden/daemon package"
```

---

## Task 2: Config Module (TDD)

**Files:** Create `src/config.ts`, `src/config.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/config.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadConfig, configSchema, expandHome } from './config.js';

describe('configSchema', () => {
  it('parses empty object with all defaults', () => {
    const c = configSchema.parse({});
    expect(c.daemon.port).toBe(19825);
    expect(c.daemon.host).toBe('127.0.0.1');
    expect(c.security.highRiskCapabilities).toEqual(['js_evaluate', 'cookie_write']);
    expect(c.audit.retentionDays).toBe(90);
    expect(c.output.defaultFormat).toBe('table');
  });

  it('overrides specific fields keeping other defaults', () => {
    const c = configSchema.parse({ daemon: { port: 9999 } });
    expect(c.daemon.port).toBe(9999);
    expect(c.daemon.host).toBe('127.0.0.1');
  });

  it('rejects invalid port', () => {
    expect(configSchema.safeParse({ daemon: { port: 99999 } }).success).toBe(false);
  });

  it('rejects invalid output format', () => {
    expect(configSchema.safeParse({ output: { defaultFormat: 'xml' } }).success).toBe(false);
  });
});

describe('expandHome', () => {
  it('expands ~ to home directory', () => {
    const r = expandHome('~/foo');
    expect(r).not.toContain('~');
    expect(r).toContain('foo');
  });

  it('leaves absolute paths unchanged', () => {
    expect(expandHome('/usr/local')).toBe('/usr/local');
  });
});

describe('loadConfig', () => {
  let tmpDir: string;
  beforeEach(() => { tmpDir = mkdtempSync(join(tmpdir(), 'cg-cfg-')); });
  afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

  it('returns defaults when file missing', () => {
    expect(loadConfig(join(tmpDir, 'no.yaml')).daemon.port).toBe(19825);
  });

  it('loads valid YAML config', () => {
    const p = join(tmpDir, 'config.yaml');
    writeFileSync(p, 'daemon:\n  port: 8080\nsecurity:\n  extensionId: "ext1"');
    const c = loadConfig(p);
    expect(c.daemon.port).toBe(8080);
    expect(c.security.extensionId).toBe('ext1');
    expect(c.audit.retentionDays).toBe(90);
  });

  it('handles empty YAML file', () => {
    const p = join(tmpDir, 'config.yaml');
    writeFileSync(p, '');
    expect(loadConfig(p).daemon.port).toBe(19825);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npx vitest run src/config.test.ts`

- [ ] **Step 3: Implement**

```typescript
// src/config.ts
import { z } from 'zod';
import { parse as parseYaml } from 'yaml';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

export const configSchema = z.object({
  daemon: z.object({
    port: z.number().int().min(1024).max(65535).default(19825),
    host: z.string().default('127.0.0.1'),
  }).default({}),
  security: z.object({
    extensionId: z.string().default(''),
    highRiskCapabilities: z.array(z.string()).default(['js_evaluate', 'cookie_write']),
    approvedHighRisk: z.array(z.string()).default([]),
  }).default({}),
  connectors: z.object({
    paths: z.array(z.string()).default(['./connectors', '~/.commandgarden/connectors']),
  }).default({}),
  audit: z.object({
    retentionDays: z.number().int().positive().default(90),
    dbPath: z.string().default('~/.commandgarden/audit.db'),
  }).default({}),
  output: z.object({
    defaultFormat: z.enum(['table', 'json', 'csv']).default('table'),
  }).default({}),
});

export type DaemonConfig = z.infer<typeof configSchema>;

export function expandHome(p: string): string {
  if (p.startsWith('~/') || p.startsWith('~\\')) {
    return join(homedir(), p.slice(2));
  }
  return p;
}

export function loadConfig(configPath?: string): DaemonConfig {
  const path = configPath ?? join(homedir(), '.commandgarden', 'config.yaml');
  if (!existsSync(path)) return configSchema.parse({});
  const raw = readFileSync(path, 'utf-8');
  const parsed = parseYaml(raw);
  return configSchema.parse(parsed ?? {});
}
```

- [ ] **Step 4: Run — expect PASS (~8 tests)**
- [ ] **Step 5: Commit** `"feat(daemon): config module with Zod schema and YAML loader"`

---

## Task 3: Auth Module (TDD)

**Files:** Create `src/auth.ts`, `src/auth.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/auth.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { generateSessionToken, writeSessionToken, readSessionToken, validateToken } from './auth.js';

describe('generateSessionToken', () => {
  it('returns a 64-char hex string', () => {
    const t = generateSessionToken();
    expect(t).toHaveLength(64);
    expect(t).toMatch(/^[0-9a-f]+$/);
  });
  it('generates unique tokens', () => {
    expect(generateSessionToken()).not.toBe(generateSessionToken());
  });
});

describe('writeSessionToken / readSessionToken', () => {
  let tmpDir: string;
  beforeEach(() => { tmpDir = mkdtempSync(join(tmpdir(), 'cg-auth-')); });
  afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

  it('round-trips token through file', () => {
    const p = join(tmpDir, 'token');
    const token = generateSessionToken();
    writeSessionToken(token, p);
    expect(readSessionToken(p)).toBe(token);
  });
  it('creates nested parent dirs', () => {
    const p = join(tmpDir, 'a', 'b', 'token');
    writeSessionToken('test', p);
    expect(readSessionToken(p)).toBe('test');
  });
  it('returns null for missing file', () => {
    expect(readSessionToken(join(tmpDir, 'nope'))).toBeNull();
  });
});

describe('validateToken', () => {
  it('accepts matching tokens', () => {
    expect(validateToken('abc123', 'abc123')).toBe(true);
  });
  it('rejects different tokens', () => {
    expect(validateToken('abc123', 'xyz789')).toBe(false);
  });
  it('rejects different lengths', () => {
    expect(validateToken('short', 'muchlonger')).toBe(false);
  });
  it('rejects empty incoming', () => {
    expect(validateToken('', 'valid')).toBe(false);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**
- [ ] **Step 3: Implement**

```typescript
// src/auth.ts
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export function generateSessionToken(): string {
  return randomBytes(32).toString('hex');
}

export function writeSessionToken(token: string, tokenPath: string): void {
  mkdirSync(dirname(tokenPath), { recursive: true });
  writeFileSync(tokenPath, token, { mode: 0o600 });
}

export function readSessionToken(tokenPath: string): string | null {
  try {
    return readFileSync(tokenPath, 'utf-8').trim();
  } catch {
    return null;
  }
}

export function validateToken(incoming: string, expected: string): boolean {
  if (incoming.length === 0 || incoming.length !== expected.length) return false;
  const a = Buffer.from(incoming);
  const b = Buffer.from(expected);
  return timingSafeEqual(a, b);
}
```

- [ ] **Step 4: Run — expect PASS (~8 tests)**
- [ ] **Step 5: Commit** `"feat(daemon): auth module with session token management"`

---

## Task 4: Audit Store (TDD)

**Files:** Create `src/audit-store.ts`, `src/audit-store.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/audit-store.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AuditStore } from './audit-store.js';
import { createAuditEvent } from '@commandgarden/shared';

describe('AuditStore', () => {
  let store: AuditStore;

  beforeEach(() => {
    store = new AuditStore(':memory:');
  });
  afterEach(() => { store.close(); });

  it('initializes without error', () => {
    expect(store).toBeDefined();
  });

  it('inserts and retrieves an event', () => {
    const evt = createAuditEvent({ type: 'command.start', connector: 'test/cmd', user: 'alice' });
    store.insert(evt);
    const all = store.list();
    expect(all).toHaveLength(1);
    expect(all[0].connector).toBe('test/cmd');
    expect(all[0].user).toBe('alice');
  });

  it('preserves JSON fields (args, domains, capabilities)', () => {
    const evt = createAuditEvent({
      type: 'command.success', connector: 'a/b', user: 'bob',
      args: { month: '2026-06' }, domains: ['example.com'], capabilities: ['navigate'],
      rowCount: 5, columns: ['date'], durationMs: 100,
    });
    store.insert(evt);
    const [row] = store.list();
    expect(row.args).toEqual({ month: '2026-06' });
    expect(row.domains).toEqual(['example.com']);
    expect(row.capabilities).toEqual(['navigate']);
    expect(row.rowCount).toBe(5);
    expect(row.columns).toEqual(['date']);
  });

  it('filters by connector pattern', () => {
    store.insert(createAuditEvent({ type: 'command.start', connector: 'site/a', user: 'u' }));
    store.insert(createAuditEvent({ type: 'command.start', connector: 'site/b', user: 'u' }));
    store.insert(createAuditEvent({ type: 'command.start', connector: 'other/c', user: 'u' }));
    const results = store.list({ connector: 'site/*' });
    expect(results).toHaveLength(2);
  });

  it('filters by since date', () => {
    const old = createAuditEvent({ type: 'command.start', connector: 'a/b', user: 'u' });
    old.timestamp = '2020-01-01T00:00:00.000Z';
    store.insert(old);
    store.insert(createAuditEvent({ type: 'command.start', connector: 'a/b', user: 'u' }));
    const results = store.list({ since: new Date('2025-01-01') });
    expect(results).toHaveLength(1);
  });

  it('prunes old events', () => {
    const old = createAuditEvent({ type: 'command.start', connector: 'a/b', user: 'u' });
    old.timestamp = '2020-01-01T00:00:00.000Z';
    store.insert(old);
    store.insert(createAuditEvent({ type: 'command.start', connector: 'a/b', user: 'u' }));
    const pruned = store.prune(90);
    expect(pruned).toBe(1);
    expect(store.list()).toHaveLength(1);
  });

  it('respects limit option', () => {
    for (let i = 0; i < 5; i++) {
      store.insert(createAuditEvent({ type: 'command.start', connector: `a/${i}`, user: 'u' }));
    }
    expect(store.list({ limit: 3 })).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**
- [ ] **Step 3: Implement**

```typescript
// src/audit-store.ts
import Database from 'better-sqlite3';
import type { AuditEvent } from '@commandgarden/shared';

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
  }

  insert(event: AuditEvent): void {
    this.db.prepare(`INSERT INTO audit_events VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      event.id, event.timestamp, event.type, event.user, event.connector,
      JSON.stringify(event.args), JSON.stringify(event.domains),
      JSON.stringify(event.capabilities), event.rowCount ?? null,
      event.columns ? JSON.stringify(event.columns) : null,
      event.durationMs, event.error ?? null, event.denialReason ?? null,
    );
  }

  list(opts?: { connector?: string; since?: Date; limit?: number }): AuditEvent[] {
    let sql = 'SELECT * FROM audit_events WHERE 1=1';
    const params: unknown[] = [];
    if (opts?.connector) { sql += ' AND connector LIKE ?'; params.push(opts.connector.replace('*', '%')); }
    if (opts?.since) { sql += ' AND timestamp >= ?'; params.push(opts.since.toISOString()); }
    sql += ' ORDER BY timestamp DESC';
    if (opts?.limit) { sql += ' LIMIT ?'; params.push(opts.limit); }
    return (this.db.prepare(sql).all(...params) as Record<string, unknown>[]).map(r => this.toEvent(r));
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
      error: r.error as string | undefined, denialReason: r.denial_reason as string | undefined,
    };
  }
}
```

- [ ] **Step 4: Run — expect PASS (~7 tests)**
- [ ] **Step 5: Commit** `"feat(daemon): SQLite audit store with filtering and pruning"`

---

## Task 5: Connector Registry (TDD)

**Files:** Create `src/registry.ts`, `src/registry.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/registry.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ConnectorRegistry } from './registry.js';

const VALID_YAML = `
site: test
name: cmd
version: "1.0"
domains: ["example.com"]
capabilities: ["navigate"]
pipeline:
  - step: navigate
    url: "https://example.com"
`;

const INVALID_YAML = `site: test\nname: bad\nversion: "1.0"`;

describe('ConnectorRegistry', () => {
  let tmpDir: string;
  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'cg-reg-'));
    writeFileSync(join(tmpDir, 'valid.yaml'), VALID_YAML);
  });
  afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

  it('loads valid connectors from directory', () => {
    const reg = new ConnectorRegistry([tmpDir]);
    const { loaded, errors } = reg.load();
    expect(loaded).toBe(1);
    expect(errors).toHaveLength(0);
  });

  it('looks up connector by site/name key', () => {
    const reg = new ConnectorRegistry([tmpDir]);
    reg.load();
    const c = reg.get('test/cmd');
    expect(c).toBeDefined();
    expect(c!.site).toBe('test');
  });

  it('returns undefined for unknown key', () => {
    const reg = new ConnectorRegistry([tmpDir]);
    reg.load();
    expect(reg.get('no/such')).toBeUndefined();
  });

  it('skips invalid YAML and reports errors', () => {
    writeFileSync(join(tmpDir, 'bad.yaml'), INVALID_YAML);
    const reg = new ConnectorRegistry([tmpDir]);
    const { loaded, errors } = reg.load();
    expect(loaded).toBe(1);
    expect(errors).toHaveLength(1);
  });

  it('skips nonexistent directories', () => {
    const reg = new ConnectorRegistry(['/nonexistent/path']);
    const { loaded, errors } = reg.load();
    expect(loaded).toBe(0);
    expect(errors).toHaveLength(0);
  });

  it('lists all loaded connectors', () => {
    const reg = new ConnectorRegistry([tmpDir]);
    reg.load();
    expect(reg.list()).toHaveLength(1);
  });

  it('loads from multiple paths', () => {
    const dir2 = mkdtempSync(join(tmpdir(), 'cg-reg2-'));
    writeFileSync(join(dir2, 'other.yaml'), VALID_YAML.replace('test', 'other'));
    const reg = new ConnectorRegistry([tmpDir, dir2]);
    reg.load();
    expect(reg.keys()).toHaveLength(2);
    rmSync(dir2, { recursive: true, force: true });
  });
});
```

- [ ] **Step 2: Run — expect FAIL**
- [ ] **Step 3: Implement**

```typescript
// src/registry.ts
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseConnectorYaml, validateConnectorSemantics, type ConnectorDef } from '@commandgarden/shared';

export class ConnectorRegistry {
  private connectors = new Map<string, ConnectorDef>();

  constructor(private paths: string[]) {}

  load(): { loaded: number; errors: string[] } {
    const errors: string[] = [];
    let loaded = 0;
    this.connectors.clear();
    for (const dir of this.paths) {
      const resolved = resolve(dir);
      if (!existsSync(resolved)) continue;
      for (const file of readdirSync(resolved).filter(f => f.endsWith('.yaml') || f.endsWith('.yml'))) {
        const content = readFileSync(join(resolved, file), 'utf-8');
        const result = parseConnectorYaml(content);
        if (!result.ok) { errors.push(`${file}: ${result.error.message}`); continue; }
        const semErrs = validateConnectorSemantics(result.data);
        if (semErrs.length > 0) { errors.push(`${file}: ${semErrs.join('; ')}`); continue; }
        this.connectors.set(`${result.data.site}/${result.data.name}`, result.data);
        loaded++;
      }
    }
    return { loaded, errors };
  }

  get(key: string): ConnectorDef | undefined { return this.connectors.get(key); }
  list(): ConnectorDef[] { return [...this.connectors.values()]; }
  keys(): string[] { return [...this.connectors.keys()]; }
}
```

- [ ] **Step 4: Run — expect PASS (~7 tests)**
- [ ] **Step 5: Commit** `"feat(daemon): connector registry with multi-path scanning"`

---

## Task 6: Request Validator (TDD)

**Files:** Create `src/validator.ts`, `src/validator.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/validator.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ConnectorRegistry } from './registry.js';
import { validateCommand, type ValidationResult } from './validator.js';
import { configSchema } from './config.js';

const CONN_YAML = `
site: test
name: cmd
version: "1.0"
domains: ["example.com"]
capabilities: ["navigate"]
pipeline:
  - step: navigate
    url: "https://example.com"
`;

const HIGH_RISK_YAML = `
site: risky
name: eval
version: "1.0"
domains: ["example.com"]
capabilities: ["navigate", "js_evaluate"]
pipeline:
  - step: navigate
    url: "https://example.com"
`;

describe('validateCommand', () => {
  let tmpDir: string;
  let registry: ConnectorRegistry;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'cg-val-'));
    writeFileSync(join(tmpDir, 'cmd.yaml'), CONN_YAML);
    writeFileSync(join(tmpDir, 'risky.yaml'), HIGH_RISK_YAML);
    registry = new ConnectorRegistry([tmpDir]);
    registry.load();
  });
  afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

  it('accepts a valid low-risk request', () => {
    const config = configSchema.parse({});
    const r = validateCommand('test/cmd', registry, config);
    expect(r.ok).toBe(true);
    expect(r.connector).toBeDefined();
  });

  it('rejects unknown connector', () => {
    const config = configSchema.parse({});
    const r = validateCommand('no/such', registry, config);
    expect(r.ok).toBe(false);
    expect(r.denialReason).toContain('not found');
  });

  it('rejects high-risk connector not in approved list', () => {
    const config = configSchema.parse({});
    const r = validateCommand('risky/eval', registry, config);
    expect(r.ok).toBe(false);
    expect(r.denialReason).toContain('high-risk');
  });

  it('accepts high-risk connector when approved', () => {
    const config = configSchema.parse({ security: { approvedHighRisk: ['risky/eval'] } });
    const r = validateCommand('risky/eval', registry, config);
    expect(r.ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**
- [ ] **Step 3: Implement**

```typescript
// src/validator.ts
import type { ConnectorDef } from '@commandgarden/shared';
import type { DaemonConfig } from './config.js';
import type { ConnectorRegistry } from './registry.js';

export interface ValidationResult {
  ok: boolean;
  connector?: ConnectorDef;
  denialReason?: string;
}

export function validateCommand(
  connectorKey: string,
  registry: ConnectorRegistry,
  config: DaemonConfig,
): ValidationResult {
  const connector = registry.get(connectorKey);
  if (!connector) {
    return { ok: false, denialReason: `Connector "${connectorKey}" not found` };
  }
  const highRiskCaps = config.security.highRiskCapabilities;
  const usesHighRisk = connector.capabilities.filter(c => highRiskCaps.includes(c));
  if (usesHighRisk.length > 0) {
    const approved = new Set(config.security.approvedHighRisk);
    if (!approved.has(connectorKey)) {
      return {
        ok: false,
        denialReason: `Connector "${connectorKey}" uses high-risk capabilities [${usesHighRisk.join(', ')}] but is not approved`,
      };
    }
  }
  return { ok: true, connector };
}
```

- [ ] **Step 4: Run — expect PASS (~4 tests)**
- [ ] **Step 5: Commit** `"feat(daemon): request validator with high-risk capability checking"`

---

## Task 7: WebSocket Relay (TDD)

**Files:** Create `src/ws-relay.ts`, `src/ws-relay.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/ws-relay.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WsRelay } from './ws-relay.js';
import { EventEmitter } from 'node:events';

class MockSocket extends EventEmitter {
  sent: string[] = [];
  closed = false;
  send(data: string) { this.sent.push(data); }
  close() { this.closed = true; this.emit('close'); }
}

describe('WsRelay', () => {
  let relay: WsRelay;
  let socket: MockSocket;

  beforeEach(() => {
    relay = new WsRelay();
    socket = new MockSocket();
  });

  it('reports not connected initially', () => {
    expect(relay.connected).toBe(false);
  });

  it('reports connected after attach', () => {
    relay.attach(socket as any);
    expect(relay.connected).toBe(true);
  });

  it('reports disconnected after socket close', () => {
    relay.attach(socket as any);
    socket.emit('close');
    expect(relay.connected).toBe(false);
  });

  it('throws when sending without connection', async () => {
    await expect(relay.send({} as any, {})).rejects.toThrow('not connected');
  });

  it('sends ExtensionRequest and receives response', async () => {
    relay.attach(socket as any);
    const connector = { site: 'test', name: 'cmd' } as any;
    const promise = relay.send(connector, { key: 'val' }, 5000);

    // Parse sent message to get ID
    const sent = JSON.parse(socket.sent[0]);
    expect(sent.connector).toBeDefined();

    // Simulate extension response
    socket.emit('message', JSON.stringify({ id: sent.id, ok: true, data: [{ a: 1 }] }));

    const resp = await promise;
    expect(resp.ok).toBe(true);
    expect(resp.data).toEqual([{ a: 1 }]);
  });

  it('times out if no response', async () => {
    vi.useFakeTimers();
    relay.attach(socket as any);
    const promise = relay.send({} as any, {}, 100);
    vi.advanceTimersByTime(200);
    await expect(promise).rejects.toThrow('timed out');
    vi.useRealTimers();
  });
});
```

- [ ] **Step 2: Run — expect FAIL**
- [ ] **Step 3: Implement**

```typescript
// src/ws-relay.ts
import { randomUUID } from 'node:crypto';
import type { ConnectorDef, ExtensionRequest, ExtensionResponse } from '@commandgarden/shared';
import { isExtensionResponse } from '@commandgarden/shared';

interface PendingRequest {
  resolve: (resp: ExtensionResponse) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

interface SocketLike {
  on(event: string, cb: (...args: unknown[]) => void): void;
  send(data: string): void;
  close(): void;
}

export class WsRelay {
  private ws: SocketLike | null = null;
  private pending = new Map<string, PendingRequest>();

  get connected(): boolean { return this.ws !== null; }

  attach(ws: SocketLike): void {
    this.ws = ws;
    ws.on('message', (raw: unknown) => {
      const data = JSON.parse(String(raw));
      if (isExtensionResponse(data)) {
        const entry = this.pending.get(data.id);
        if (entry) {
          clearTimeout(entry.timer);
          this.pending.delete(data.id);
          entry.resolve(data);
        }
      }
    });
    ws.on('close', () => {
      this.ws = null;
      for (const [, entry] of this.pending) {
        clearTimeout(entry.timer);
        entry.reject(new Error('Extension disconnected'));
      }
      this.pending.clear();
    });
  }

  async send(
    connector: ConnectorDef,
    args: Record<string, string | number | boolean>,
    timeoutMs = 30000,
  ): Promise<ExtensionResponse> {
    if (!this.ws) throw new Error('Extension not connected');
    const id = randomUUID();
    const request: ExtensionRequest = { id, connector, args };
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('Extension request timed out'));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.ws!.send(JSON.stringify(request));
    });
  }

  detach(): void {
    if (this.ws) { this.ws.close(); this.ws = null; }
  }
}
```

- [ ] **Step 4: Run — expect PASS (~6 tests)**
- [ ] **Step 5: Commit** `"feat(daemon): WebSocket relay with timeout and disconnect handling"`

---

## Task 8: HTTP Server + Routes (TDD)

**Files:** Create `src/server.ts`, `src/server.test.ts`

This is the largest task — it wires Fastify with all dependencies, defines routes, and includes auth/CSRF hooks.

- [ ] **Step 1: Write failing tests**

```typescript
// src/server.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer, type ServerDeps } from './server.js';
import { configSchema } from './config.js';
import { ConnectorRegistry } from './registry.js';
import { AuditStore } from './audit-store.js';
import { WsRelay } from './ws-relay.js';

const CONN_YAML = `
site: test
name: cmd
version: "1.0"
domains: ["example.com"]
capabilities: ["navigate"]
columns: [{ name: "id", type: "string" }]
pipeline:
  - step: navigate
    url: "https://example.com"
`;

function makeDeps(tmpDir: string): ServerDeps {
  writeFileSync(join(tmpDir, 'cmd.yaml'), CONN_YAML);
  const registry = new ConnectorRegistry([tmpDir]);
  registry.load();
  return {
    config: configSchema.parse({}),
    sessionToken: 'test-token-abc',
    registry,
    auditStore: new AuditStore(':memory:'),
    wsRelay: new WsRelay(),
  };
}

describe('server', () => {
  let tmpDir: string;
  let deps: ServerDeps;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'cg-srv-'));
    deps = makeDeps(tmpDir);
  });
  afterEach(() => {
    deps.auditStore.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('GET /api/status returns ok', async () => {
    const app = await createServer(deps);
    const res = await app.inject({ method: 'GET', url: '/api/status' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(true);
  });

  it('POST /api/run rejects missing X-CommandGarden header', async () => {
    const app = await createServer(deps);
    const res = await app.inject({
      method: 'POST', url: '/api/run',
      headers: { authorization: 'Bearer test-token-abc' },
      payload: { connector: 'test/cmd', args: {} },
    });
    expect(res.statusCode).toBe(403);
  });

  it('POST /api/run rejects missing auth', async () => {
    const app = await createServer(deps);
    const res = await app.inject({
      method: 'POST', url: '/api/run',
      headers: { 'x-commandgarden': '1' },
      payload: { connector: 'test/cmd', args: {} },
    });
    expect(res.statusCode).toBe(401);
  });

  it('POST /api/run rejects wrong token', async () => {
    const app = await createServer(deps);
    const res = await app.inject({
      method: 'POST', url: '/api/run',
      headers: { 'x-commandgarden': '1', authorization: 'Bearer wrong' },
      payload: { connector: 'test/cmd', args: {} },
    });
    expect(res.statusCode).toBe(401);
  });

  it('POST /api/run returns 404 for unknown connector', async () => {
    const app = await createServer(deps);
    const res = await app.inject({
      method: 'POST', url: '/api/run',
      headers: { 'x-commandgarden': '1', authorization: 'Bearer test-token-abc' },
      payload: { connector: 'no/such', args: {} },
    });
    expect(res.statusCode).toBe(404);
  });

  it('POST /api/run returns 503 when extension not connected', async () => {
    const app = await createServer(deps);
    const res = await app.inject({
      method: 'POST', url: '/api/run',
      headers: { 'x-commandgarden': '1', authorization: 'Bearer test-token-abc' },
      payload: { connector: 'test/cmd', args: {} },
    });
    expect(res.statusCode).toBe(503);
  });

  it('GET /api/connectors returns loaded connectors', async () => {
    const app = await createServer(deps);
    const res = await app.inject({
      method: 'GET', url: '/api/connectors',
      headers: { 'x-commandgarden': '1', authorization: 'Bearer test-token-abc' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.connectors).toHaveLength(1);
  });

  it('logs denied command to audit store', async () => {
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
});
```

- [ ] **Step 2: Run — expect FAIL**
- [ ] **Step 3: Implement**

```typescript
// src/server.ts
import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import { isRunCommandRequest, createAuditEvent } from '@commandgarden/shared';
import { userInfo } from 'node:os';
import type { DaemonConfig } from './config.js';
import type { ConnectorRegistry } from './registry.js';
import type { AuditStore } from './audit-store.js';
import { WsRelay } from './ws-relay.js';
import { validateCommand } from './validator.js';
import { validateToken } from './auth.js';

export interface ServerDeps {
  config: DaemonConfig;
  sessionToken: string;
  registry: ConnectorRegistry;
  auditStore: AuditStore;
  wsRelay: WsRelay;
}

export async function createServer(deps: ServerDeps) {
  const app = Fastify({ bodyLimit: 1024 * 1024 });
  await app.register(websocket);
  const user = userInfo().username;

  // Auth + CSRF hook (skip for /api/status and WS upgrade)
  app.addHook('preHandler', async (req, reply) => {
    if (req.url === '/api/status') return;
    const csrf = req.headers['x-commandgarden'];
    if (!csrf) { reply.code(403).send({ ok: false, error: 'Missing X-CommandGarden header' }); return; }
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) { reply.code(401).send({ ok: false, error: 'Unauthorized' }); return; }
    if (!validateToken(auth.slice(7), deps.sessionToken)) {
      reply.code(401).send({ ok: false, error: 'Invalid token' }); return;
    }
  });

  app.get('/api/status', async () => ({
    ok: true,
    extensionConnected: deps.wsRelay.connected,
    connectorCount: deps.registry.keys().length,
  }));

  app.get('/api/connectors', async () => ({
    ok: true,
    connectors: deps.registry.list().map(c => ({
      key: `${c.site}/${c.name}`, description: c.description,
      access: c.access, domains: c.domains, capabilities: c.capabilities,
    })),
  }));

  app.post('/api/run', async (req, reply) => {
    if (!isRunCommandRequest(req.body)) {
      reply.code(400).send({ ok: false, error: 'Invalid request' }); return;
    }
    const body = req.body;
    const validation = validateCommand(body.connector, deps.registry, deps.config);
    if (!validation.ok) {
      deps.auditStore.insert(createAuditEvent({
        type: 'command.denied', connector: body.connector, user,
        denialReason: validation.denialReason,
        args: body.args as Record<string, string>,
      }));
      reply.code(404).send({ ok: false, error: validation.denialReason }); return;
    }
    if (!deps.wsRelay.connected) {
      reply.code(503).send({ ok: false, error: 'Extension not connected' }); return;
    }
    const connector = validation.connector!;
    const startTime = Date.now();
    deps.auditStore.insert(createAuditEvent({
      type: 'command.start', connector: body.connector, user,
      args: body.args as Record<string, string>,
      domains: connector.domains, capabilities: [...connector.capabilities],
    }));
    try {
      const resp = await deps.wsRelay.send(connector, body.args);
      const durationMs = Date.now() - startTime;
      deps.auditStore.insert(createAuditEvent({
        type: resp.ok ? 'command.success' : 'command.error',
        connector: body.connector, user,
        args: body.args as Record<string, string>,
        domains: connector.domains, capabilities: [...connector.capabilities],
        rowCount: resp.data.length,
        columns: connector.columns?.map(c => c.name),
        durationMs, error: resp.error,
      }));
      return {
        ok: resp.ok, connector: body.connector, rowCount: resp.data.length,
        columns: connector.columns?.map(c => c.name) ?? [],
        data: resp.data, error: resp.error, durationMs,
      };
    } catch (err) {
      const durationMs = Date.now() - startTime;
      const error = err instanceof Error ? err.message : 'Unknown error';
      deps.auditStore.insert(createAuditEvent({
        type: 'command.error', connector: body.connector, user,
        args: body.args as Record<string, string>, durationMs, error,
      }));
      reply.code(500).send({ ok: false, error });
    }
  });

  app.get('/ws/extension', { websocket: true }, (socket, req) => {
    const origin = req.headers.origin ?? '';
    if (deps.config.security.extensionId &&
        origin !== `chrome-extension://${deps.config.security.extensionId}`) {
      socket.close(4001, 'Invalid origin');
      return;
    }
    deps.wsRelay.attach(socket);
  });

  return app;
}
```

- [ ] **Step 4: Run — expect PASS (~8 tests)**
- [ ] **Step 5: Commit** `"feat(daemon): Fastify HTTP server with routes, auth, and WebSocket"`

---

## Task 9: Entry Point + Lifecycle (TDD)

**Files:** Modify `src/main.ts`

- [ ] **Step 1: Implement main.ts**

```typescript
// src/main.ts
import { join } from 'node:path';
import { homedir } from 'node:os';
import { loadConfig, expandHome } from './config.js';
import { generateSessionToken, writeSessionToken } from './auth.js';
import { AuditStore } from './audit-store.js';
import { ConnectorRegistry } from './registry.js';
import { WsRelay } from './ws-relay.js';
import { createServer } from './server.js';

async function main() {
  const cgHome = join(homedir(), '.commandgarden');
  const config = loadConfig();

  // Auth token
  const sessionToken = generateSessionToken();
  const tokenPath = join(cgHome, 'session-token');
  writeSessionToken(sessionToken, tokenPath);
  console.log(`Session token written to ${tokenPath}`);

  // Audit store
  const dbPath = expandHome(config.audit.dbPath);
  const auditStore = new AuditStore(dbPath);
  const pruned = auditStore.prune(config.audit.retentionDays);
  if (pruned > 0) console.log(`Pruned ${pruned} old audit events`);

  // Connector registry
  const connectorPaths = config.connectors.paths.map(expandHome);
  const registry = new ConnectorRegistry(connectorPaths);
  const { loaded, errors } = registry.load();
  console.log(`Loaded ${loaded} connectors`);
  if (errors.length > 0) console.warn('Connector errors:', errors);

  // WebSocket relay
  const wsRelay = new WsRelay();

  // Server
  const app = await createServer({ config, sessionToken, registry, auditStore, wsRelay });
  const address = await app.listen({ port: config.daemon.port, host: config.daemon.host });
  console.log(`Daemon listening on ${address}`);

  // Graceful shutdown
  const shutdown = async () => {
    console.log('Shutting down...');
    wsRelay.detach();
    await app.close();
    auditStore.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => { console.error('Failed to start daemon:', err); process.exit(1); });
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add commandGarden/daemon/src/main.ts
git commit -m "feat(daemon): entry point with lifecycle management"
```

---

## Task 10: Final Verification

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run` from `commandGarden/daemon/`
Expected: All tests pass (~40+ tests)

- [ ] **Step 2: Run shared tests to verify no regressions**

Run: `npx vitest run` from `commandGarden/shared/`
Expected: 97 tests pass

- [ ] **Step 3: TypeScript builds clean**

Run: `npx tsc` from `commandGarden/daemon/`
Expected: 0 errors, dist/ emitted

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat(daemon): final verification — all tests pass"
```

---

## Summary

| Module | File | Tests | Purpose |
|--------|------|-------|---------|
| Config | `config.ts` | ~8 | Zod schema, YAML loader, defaults |
| Auth | `auth.ts` | ~8 | Token generation, file I/O, validation |
| Audit Store | `audit-store.ts` | ~7 | SQLite CRUD, filtering, pruning |
| Registry | `registry.ts` | ~7 | YAML scanning, parsing, lookup |
| Validator | `validator.ts` | ~4 | Connector + high-risk validation |
| WS Relay | `ws-relay.ts` | ~6 | Extension connection, message relay |
| Server | `server.ts` | ~8 | Fastify routes, hooks, WebSocket |
| **Total** | | **~48** | |
