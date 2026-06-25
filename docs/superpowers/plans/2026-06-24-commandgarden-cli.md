# commandGarden CLI Client Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the commandGarden CLI client — a thin Node.js command-line tool that talks to the daemon via HTTP, formats output, and provides local utilities (validate, config).

**Architecture:** CLI reads session token from `~/.commandgarden/session-token`, sends authenticated HTTP requests to the daemon (run, list, inspect, audit), and handles local-only operations (validate YAML, manage config). Uses Commander.js for arg parsing, cli-table3 for table output.

**Tech Stack:** TypeScript 5.4, Commander.js 12.x, cli-table3, Vitest 2.x, Node 20+ built-in `fetch`

**Branch:** `feat/commandgarden-cli` (branch from `feat/commandgarden-chrome`)

**Depends on:** `@commandgarden/shared` (Plan 1 — 97 tests), `@commandgarden/daemon` (Plan 2 — 50 tests)

---

## File Map

```
commandGarden/daemon/src/
  server.ts              # MODIFY: add /api/connectors/:site/:name, /api/audit
  server.test.ts         # MODIFY: add tests for new endpoints

commandGarden/cli/
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── src/
    ├── main.ts              # Entry point: #!/usr/bin/env node, commander wiring
    ├── client.ts            # HTTP client: token reader, auth headers, get/post
    ├── client.test.ts
    ├── formatters.ts        # Output: table (cli-table3), json, csv
    ├── formatters.test.ts
    ├── duration.ts          # Parse "7d", "30d", "2w" → Date
    ├── duration.test.ts
    └── commands/
        ├── run.ts           # commandgarden run <connector> [--format] [--args]
        ├── run.test.ts
        ├── list.ts          # commandgarden list
        ├── list.test.ts
        ├── inspect.ts       # commandgarden inspect <connector>
        ├── inspect.test.ts
        ├── validate.ts      # commandgarden validate <file.yaml>
        ├── validate.test.ts
        ├── daemon-cmd.ts    # commandgarden daemon start|stop|status
        ├── daemon-cmd.test.ts
        ├── audit.ts         # commandgarden audit list|export
        ├── audit.test.ts
        ├── config-cmd.ts    # commandgarden config show|set
        └── config-cmd.test.ts
```

---

## Task 1: Daemon Audit & Inspect Endpoints

**Files:**
- Modify: `commandGarden/daemon/src/server.ts`
- Modify: `commandGarden/daemon/src/server.test.ts`

The daemon currently exposes `GET /api/connectors` (list summary) and `POST /api/run`. The CLI needs two additional endpoints:
1. `GET /api/connectors/:site/:name` — return full connector definition (for `inspect`)
2. `GET /api/audit` — return filtered audit events (for `audit list/export`)

- [ ] **Step 1: Write failing tests for new endpoints**

Add these tests at the end of the `describe('server', ...)` block in `server.test.ts`:

```typescript
  it('GET /api/connectors/:site/:name returns full connector', async () => {
    const app = await createServer(deps);
    const res = await app.inject({
      method: 'GET', url: '/api/connectors/test/cmd',
      headers: { 'x-commandgarden': '1', authorization: 'Bearer test-token-abc' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(true);
    expect(body.connector.site).toBe('test');
    expect(body.connector.name).toBe('cmd');
    expect(body.connector.pipeline).toBeDefined();
  });

  it('GET /api/connectors/:site/:name returns 404 for unknown', async () => {
    const app = await createServer(deps);
    const res = await app.inject({
      method: 'GET', url: '/api/connectors/no/such',
      headers: { 'x-commandgarden': '1', authorization: 'Bearer test-token-abc' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('GET /api/audit returns audit events', async () => {
    const app = await createServer(deps);
    // Generate an audit event via a denied command
    await app.inject({
      method: 'POST', url: '/api/run',
      headers: { 'x-commandgarden': '1', authorization: 'Bearer test-token-abc' },
      payload: { connector: 'no/such', args: {} },
    });
    const res = await app.inject({
      method: 'GET', url: '/api/audit',
      headers: { 'x-commandgarden': '1', authorization: 'Bearer test-token-abc' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(true);
    expect(body.events).toHaveLength(1);
    expect(body.events[0].type).toBe('command.denied');
  });

  it('GET /api/audit filters by connector pattern', async () => {
    const app = await createServer(deps);
    await app.inject({
      method: 'POST', url: '/api/run',
      headers: { 'x-commandgarden': '1', authorization: 'Bearer test-token-abc' },
      payload: { connector: 'no/such', args: {} },
    });
    const res = await app.inject({
      method: 'GET', url: '/api/audit?connector=other/*',
      headers: { 'x-commandgarden': '1', authorization: 'Bearer test-token-abc' },
    });
    const body = JSON.parse(res.body);
    expect(body.events).toHaveLength(0);
  });
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `npx vitest run src/server.test.ts` from `commandGarden/daemon/`
Expected: 4 new tests fail (routes not defined)

- [ ] **Step 3: Add endpoints to server.ts**

Add these two route handlers in `createServer()`, after the existing `app.get('/api/connectors', ...)` handler:

```typescript
  app.get('/api/connectors/:site/:name', async (req, reply) => {
    const { site, name } = req.params as { site: string; name: string };
    const key = `${site}/${name}`;
    const connector = deps.registry.get(key);
    if (!connector) {
      reply.code(404).send({ ok: false, error: `Connector "${key}" not found` });
      return;
    }
    return { ok: true, connector };
  });

  app.get('/api/audit', async (req) => {
    const query = req.query as Record<string, string>;
    const since = query.since ? new Date(query.since) : undefined;
    const connector = query.connector;
    const limit = query.limit ? parseInt(query.limit, 10) : 100;
    const events = deps.auditStore.list({ since, connector, limit });
    return { ok: true, events, count: events.length };
  });
```

- [ ] **Step 4: Run tests — expect PASS (all daemon tests)**

Run: `npx vitest run` from `commandGarden/daemon/`
Expected: All tests pass including 4 new ones

- [ ] **Step 5: Commit**

```bash
git add commandGarden/daemon/src/server.ts commandGarden/daemon/src/server.test.ts
git commit -m "feat(daemon): add connector detail and audit list endpoints for CLI"
```

---

## Task 2: CLI Package Scaffold

**Files:** Create `commandGarden/cli/package.json`, `tsconfig.json`, `vitest.config.ts`, placeholder `src/main.ts`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "@commandgarden/cli",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./dist/main.js",
  "bin": {
    "commandgarden": "./dist/main.js"
  },
  "scripts": {
    "build": "tsc",
    "start": "node dist/main.js",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@commandgarden/shared": "*",
    "cli-table3": "^0.6.0",
    "commander": "^12.0.0",
    "yaml": "^2.4.0"
  },
  "devDependencies": {
    "@types/cli-table3": "^0.6.0",
    "@types/node": "^22.0.0",
    "typescript": "^5.4.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*.ts"],
  "exclude": ["src/**/*.test.ts"]
}
```

- [ ] **Step 3: Create `vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
  },
});
```

- [ ] **Step 4: Create placeholder `src/main.ts`**

```typescript
#!/usr/bin/env node
console.log('commandgarden CLI placeholder');
```

- [ ] **Step 5: Install deps, verify build**

Run from `commandGarden/`:
```bash
npm install
```

Run from `commandGarden/cli/`:
```bash
npx tsc --noEmit
```

Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add commandGarden/cli/
git commit -m "chore: scaffold @commandgarden/cli package"
```

---

## Task 3: Duration Parser (TDD)

**Files:** Create `commandGarden/cli/src/duration.ts`, `commandGarden/cli/src/duration.test.ts`

Parses human-friendly durations like `"7d"`, `"30d"`, `"2w"`, `"12h"` into a `Date` offset from now. Used by the `audit list --since` option.

- [ ] **Step 1: Write failing tests**

```typescript
// src/duration.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { parseDuration } from './duration.js';

describe('parseDuration', () => {
  afterEach(() => { vi.useRealTimers(); });

  it('parses days', () => {
    vi.useFakeTimers({ now: new Date('2026-06-24T12:00:00Z') });
    const d = parseDuration('7d');
    expect(d.toISOString()).toBe('2026-06-17T12:00:00.000Z');
  });

  it('parses weeks', () => {
    vi.useFakeTimers({ now: new Date('2026-06-24T12:00:00Z') });
    const d = parseDuration('2w');
    expect(d.toISOString()).toBe('2026-06-10T12:00:00.000Z');
  });

  it('parses hours', () => {
    vi.useFakeTimers({ now: new Date('2026-06-24T12:00:00Z') });
    const d = parseDuration('12h');
    expect(d.toISOString()).toBe('2026-06-24T00:00:00.000Z');
  });

  it('parses minutes', () => {
    vi.useFakeTimers({ now: new Date('2026-06-24T12:00:00Z') });
    const d = parseDuration('30m');
    expect(d.toISOString()).toBe('2026-06-24T11:30:00.000Z');
  });

  it('throws for invalid format', () => {
    expect(() => parseDuration('abc')).toThrow('Invalid duration');
  });

  it('throws for zero value', () => {
    expect(() => parseDuration('0d')).toThrow('Invalid duration');
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npx vitest run src/duration.test.ts` from `commandGarden/cli/`

- [ ] **Step 3: Implement**

```typescript
// src/duration.ts

const UNITS: Record<string, number> = {
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
  w: 604_800_000,
};

export function parseDuration(input: string): Date {
  const match = input.match(/^(\d+)([mhdw])$/);
  if (!match) throw new Error(`Invalid duration: "${input}". Use format like 7d, 2w, 12h, 30m`);
  const value = parseInt(match[1], 10);
  const unit = match[2];
  if (value <= 0) throw new Error(`Invalid duration: "${input}". Value must be positive`);
  return new Date(Date.now() - value * UNITS[unit]);
}
```

- [ ] **Step 4: Run — expect PASS (6 tests)**

Run: `npx vitest run src/duration.test.ts` from `commandGarden/cli/`

- [ ] **Step 5: Commit**

```bash
git add commandGarden/cli/src/duration.ts commandGarden/cli/src/duration.test.ts
git commit -m "feat(cli): duration parser for audit --since option"
```

---

## Task 4: Output Formatters (TDD)

**Files:** Create `commandGarden/cli/src/formatters.ts`, `commandGarden/cli/src/formatters.test.ts`

Three output formats: `table` (default, using cli-table3), `json` (pretty-printed envelope), `csv`.

- [ ] **Step 1: Write failing tests**

```typescript
// src/formatters.test.ts
import { describe, it, expect } from 'vitest';
import { formatTable, formatJson, formatCsv, format } from './formatters.js';

const DATA = [
  { date: '2026-06-01', project: 'Alpha', hours: 8 },
  { date: '2026-06-02', project: 'Beta', hours: 4 },
];
const COLUMNS = ['date', 'project', 'hours'];

describe('formatTable', () => {
  it('renders a table with headers', () => {
    const out = formatTable(DATA, COLUMNS);
    expect(out).toContain('date');
    expect(out).toContain('project');
    expect(out).toContain('hours');
    expect(out).toContain('Alpha');
    expect(out).toContain('Beta');
  });

  it('returns message for empty data', () => {
    const out = formatTable([], COLUMNS);
    expect(out).toContain('No data');
  });
});

describe('formatJson', () => {
  it('returns JSON envelope', () => {
    const out = formatJson(DATA, COLUMNS, 'test/cmd');
    const parsed = JSON.parse(out);
    expect(parsed.ok).toBe(true);
    expect(parsed.connector).toBe('test/cmd');
    expect(parsed.rowCount).toBe(2);
    expect(parsed.columns).toEqual(COLUMNS);
    expect(parsed.data).toEqual(DATA);
  });
});

describe('formatCsv', () => {
  it('renders CSV with header row', () => {
    const out = formatCsv(DATA, COLUMNS);
    const lines = out.trim().split('\n');
    expect(lines[0]).toBe('date,project,hours');
    expect(lines[1]).toBe('2026-06-01,Alpha,8');
    expect(lines[2]).toBe('2026-06-02,Beta,4');
  });

  it('escapes commas in values', () => {
    const data = [{ name: 'Doe, John', age: 30 }];
    const out = formatCsv(data, ['name', 'age']);
    expect(out).toContain('"Doe, John"');
  });

  it('returns just header for empty data', () => {
    const out = formatCsv([], COLUMNS);
    expect(out.trim()).toBe('date,project,hours');
  });
});

describe('format', () => {
  it('dispatches to table', () => {
    const out = format(DATA, COLUMNS, 'test/cmd', 'table');
    expect(out).toContain('Alpha');
  });

  it('dispatches to json', () => {
    const out = format(DATA, COLUMNS, 'test/cmd', 'json');
    expect(JSON.parse(out).ok).toBe(true);
  });

  it('dispatches to csv', () => {
    const out = format(DATA, COLUMNS, 'test/cmd', 'csv');
    expect(out).toContain('date,project,hours');
  });

  it('throws for unknown format', () => {
    expect(() => format(DATA, COLUMNS, 'test/cmd', 'xml' as never)).toThrow('Unknown format');
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npx vitest run src/formatters.test.ts` from `commandGarden/cli/`

- [ ] **Step 3: Implement**

```typescript
// src/formatters.ts
import Table from 'cli-table3';

export function formatTable(data: Record<string, unknown>[], columns: string[]): string {
  if (data.length === 0) return 'No data returned.';
  const table = new Table({ head: columns, style: { head: ['cyan'] } });
  for (const row of data) {
    table.push(columns.map(c => String(row[c] ?? '')));
  }
  return table.toString();
}

export function formatJson(
  data: Record<string, unknown>[],
  columns: string[],
  connector: string,
): string {
  return JSON.stringify({ ok: true, connector, rowCount: data.length, columns, data }, null, 2);
}

function escapeCsvField(value: unknown): string {
  const str = String(value ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function formatCsv(data: Record<string, unknown>[], columns: string[]): string {
  const header = columns.join(',');
  const rows = data.map(row => columns.map(c => escapeCsvField(row[c])).join(','));
  return [header, ...rows].join('\n') + '\n';
}

export type OutputFormat = 'table' | 'json' | 'csv';

export function format(
  data: Record<string, unknown>[],
  columns: string[],
  connector: string,
  fmt: OutputFormat,
): string {
  switch (fmt) {
    case 'table': return formatTable(data, columns);
    case 'json': return formatJson(data, columns, connector);
    case 'csv': return formatCsv(data, columns);
    default: throw new Error(`Unknown format: ${fmt}`);
  }
}
```

- [ ] **Step 4: Run — expect PASS (~10 tests)**

Run: `npx vitest run src/formatters.test.ts` from `commandGarden/cli/`

- [ ] **Step 5: Commit**

```bash
git add commandGarden/cli/src/formatters.ts commandGarden/cli/src/formatters.test.ts
git commit -m "feat(cli): output formatters — table, json, csv"
```

---

## Task 5: HTTP Client (TDD)

**Files:** Create `commandGarden/cli/src/client.ts`, `commandGarden/cli/src/client.test.ts`

Reads session token from `~/.commandgarden/session-token`, sends authenticated HTTP requests to daemon with `Authorization: Bearer <token>` and `X-CommandGarden: 1` headers.

- [ ] **Step 1: Write failing tests**

```typescript
// src/client.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { DaemonClient, readToken } from './client.js';

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
}));

describe('readToken', () => {
  it('reads and trims token from file', () => {
    vi.mocked(readFileSync).mockReturnValue('  abc123  \n');
    expect(readToken('/fake/path')).toBe('abc123');
  });

  it('returns null if file missing', () => {
    vi.mocked(readFileSync).mockImplementation(() => { throw new Error('ENOENT'); });
    expect(readToken('/fake/path')).toBeNull();
  });
});

describe('DaemonClient', () => {
  let client: DaemonClient;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
    client = new DaemonClient('http://127.0.0.1:19825', 'test-token');
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('get() sends authenticated GET request', async () => {
    mockFetch.mockResolvedValue({
      ok: true, json: () => Promise.resolve({ ok: true, connectors: [] }),
    });
    const result = await client.get('/api/connectors');
    expect(mockFetch).toHaveBeenCalledWith(
      'http://127.0.0.1:19825/api/connectors',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          'Authorization': 'Bearer test-token',
          'X-CommandGarden': '1',
        }),
      }),
    );
    expect(result.ok).toBe(true);
  });

  it('post() sends authenticated POST with JSON body', async () => {
    mockFetch.mockResolvedValue({
      ok: true, json: () => Promise.resolve({ ok: true, data: [] }),
    });
    await client.post('/api/run', { connector: 'test/cmd', args: {} });
    expect(mockFetch).toHaveBeenCalledWith(
      'http://127.0.0.1:19825/api/run',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ connector: 'test/cmd', args: {} }),
      }),
    );
  });

  it('get() throws on HTTP error', async () => {
    mockFetch.mockResolvedValue({
      ok: false, status: 503,
      json: () => Promise.resolve({ ok: false, error: 'Extension not connected' }),
    });
    await expect(client.get('/api/status')).rejects.toThrow('Extension not connected');
  });

  it('get() throws on network error', async () => {
    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(client.get('/api/status')).rejects.toThrow(
      'Cannot connect to daemon',
    );
  });

  it('status() calls /api/status without auth', async () => {
    mockFetch.mockResolvedValue({
      ok: true, json: () => Promise.resolve({ ok: true, extensionConnected: false }),
    });
    const result = await client.status();
    expect(mockFetch).toHaveBeenCalledWith(
      'http://127.0.0.1:19825/api/status',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(result.ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npx vitest run src/client.test.ts` from `commandGarden/cli/`

- [ ] **Step 3: Implement**

```typescript
// src/client.ts
import { readFileSync } from 'node:fs';

export function readToken(tokenPath: string): string | null {
  try {
    return readFileSync(tokenPath, 'utf-8').trim();
  } catch {
    return null;
  }
}

export class DaemonClient {
  constructor(
    private baseUrl: string,
    private token: string,
  ) {}

  async get<T = Record<string, unknown>>(path: string): Promise<T> {
    return this.request('GET', path);
  }

  async post<T = Record<string, unknown>>(path: string, body: unknown): Promise<T> {
    return this.request('POST', path, body);
  }

  async status(): Promise<{ ok: boolean; extensionConnected: boolean; connectorCount: number }> {
    const resp = await this.rawFetch('/api/status', { method: 'GET' });
    return resp.json();
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    let resp: Response;
    try {
      resp = await this.rawFetch(path, {
        method,
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'X-CommandGarden': '1',
          'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new Error('Cannot connect to daemon. Is it running? Try: commandgarden daemon start');
    }

    const data = await resp.json();
    if (!resp.ok) {
      throw new Error((data as Record<string, string>).error ?? `HTTP ${resp.status}`);
    }
    return data as T;
  }

  private rawFetch(path: string, init: RequestInit): Promise<Response> {
    return fetch(`${this.baseUrl}${path}`, init);
  }
}
```

- [ ] **Step 4: Run — expect PASS (~5 tests)**

Run: `npx vitest run src/client.test.ts` from `commandGarden/cli/`

- [ ] **Step 5: Commit**

```bash
git add commandGarden/cli/src/client.ts commandGarden/cli/src/client.test.ts
git commit -m "feat(cli): HTTP client with token auth for daemon communication"
```

---

## Task 6: `run` Command (TDD)

**Files:** Create `commandGarden/cli/src/commands/run.ts`, `commandGarden/cli/src/commands/run.test.ts`

Sends `POST /api/run` with connector name and args, formats response using the output formatters.

- [ ] **Step 1: Write failing tests**

```typescript
// src/commands/run.test.ts
import { describe, it, expect, vi } from 'vitest';
import { executeRun, parseConnectorArgs } from './run.js';
import type { DaemonClient } from '../client.js';

function mockClient(response: Record<string, unknown>): DaemonClient {
  return {
    post: vi.fn().mockResolvedValue(response),
  } as unknown as DaemonClient;
}

describe('parseConnectorArgs', () => {
  it('parses --key value pairs', () => {
    const args = parseConnectorArgs(['--month', '2026-06', '--verbose']);
    expect(args).toEqual({ month: '2026-06', verbose: 'true' });
  });

  it('returns empty for no args', () => {
    expect(parseConnectorArgs([])).toEqual({});
  });

  it('handles --key=value syntax', () => {
    const args = parseConnectorArgs(['--month=2026-06']);
    expect(args).toEqual({ month: '2026-06' });
  });

  it('ignores non-flag tokens', () => {
    const args = parseConnectorArgs(['stray', '--month', '2026-06']);
    expect(args).toEqual({ month: '2026-06' });
  });
});

describe('executeRun', () => {
  it('calls client.post with connector and args', async () => {
    const client = mockClient({
      ok: true, connector: 'test/cmd', rowCount: 1,
      columns: ['id'], data: [{ id: '1' }], durationMs: 100,
    });
    const output = await executeRun(client, 'test/cmd', { month: '2026-06' }, 'json');
    expect(client.post).toHaveBeenCalledWith('/api/run', {
      connector: 'test/cmd', args: { month: '2026-06' }, format: 'json',
    });
    const parsed = JSON.parse(output);
    expect(parsed.ok).toBe(true);
    expect(parsed.data).toHaveLength(1);
  });

  it('formats output as table', async () => {
    const client = mockClient({
      ok: true, connector: 'test/cmd', rowCount: 1,
      columns: ['id', 'name'], data: [{ id: '1', name: 'Alice' }], durationMs: 50,
    });
    const output = await executeRun(client, 'test/cmd', {}, 'table');
    expect(output).toContain('Alice');
    expect(output).toContain('id');
  });

  it('formats output as csv', async () => {
    const client = mockClient({
      ok: true, connector: 'test/cmd', rowCount: 1,
      columns: ['id'], data: [{ id: '1' }], durationMs: 50,
    });
    const output = await executeRun(client, 'test/cmd', {}, 'csv');
    expect(output).toContain('id');
    expect(output).toContain('1');
  });

  it('returns error message on failure', async () => {
    const client = {
      post: vi.fn().mockRejectedValue(new Error('Extension not connected')),
    } as unknown as DaemonClient;
    const output = await executeRun(client, 'test/cmd', {}, 'table');
    expect(output).toContain('Error');
    expect(output).toContain('Extension not connected');
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npx vitest run src/commands/run.test.ts` from `commandGarden/cli/`

- [ ] **Step 3: Implement**

```typescript
// src/commands/run.ts
import type { DaemonClient } from '../client.js';
import type { RunCommandResponse } from '@commandgarden/shared';
import { format, type OutputFormat } from '../formatters.js';

export function parseConnectorArgs(rawArgs: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  let i = 0;
  while (i < rawArgs.length) {
    const arg = rawArgs[i];
    if (arg.startsWith('--')) {
      const eqIdx = arg.indexOf('=');
      if (eqIdx !== -1) {
        result[arg.slice(2, eqIdx)] = arg.slice(eqIdx + 1);
      } else if (i + 1 < rawArgs.length && !rawArgs[i + 1].startsWith('--')) {
        result[arg.slice(2)] = rawArgs[i + 1];
        i++;
      } else {
        result[arg.slice(2)] = 'true';
      }
    }
    i++;
  }
  return result;
}

export async function executeRun(
  client: DaemonClient,
  connector: string,
  args: Record<string, string>,
  outputFormat: OutputFormat,
): Promise<string> {
  try {
    const resp = await client.post<RunCommandResponse>('/api/run', {
      connector, args, format: outputFormat,
    });
    return format(resp.data, resp.columns, connector, outputFormat);
  } catch (err) {
    return `Error: ${err instanceof Error ? err.message : String(err)}`;
  }
}
```

- [ ] **Step 4: Run — expect PASS (~8 tests)**

Run: `npx vitest run src/commands/run.test.ts` from `commandGarden/cli/`

- [ ] **Step 5: Commit**

```bash
git add commandGarden/cli/src/commands/run.ts commandGarden/cli/src/commands/run.test.ts
git commit -m "feat(cli): run command — POST /api/run with output formatting"
```

---

## Task 7: `list` & `inspect` Commands (TDD)

**Files:** Create `commandGarden/cli/src/commands/list.ts`, `commandGarden/cli/src/commands/list.test.ts`, `commandGarden/cli/src/commands/inspect.ts`, `commandGarden/cli/src/commands/inspect.test.ts`

- `list` fetches `GET /api/connectors` and displays connector summaries in a table.
- `inspect` fetches `GET /api/connectors/:site/:name` and displays full connector details.

- [ ] **Step 1: Write failing tests for `list`**

```typescript
// src/commands/list.test.ts
import { describe, it, expect, vi } from 'vitest';
import { executeList } from './list.js';
import type { DaemonClient } from '../client.js';

function mockClient(connectors: Record<string, unknown>[]): DaemonClient {
  return {
    get: vi.fn().mockResolvedValue({ ok: true, connectors }),
  } as unknown as DaemonClient;
}

describe('executeList', () => {
  it('returns formatted table of connectors', async () => {
    const client = mockClient([
      { key: 'test/cmd', description: 'Test command', access: 'read',
        domains: ['example.com'], capabilities: ['navigate'] },
    ]);
    const output = await executeList(client);
    expect(output).toContain('test/cmd');
    expect(output).toContain('Test command');
    expect(output).toContain('read');
  });

  it('returns message when no connectors', async () => {
    const client = mockClient([]);
    const output = await executeList(client);
    expect(output).toContain('No connectors');
  });

  it('returns error on failure', async () => {
    const client = {
      get: vi.fn().mockRejectedValue(new Error('Cannot connect to daemon')),
    } as unknown as DaemonClient;
    const output = await executeList(client);
    expect(output).toContain('Error');
  });
});
```

- [ ] **Step 2: Write failing tests for `inspect`**

```typescript
// src/commands/inspect.test.ts
import { describe, it, expect, vi } from 'vitest';
import { executeInspect } from './inspect.js';
import type { DaemonClient } from '../client.js';

describe('executeInspect', () => {
  it('displays full connector details', async () => {
    const connector = {
      site: 'test', name: 'cmd', version: '1.0', description: 'A test connector',
      access: 'read', domains: ['example.com'], capabilities: ['navigate', 'dom_read'],
      args: [{ name: 'month', type: 'string', required: false, help: 'Month in YYYY-MM' }],
      columns: [{ name: 'date', type: 'string' }, { name: 'hours', type: 'number' }],
      pipeline: [{ step: 'navigate', url: 'https://example.com' }],
    };
    const client = {
      get: vi.fn().mockResolvedValue({ ok: true, connector }),
    } as unknown as DaemonClient;

    const output = await executeInspect(client, 'test/cmd');
    expect(output).toContain('test/cmd');
    expect(output).toContain('A test connector');
    expect(output).toContain('navigate');
    expect(output).toContain('dom_read');
    expect(output).toContain('month');
    expect(output).toContain('YYYY-MM');
    expect(output).toContain('date');
    expect(output).toContain('hours');
  });

  it('returns error for unknown connector', async () => {
    const client = {
      get: vi.fn().mockRejectedValue(new Error('Connector "no/such" not found')),
    } as unknown as DaemonClient;
    const output = await executeInspect(client, 'no/such');
    expect(output).toContain('Error');
    expect(output).toContain('not found');
  });

  it('validates connector key format', async () => {
    const client = { get: vi.fn() } as unknown as DaemonClient;
    const output = await executeInspect(client, 'invalid');
    expect(output).toContain('Invalid connector key');
  });
});
```

- [ ] **Step 3: Run — expect FAIL**

Run: `npx vitest run src/commands/list.test.ts src/commands/inspect.test.ts` from `commandGarden/cli/`

- [ ] **Step 4: Implement `list.ts`**

```typescript
// src/commands/list.ts
import Table from 'cli-table3';
import type { DaemonClient } from '../client.js';

interface ConnectorSummary {
  key: string;
  description?: string;
  access: string;
  domains: string[];
  capabilities: string[];
}

export async function executeList(client: DaemonClient): Promise<string> {
  try {
    const resp = await client.get<{ ok: boolean; connectors: ConnectorSummary[] }>('/api/connectors');
    if (resp.connectors.length === 0) return 'No connectors installed.';
    const table = new Table({
      head: ['Connector', 'Description', 'Access', 'Domains', 'Capabilities'],
      style: { head: ['cyan'] },
    });
    for (const c of resp.connectors) {
      table.push([
        c.key,
        c.description ?? '',
        c.access,
        c.domains.join(', '),
        c.capabilities.join(', '),
      ]);
    }
    return table.toString();
  } catch (err) {
    return `Error: ${err instanceof Error ? err.message : String(err)}`;
  }
}
```

- [ ] **Step 5: Implement `inspect.ts`**

```typescript
// src/commands/inspect.ts
import type { DaemonClient } from '../client.js';
import type { ConnectorDef } from '@commandgarden/shared';

export async function executeInspect(client: DaemonClient, connectorKey: string): Promise<string> {
  if (!connectorKey.includes('/')) {
    return 'Invalid connector key. Use format: <site>/<command> (e.g., timetracking/report)';
  }

  try {
    const resp = await client.get<{ ok: boolean; connector: ConnectorDef }>(
      `/api/connectors/${connectorKey}`,
    );
    return renderConnector(resp.connector);
  } catch (err) {
    return `Error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

function renderConnector(c: ConnectorDef): string {
  const lines: string[] = [];
  lines.push(`Connector: ${c.site}/${c.name}`);
  lines.push(`Version:   ${c.version}`);
  if (c.description) lines.push(`Desc:      ${c.description}`);
  lines.push(`Access:    ${c.access}`);
  lines.push(`Domains:   ${c.domains.join(', ')}`);
  lines.push(`Caps:      ${c.capabilities.join(', ')}`);

  if (c.args && c.args.length > 0) {
    lines.push('');
    lines.push('Arguments:');
    for (const a of c.args) {
      const req = a.required ? '(required)' : `(default: ${a.default ?? 'none'})`;
      lines.push(`  --${a.name}  ${a.type}  ${req}${a.help ? '  ' + a.help : ''}`);
    }
  }

  if (c.columns && c.columns.length > 0) {
    lines.push('');
    lines.push('Output columns:');
    for (const col of c.columns) {
      lines.push(`  ${col.name}  (${col.type})`);
    }
  }

  lines.push('');
  lines.push(`Pipeline: ${c.pipeline.length} step(s)`);
  for (let i = 0; i < c.pipeline.length; i++) {
    const s = c.pipeline[i];
    lines.push(`  ${i + 1}. ${s.step}${stepSummary(s)}`);
  }

  return lines.join('\n');
}

function stepSummary(step: Record<string, unknown>): string {
  switch (step.step) {
    case 'navigate': return ` → ${step.url}`;
    case 'wait': return ` → ${step.selector ?? 'delay'}${step.timeout ? ` (${step.timeout}ms)` : ''}`;
    case 'extract': return ` → ${step.selector}`;
    case 'click': return ` → ${step.selector}`;
    case 'type': return ` → ${step.selector}`;
    case 'set': return ` → ${step.name} = ${step.value}`;
    case 'filter': return ` → ${step.field} ${step.operator} ${step.value}`;
    case 'map': return ` → ${Object.keys(step.fields as Record<string, string>).join(', ')}`;
    case 'cookie': return ` → ${step.domain}`;
    case 'fetch': return ` → ${step.url}`;
    case 'intercept': return ` → ${step.urlPattern}`;
    default: return '';
  }
}
```

- [ ] **Step 6: Run — expect PASS (~6 tests)**

Run: `npx vitest run src/commands/list.test.ts src/commands/inspect.test.ts` from `commandGarden/cli/`

- [ ] **Step 7: Commit**

```bash
git add commandGarden/cli/src/commands/list.ts commandGarden/cli/src/commands/list.test.ts
git add commandGarden/cli/src/commands/inspect.ts commandGarden/cli/src/commands/inspect.test.ts
git commit -m "feat(cli): list and inspect commands for connector discovery"
```

---

## Task 8: `validate` Command (TDD)

**Files:** Create `commandGarden/cli/src/commands/validate.ts`, `commandGarden/cli/src/commands/validate.test.ts`

Local-only command — parses a YAML file using `@commandgarden/shared` loader and reports validation results. Does NOT require daemon.

- [ ] **Step 1: Write failing tests**

```typescript
// src/commands/validate.test.ts
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { executeValidate } from './validate.js';

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  existsSync: vi.fn().mockReturnValue(true),
}));

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

const INVALID_YAML = `
site: test
# missing name, domains, capabilities, pipeline
`;

const BAD_YAML = `
  : broken: yaml: [
`;

describe('executeValidate', () => {
  it('reports valid connector', () => {
    vi.mocked(readFileSync).mockReturnValue(VALID_YAML);
    const output = executeValidate('/path/to/connector.yaml');
    expect(output).toContain('Valid');
    expect(output).toContain('test/cmd');
  });

  it('reports schema errors', () => {
    vi.mocked(readFileSync).mockReturnValue(INVALID_YAML);
    const output = executeValidate('/path/to/bad.yaml');
    expect(output).toContain('Invalid');
  });

  it('reports YAML parse errors', () => {
    vi.mocked(readFileSync).mockReturnValue(BAD_YAML);
    const output = executeValidate('/path/to/broken.yaml');
    expect(output).toContain('Invalid');
  });

  it('reports semantic errors', () => {
    const yaml = `
site: test
name: cmd
version: "1.0"
domains: ["example.com"]
capabilities: ["navigate"]
pipeline:
  - step: extract
    selector: "tr"
    fields: { name: "td" }
`;
    vi.mocked(readFileSync).mockReturnValue(yaml);
    const output = executeValidate('/path/to/sem.yaml');
    expect(output).toContain('requires capability');
  });

  it('handles file read error', () => {
    vi.mocked(readFileSync).mockImplementation(() => { throw new Error('ENOENT'); });
    const output = executeValidate('/missing/file.yaml');
    expect(output).toContain('Error');
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npx vitest run src/commands/validate.test.ts` from `commandGarden/cli/`

- [ ] **Step 3: Implement**

```typescript
// src/commands/validate.ts
import { readFileSync } from 'node:fs';
import { parseConnectorYaml, validateConnectorSemantics } from '@commandgarden/shared';

export function executeValidate(filePath: string): string {
  let content: string;
  try {
    content = readFileSync(filePath, 'utf-8');
  } catch (err) {
    return `Error: Cannot read file "${filePath}": ${err instanceof Error ? err.message : String(err)}`;
  }

  const result = parseConnectorYaml(content);
  if (!result.ok) {
    const lines = [`Invalid: ${result.error.message}`];
    if (result.error.details) {
      for (const d of result.error.details) lines.push(`  - ${d}`);
    }
    return lines.join('\n');
  }

  const semanticErrors = validateConnectorSemantics(result.data);
  if (semanticErrors.length > 0) {
    const lines = ['Invalid: Semantic validation failed'];
    for (const e of semanticErrors) lines.push(`  - ${e}`);
    return lines.join('\n');
  }

  const c = result.data;
  return [
    `Valid: ${c.site}/${c.name} v${c.version}`,
    `  Access: ${c.access}`,
    `  Domains: ${c.domains.join(', ')}`,
    `  Capabilities: ${c.capabilities.join(', ')}`,
    `  Pipeline: ${c.pipeline.length} step(s)`,
    `  Args: ${c.args.length > 0 ? c.args.map(a => a.name).join(', ') : 'none'}`,
    `  Columns: ${c.columns.length > 0 ? c.columns.map(col => col.name).join(', ') : 'none'}`,
  ].join('\n');
}
```

- [ ] **Step 4: Run — expect PASS (~5 tests)**

Run: `npx vitest run src/commands/validate.test.ts` from `commandGarden/cli/`

- [ ] **Step 5: Commit**

```bash
git add commandGarden/cli/src/commands/validate.ts commandGarden/cli/src/commands/validate.test.ts
git commit -m "feat(cli): validate command — local YAML connector validation"
```

---

## Task 9: `daemon` Commands (TDD)

**Files:** Create `commandGarden/cli/src/commands/daemon-cmd.ts`, `commandGarden/cli/src/commands/daemon-cmd.test.ts`

- `daemon status` — `GET /api/status` (no auth needed)
- `daemon start` — spawn daemon process in background
- `daemon stop` — kill daemon via PID file

- [ ] **Step 1: Write failing tests**

```typescript
// src/commands/daemon-cmd.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { executeDaemonStatus, executeDaemonStart, executeDaemonStop } from './daemon-cmd.js';
import type { DaemonClient } from '../client.js';
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { spawn, type ChildProcess } from 'node:child_process';

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(),
  unlinkSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}));

describe('executeDaemonStatus', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('shows running status', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true, extensionConnected: true, connectorCount: 3 }),
    });
    const output = await executeDaemonStatus('http://127.0.0.1:19825');
    expect(output).toContain('running');
    expect(output).toContain('Extension: connected');
    expect(output).toContain('3');
  });

  it('shows stopped status on connection error', async () => {
    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));
    const output = await executeDaemonStatus('http://127.0.0.1:19825');
    expect(output).toContain('not running');
  });
});

describe('executeDaemonStart', () => {
  it('spawns daemon process', async () => {
    const fakeChild = {
      pid: 12345,
      unref: vi.fn(),
      on: vi.fn(),
      stderr: { on: vi.fn() },
    } as unknown as ChildProcess;
    vi.mocked(spawn).mockReturnValue(fakeChild);
    vi.mocked(existsSync).mockReturnValue(false);
    const mockFetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    vi.stubGlobal('fetch', mockFetch);

    const output = await executeDaemonStart('http://127.0.0.1:19825', '/fake/home/.commandgarden', '/fake/daemon/main.js');
    expect(output).toContain('started');
    expect(spawn).toHaveBeenCalled();
  });

  it('reports if already running', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true, json: () => Promise.resolve({ ok: true }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const output = await executeDaemonStart('http://127.0.0.1:19825', '/fake/home/.commandgarden', '/fake/daemon/main.js');
    expect(output).toContain('already running');
  });
});

describe('executeDaemonStop', () => {
  it('stops daemon via PID', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue('12345');
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);

    const output = await executeDaemonStop('/fake/home/.commandgarden');
    expect(output).toContain('stopped');
    expect(killSpy).toHaveBeenCalledWith(12345, 'SIGTERM');
    killSpy.mockRestore();
  });

  it('reports if no PID file found', async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    const output = await executeDaemonStop('/fake/home/.commandgarden');
    expect(output).toContain('not running');
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npx vitest run src/commands/daemon-cmd.test.ts` from `commandGarden/cli/`

- [ ] **Step 3: Implement**

```typescript
// src/commands/daemon-cmd.ts
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, unlinkSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export async function executeDaemonStatus(baseUrl: string): Promise<string> {
  try {
    const resp = await fetch(`${baseUrl}/api/status`);
    const data = await resp.json() as { ok: boolean; extensionConnected: boolean; connectorCount: number };
    return [
      'Daemon: running',
      `Extension: ${data.extensionConnected ? 'connected' : 'not connected'}`,
      `Connectors: ${data.connectorCount}`,
    ].join('\n');
  } catch {
    return 'Daemon: not running';
  }
}

export async function executeDaemonStart(baseUrl: string, cgHome: string, daemonScript: string): Promise<string> {
  // Check if already running
  try {
    const resp = await fetch(`${baseUrl}/api/status`);
    if (resp.ok) return 'Daemon is already running.';
  } catch {
    // Not running — proceed to start
  }

  const pidPath = join(cgHome, 'daemon.pid');
  mkdirSync(cgHome, { recursive: true });

  const child = spawn('node', [daemonScript], {
    detached: true,
    stdio: 'ignore',
  });

  if (child.pid) {
    writeFileSync(pidPath, String(child.pid));
  }
  child.unref();

  return `Daemon started (PID: ${child.pid ?? 'unknown'}).`;
}

export async function executeDaemonStop(cgHome: string): Promise<string> {
  const pidPath = join(cgHome, 'daemon.pid');
  if (!existsSync(pidPath)) {
    return 'Daemon is not running (no PID file found).';
  }

  const pid = parseInt(readFileSync(pidPath, 'utf-8').trim(), 10);
  try {
    process.kill(pid, 'SIGTERM');
    unlinkSync(pidPath);
    return `Daemon stopped (PID: ${pid}).`;
  } catch {
    unlinkSync(pidPath);
    return `Daemon process ${pid} not found (stale PID file cleaned up).`;
  }
}
```

- [ ] **Step 4: Run — expect PASS (~5 tests)**

Run: `npx vitest run src/commands/daemon-cmd.test.ts` from `commandGarden/cli/`

- [ ] **Step 5: Commit**

```bash
git add commandGarden/cli/src/commands/daemon-cmd.ts commandGarden/cli/src/commands/daemon-cmd.test.ts
git commit -m "feat(cli): daemon start/stop/status commands"
```

---

## Task 10: `audit` Commands (TDD)

**Files:** Create `commandGarden/cli/src/commands/audit.ts`, `commandGarden/cli/src/commands/audit.test.ts`

- `audit list` — `GET /api/audit` with filters, display as table
- `audit export` — `GET /api/audit`, output as JSON

- [ ] **Step 1: Write failing tests**

```typescript
// src/commands/audit.test.ts
import { describe, it, expect, vi } from 'vitest';
import { executeAuditList, executeAuditExport } from './audit.js';
import type { DaemonClient } from '../client.js';

const EVENTS = [
  {
    id: 'evt-1', timestamp: '2026-06-24T10:00:00Z', type: 'command.success',
    user: 'alice', connector: 'test/cmd', args: {}, domains: ['example.com'],
    capabilities: ['navigate'], rowCount: 5, durationMs: 120,
  },
  {
    id: 'evt-2', timestamp: '2026-06-24T09:00:00Z', type: 'command.denied',
    user: 'bob', connector: 'test/other', args: {}, domains: [],
    capabilities: [], durationMs: 0, denialReason: 'Not found',
  },
];

function mockClient(events = EVENTS): DaemonClient {
  return {
    get: vi.fn().mockResolvedValue({ ok: true, events, count: events.length }),
  } as unknown as DaemonClient;
}

describe('executeAuditList', () => {
  it('displays audit events in table', async () => {
    const client = mockClient();
    const output = await executeAuditList(client, {});
    expect(output).toContain('command.success');
    expect(output).toContain('test/cmd');
    expect(output).toContain('alice');
  });

  it('passes since parameter', async () => {
    const client = mockClient();
    await executeAuditList(client, { since: '2026-06-24T00:00:00.000Z' });
    expect(client.get).toHaveBeenCalledWith(
      expect.stringContaining('since=2026-06-24'),
    );
  });

  it('passes connector filter', async () => {
    const client = mockClient();
    await executeAuditList(client, { connector: 'test/*' });
    expect(client.get).toHaveBeenCalledWith(
      expect.stringContaining('connector=test'),
    );
  });

  it('shows message for no events', async () => {
    const client = mockClient([]);
    const output = await executeAuditList(client, {});
    expect(output).toContain('No audit events');
  });

  it('returns error on failure', async () => {
    const client = {
      get: vi.fn().mockRejectedValue(new Error('Cannot connect')),
    } as unknown as DaemonClient;
    const output = await executeAuditList(client, {});
    expect(output).toContain('Error');
  });
});

describe('executeAuditExport', () => {
  it('exports events as JSON', async () => {
    const client = mockClient();
    const output = await executeAuditExport(client, {}, 'json');
    const parsed = JSON.parse(output);
    expect(parsed.events).toHaveLength(2);
  });

  it('exports events as CSV', async () => {
    const client = mockClient();
    const output = await executeAuditExport(client, {}, 'csv');
    expect(output).toContain('timestamp');
    expect(output).toContain('command.success');
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npx vitest run src/commands/audit.test.ts` from `commandGarden/cli/`

- [ ] **Step 3: Implement**

```typescript
// src/commands/audit.ts
import Table from 'cli-table3';
import type { DaemonClient } from '../client.js';
import type { AuditEvent } from '@commandgarden/shared';

interface AuditFilter {
  since?: string;
  connector?: string;
  limit?: number;
}

function buildQueryString(filter: AuditFilter): string {
  const params = new URLSearchParams();
  if (filter.since) params.set('since', filter.since);
  if (filter.connector) params.set('connector', filter.connector);
  if (filter.limit) params.set('limit', String(filter.limit));
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export async function executeAuditList(
  client: DaemonClient,
  filter: AuditFilter,
): Promise<string> {
  try {
    const resp = await client.get<{ ok: boolean; events: AuditEvent[]; count: number }>(
      `/api/audit${buildQueryString(filter)}`,
    );
    if (resp.events.length === 0) return 'No audit events found.';

    const table = new Table({
      head: ['Timestamp', 'Type', 'Connector', 'User', 'Duration', 'Rows', 'Error'],
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
        e.error ?? e.denialReason ?? '',
      ]);
    }
    return table.toString();
  } catch (err) {
    return `Error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

const AUDIT_COLUMNS = ['id', 'timestamp', 'type', 'user', 'connector', 'durationMs', 'rowCount', 'error', 'denialReason'];

export async function executeAuditExport(
  client: DaemonClient,
  filter: AuditFilter,
  format: 'json' | 'csv',
): Promise<string> {
  try {
    const resp = await client.get<{ ok: boolean; events: AuditEvent[]; count: number }>(
      `/api/audit${buildQueryString(filter)}`,
    );

    if (format === 'json') {
      return JSON.stringify({ events: resp.events, count: resp.count }, null, 2);
    }

    // CSV
    const header = AUDIT_COLUMNS.join(',');
    const rows = resp.events.map(e =>
      AUDIT_COLUMNS.map(col => {
        const val = (e as Record<string, unknown>)[col];
        const str = String(val ?? '');
        return str.includes(',') || str.includes('"') ? `"${str.replace(/"/g, '""')}"` : str;
      }).join(','),
    );
    return [header, ...rows].join('\n') + '\n';
  } catch (err) {
    return `Error: ${err instanceof Error ? err.message : String(err)}`;
  }
}
```

- [ ] **Step 4: Run — expect PASS (~7 tests)**

Run: `npx vitest run src/commands/audit.test.ts` from `commandGarden/cli/`

- [ ] **Step 5: Commit**

```bash
git add commandGarden/cli/src/commands/audit.ts commandGarden/cli/src/commands/audit.test.ts
git commit -m "feat(cli): audit list and export commands"
```

---

## Task 11: `config` Commands (TDD)

**Files:** Create `commandGarden/cli/src/commands/config-cmd.ts`, `commandGarden/cli/src/commands/config-cmd.test.ts`

Local-only commands — read and write `~/.commandgarden/config.yaml`.

- [ ] **Step 1: Write failing tests**

```typescript
// src/commands/config-cmd.test.ts
import { describe, it, expect, vi } from 'vitest';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { executeConfigShow, executeConfigSet } from './config-cmd.js';

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

const SAMPLE_CONFIG = `daemon:
  port: 19825
  host: "127.0.0.1"
security:
  extensionId: ""
output:
  defaultFormat: table
`;

describe('executeConfigShow', () => {
  it('displays config file contents', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(SAMPLE_CONFIG);
    const output = executeConfigShow('/fake/.commandgarden/config.yaml');
    expect(output).toContain('daemon');
    expect(output).toContain('19825');
    expect(output).toContain('table');
  });

  it('shows defaults when no config file exists', () => {
    vi.mocked(existsSync).mockReturnValue(false);
    const output = executeConfigShow('/fake/.commandgarden/config.yaml');
    expect(output).toContain('No config file');
  });
});

describe('executeConfigSet', () => {
  it('sets a top-level.nested key', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(SAMPLE_CONFIG);
    const output = executeConfigSet('/fake/.commandgarden/config.yaml', 'daemon.port', '9999');
    expect(output).toContain('daemon.port');
    expect(output).toContain('9999');
    expect(writeFileSync).toHaveBeenCalled();
  });

  it('creates config file if missing', () => {
    vi.mocked(existsSync).mockReturnValue(false);
    const output = executeConfigSet('/fake/.commandgarden/config.yaml', 'output.defaultFormat', 'json');
    expect(output).toContain('output.defaultFormat');
    expect(writeFileSync).toHaveBeenCalled();
  });

  it('rejects unknown top-level key', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(SAMPLE_CONFIG);
    const output = executeConfigSet('/fake/.commandgarden/config.yaml', 'unknown.key', 'val');
    expect(output).toContain('Unknown config section');
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npx vitest run src/commands/config-cmd.test.ts` from `commandGarden/cli/`

- [ ] **Step 3: Implement**

```typescript
// src/commands/config-cmd.ts
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

const VALID_SECTIONS = ['daemon', 'security', 'connectors', 'audit', 'output'];

export function executeConfigShow(configPath: string): string {
  if (!existsSync(configPath)) {
    return [
      'No config file found.',
      `Expected at: ${configPath}`,
      'Using defaults. Run "commandgarden config set <key> <value>" to create one.',
    ].join('\n');
  }
  return readFileSync(configPath, 'utf-8');
}

export function executeConfigSet(configPath: string, key: string, value: string): string {
  const parts = key.split('.');
  if (parts.length !== 2 || !VALID_SECTIONS.includes(parts[0])) {
    return `Unknown config section: "${parts[0]}". Valid sections: ${VALID_SECTIONS.join(', ')}`;
  }

  let config: Record<string, Record<string, unknown>> = {};
  if (existsSync(configPath)) {
    const raw = readFileSync(configPath, 'utf-8');
    config = (parseYaml(raw) as Record<string, Record<string, unknown>>) ?? {};
  }

  const [section, prop] = parts;
  if (!config[section]) config[section] = {};

  // Auto-convert numeric and boolean values
  let parsed: unknown = value;
  if (value === 'true') parsed = true;
  else if (value === 'false') parsed = false;
  else if (!isNaN(Number(value)) && value !== '') parsed = Number(value);

  config[section][prop] = parsed;

  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(configPath, stringifyYaml(config), 'utf-8');
  return `Set ${key} = ${value}`;
}
```

- [ ] **Step 4: Run — expect PASS (~5 tests)**

Run: `npx vitest run src/commands/config-cmd.test.ts` from `commandGarden/cli/`

- [ ] **Step 5: Commit**

```bash
git add commandGarden/cli/src/commands/config-cmd.ts commandGarden/cli/src/commands/config-cmd.test.ts
git commit -m "feat(cli): config show and set commands"
```

---

## Task 12: CLI Entry Point & Wiring

**Files:** Replace `commandGarden/cli/src/main.ts` with full Commander wiring

Connects all commands into the Commander program. This is the final wiring step.

- [ ] **Step 1: Implement `main.ts`**

```typescript
#!/usr/bin/env node
// src/main.ts
import { Command } from 'commander';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { DaemonClient, readToken } from './client.js';
import { parseDuration } from './duration.js';
import type { OutputFormat } from './formatters.js';
import { executeRun, parseConnectorArgs } from './commands/run.js';
import { executeList } from './commands/list.js';
import { executeInspect } from './commands/inspect.js';
import { executeValidate } from './commands/validate.js';
import { executeDaemonStatus, executeDaemonStart, executeDaemonStop } from './commands/daemon-cmd.js';
import { executeAuditList, executeAuditExport } from './commands/audit.js';
import { executeConfigShow, executeConfigSet } from './commands/config-cmd.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DAEMON_SCRIPT = join(__dirname, '..', '..', 'daemon', 'dist', 'main.js');
const CG_HOME = join(homedir(), '.commandgarden');
const TOKEN_PATH = join(CG_HOME, 'session-token');
const CONFIG_PATH = join(CG_HOME, 'config.yaml');
const BASE_URL = `http://127.0.0.1:19825`;

function createClient(): DaemonClient {
  const token = readToken(TOKEN_PATH);
  if (!token) {
    console.error('No session token found. Is the daemon running? Try: commandgarden daemon start');
    process.exit(1);
  }
  return new DaemonClient(BASE_URL, token);
}

const program = new Command();
program
  .name('commandgarden')
  .version('0.1.0')
  .description('Enterprise browser automation CLI');

// --- run ---
program
  .command('run <connector>')
  .description('Run a connector command')
  .option('-f, --format <format>', 'output format: table, json, csv', 'table')
  .allowUnknownOption()
  .action(async (connector: string, opts: { format: string }, cmd: Command) => {
    const client = createClient();
    const connectorArgs = parseConnectorArgs(cmd.args);
    const output = await executeRun(client, connector, connectorArgs, opts.format as OutputFormat);
    console.log(output);
  });

// --- list ---
program
  .command('list')
  .description('List all installed connectors')
  .action(async () => {
    const client = createClient();
    console.log(await executeList(client));
  });

// --- inspect ---
program
  .command('inspect <connector>')
  .description('Show full details of a connector')
  .action(async (connector: string) => {
    const client = createClient();
    console.log(await executeInspect(client, connector));
  });

// --- validate ---
program
  .command('validate <file>')
  .description('Validate a connector YAML file')
  .action((file: string) => {
    console.log(executeValidate(file));
  });

// --- daemon ---
const daemon = program
  .command('daemon')
  .description('Manage the daemon process');

daemon
  .command('status')
  .description('Check daemon status')
  .action(async () => {
    console.log(await executeDaemonStatus(BASE_URL));
  });

daemon
  .command('start')
  .description('Start the daemon in background')
  .action(async () => {
    console.log(await executeDaemonStart(BASE_URL, CG_HOME, DAEMON_SCRIPT));
  });

daemon
  .command('stop')
  .description('Stop the daemon')
  .action(async () => {
    console.log(await executeDaemonStop(CG_HOME));
  });

// --- audit ---
const audit = program
  .command('audit')
  .description('View audit event log');

audit
  .command('list')
  .description('List recent audit events')
  .option('--since <duration>', 'time window, e.g. 7d, 2w, 12h')
  .option('--connector <pattern>', 'filter by connector pattern, e.g. test/*')
  .option('--limit <n>', 'max events to return', '100')
  .action(async (opts: { since?: string; connector?: string; limit: string }) => {
    const client = createClient();
    const filter: { since?: string; connector?: string; limit?: number } = {};
    if (opts.since) filter.since = parseDuration(opts.since).toISOString();
    if (opts.connector) filter.connector = opts.connector;
    filter.limit = parseInt(opts.limit, 10);
    console.log(await executeAuditList(client, filter));
  });

audit
  .command('export')
  .description('Export audit events')
  .option('--format <format>', 'export format: json, csv', 'json')
  .option('--since <duration>', 'time window, e.g. 7d, 30d')
  .option('--connector <pattern>', 'filter by connector pattern')
  .action(async (opts: { format: string; since?: string; connector?: string }) => {
    const client = createClient();
    const filter: { since?: string; connector?: string } = {};
    if (opts.since) filter.since = parseDuration(opts.since).toISOString();
    if (opts.connector) filter.connector = opts.connector;
    console.log(await executeAuditExport(client, filter, opts.format as 'json' | 'csv'));
  });

// --- config ---
const config = program
  .command('config')
  .description('Manage daemon configuration');

config
  .command('show')
  .description('Show current configuration')
  .action(() => {
    console.log(executeConfigShow(CONFIG_PATH));
  });

config
  .command('set <key> <value>')
  .description('Set a configuration value (e.g. daemon.port 9999)')
  .action((key: string, value: string) => {
    console.log(executeConfigSet(CONFIG_PATH, key, value));
  });

program.parse();
```

- [ ] **Step 2: Verify TypeScript compiles**

Run from `commandGarden/cli/`:
```bash
npx tsc --noEmit
```
Expected: No errors

- [ ] **Step 3: Run all CLI tests**

Run from `commandGarden/cli/`:
```bash
npx vitest run
```
Expected: All tests pass (~50+ tests)

- [ ] **Step 4: Run full workspace tests**

Run from `commandGarden/`:
```bash
npm test
```
Expected: All tests across shared (97), daemon (50+), cli (50+) pass

- [ ] **Step 5: Commit**

```bash
git add commandGarden/cli/src/main.ts
git commit -m "feat(cli): wire all commands into commander entry point"
```

- [ ] **Step 6: Final verification commit**

```bash
git add -A
git commit -m "feat(cli): final verification — all CLI tests passing"
```
