# commandGarden GUI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a web GUI for commandGarden with an app server (Fastify), React SPA (Vite + Tailwind + DaisyUI), and CLI commands to manage it.

**Architecture:** Three-tier — GUI (React SPA) → App Server (Fastify, :19826) → Daemon (:19825). The app server proxies daemon calls, enriches responses, owns app-specific SQLite persistence, and serves the SPA as static files. The daemon gets one new endpoint (`GET /api/config`).

**Tech Stack:** Fastify, better-sqlite3, React 18, React Router, Vite, Tailwind CSS, DaisyUI, Vitest

## Global constraints

- Node.js >= 20
- ESM modules (`"type": "module"`) throughout
- Existing code uses Vitest for testing, Commander.js for CLI, Fastify for HTTP
- DaisyUI `data-theme="light"` (dark mode deferred)
- All servers bind to `127.0.0.1` only
- Daemon port: 19825, app server port: 19826 (configurable via `app.port` in config.yaml)
- Layout mockup reference: `commandGarden/app-mockup.html`
- Design spec: `docs/superpowers/specs/2026-07-01-commandgarden-gui-design.md`

---

## File map

### Daemon (modify)
- `daemon/src/server.ts` — add `GET /api/config` endpoint
- `daemon/src/server.test.ts` — add test for config endpoint

### App workspace (create)
- `app/package.json`
- `app/tsconfig.json` — client TS config
- `app/tsconfig.server.json` — server TS config
- `app/vite.config.ts`
- `app/tailwind.config.js`
- `app/postcss.config.js`
- `app/index.html` — Vite SPA entry
- `app/src/server/main.ts` — Fastify entry point
- `app/src/server/daemon-client.ts` — HTTP client for daemon API
- `app/src/server/daemon-client.test.ts`
- `app/src/server/store.ts` — SQLite store (preferences, saved views)
- `app/src/server/store.test.ts`
- `app/src/server/routes/status.ts`
- `app/src/server/routes/connectors.ts`
- `app/src/server/routes/run.ts`
- `app/src/server/routes/audit.ts`
- `app/src/server/routes/config.ts`
- `app/src/server/routes/preferences.ts`
- `app/src/server/routes/index.ts` — register all routes
- `app/src/server/routes/routes.test.ts`
- `app/src/client/main.tsx` — React entry
- `app/src/client/App.tsx` — Router + sidebar layout
- `app/src/client/api.ts` — fetch wrapper for app server API
- `app/src/client/pages/Dashboard.tsx`
- `app/src/client/pages/Connectors.tsx`
- `app/src/client/pages/ConnectorRun.tsx`
- `app/src/client/pages/Audit.tsx`
- `app/src/client/pages/Config.tsx`
- `app/src/client/pages/Guide.tsx`
- `app/src/client/pages/Timetracking.tsx`
- `app/src/client/pages/Rooms.tsx`
- `app/src/client/components/Spinner.tsx`
- `app/src/client/components/AuthRequiredCallout.tsx`
- `app/src/client/components/RoomCombobox.tsx`
- `app/src/client/components/TimelineView.tsx`
- `app/src/client/globals.css`

### CLI (modify)
- `cli/src/commands/gui-cmd.ts` — `cg gui`, `cg gui stop`, `cg gui status`
- `cli/src/commands/gui-cmd.test.ts`
- `cli/src/commands/up-down.ts` — `cg up`, `cg down`
- `cli/src/commands/up-down.test.ts`
- `cli/src/main.ts` — register new commands

### Monorepo root (modify)
- `commandGarden/package.json` — add `app` workspace

---

### Task 1: Daemon — add GET /api/config endpoint

**Files:**
- Modify: `commandGarden/daemon/src/server.ts`
- Modify: `commandGarden/daemon/src/server.test.ts`

**Interfaces:**
- Consumes: `deps.configPath` (string, path to config.yaml — already in `ServerDeps`)
- Produces: `GET /api/config` → `{ ok: true, config: Record<string, unknown> }`

- [ ] **Step 1: Write the failing test**

Add to `commandGarden/daemon/src/server.test.ts`. Find the existing test file and add a describe block for the config endpoint. The test setup pattern already exists in this file — follow it.

```typescript
describe('GET /api/config', () => {
  it('returns parsed config when file exists', async () => {
    // Write a test config file
    const configPath = join(tmpDir, 'config.yaml');
    writeFileSync(configPath, 'daemon:\n  port: 19825\nsecurity:\n  extensionId: "test-ext"\n');

    const resp = await app.inject({
      method: 'GET',
      url: '/api/config',
      headers: { authorization: `Bearer ${sessionToken}`, 'x-commandgarden': '1' },
    });

    expect(resp.statusCode).toBe(200);
    const body = JSON.parse(resp.payload);
    expect(body.ok).toBe(true);
    expect(body.config.daemon.port).toBe(19825);
    expect(body.config.security.extensionId).toBe('test-ext');
  });

  it('returns empty config when file does not exist', async () => {
    // Use a non-existent config path (set during server creation)
    const resp = await app.inject({
      method: 'GET',
      url: '/api/config',
      headers: { authorization: `Bearer ${sessionToken}`, 'x-commandgarden': '1' },
    });

    expect(resp.statusCode).toBe(200);
    const body = JSON.parse(resp.payload);
    expect(body.ok).toBe(true);
    expect(body.config).toEqual({});
  });

  it('requires auth', async () => {
    const resp = await app.inject({ method: 'GET', url: '/api/config' });
    expect(resp.statusCode).toBe(403);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w daemon -- --reporter=verbose 2>&1 | head -40`
Expected: FAIL — route not found, 404 for GET /api/config

- [ ] **Step 3: Add the endpoint to server.ts**

In `commandGarden/daemon/src/server.ts`, add after the existing `app.get('/api/audit/:id', ...)` block:

```typescript
app.get('/api/config', async () => {
  const { readFileSync, existsSync } = await import('node:fs');
  const { parse: parseYaml } = await import('yaml');
  let config: Record<string, unknown> = {};
  if (existsSync(deps.configPath)) {
    config = (parseYaml(readFileSync(deps.configPath, 'utf-8')) as Record<string, unknown>) ?? {};
  }
  return { ok: true, config };
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -w daemon -- --reporter=verbose 2>&1 | tail -20`
Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add daemon/src/server.ts daemon/src/server.test.ts
git commit -m "feat(daemon): add GET /api/config endpoint"
```

---

### Task 2: App workspace scaffold + server core + daemon client

**Files:**
- Create: `app/package.json`, `app/tsconfig.json`, `app/tsconfig.server.json`, `app/vite.config.ts`, `app/tailwind.config.js`, `app/postcss.config.js`, `app/index.html`, `app/src/client/globals.css`
- Create: `app/src/server/main.ts`, `app/src/server/daemon-client.ts`, `app/src/server/daemon-client.test.ts`
- Modify: `commandGarden/package.json` — add `app` to workspaces

**Interfaces:**
- Consumes: daemon API at `http://127.0.0.1:19825`
- Produces:
  - `DaemonClient` class with methods: `get<T>(path: string): Promise<T>`, `post<T>(path: string, body: unknown): Promise<T>`, `pipeSse(path: string, reply: FastifyReply): Promise<void>`
  - App server entry point at `app/src/server/main.ts`

- [ ] **Step 1: Add `app` to monorepo workspaces**

In `commandGarden/package.json`, change workspaces:

```json
{
  "workspaces": ["shared", "daemon", "cli", "chrome", "app"]
}
```

- [ ] **Step 2: Create `app/package.json`**

```json
{
  "name": "@commandgarden/app",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "vite build && tsc -p tsconfig.server.json",
    "dev": "concurrently \"vite\" \"tsx watch src/server/main.ts\"",
    "start": "node dist/server/main.js",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "fastify": "^5.0.0",
    "@fastify/static": "^8.0.0",
    "better-sqlite3": "^11.0.0",
    "yaml": "^2.4.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "react-router-dom": "^6.23.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.0",
    "@types/node": "^22.0.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "autoprefixer": "^10.4.0",
    "concurrently": "^9.0.0",
    "daisyui": "^4.12.0",
    "postcss": "^8.4.0",
    "tailwindcss": "^3.4.0",
    "tsx": "^4.0.0",
    "typescript": "^5.4.0",
    "vite": "^5.4.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 3: Create TypeScript configs**

`app/tsconfig.json` (for client code, used by Vite):

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist/client",
    "rootDir": "src/client",
    "lib": ["ES2022", "DOM", "DOM.Iterable"]
  },
  "include": ["src/client"]
}
```

`app/tsconfig.server.json` (for server code):

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "node16",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist/server",
    "rootDir": "src/server",
    "declaration": false
  },
  "include": ["src/server"]
}
```

- [ ] **Step 4: Create Vite + Tailwind + PostCSS configs**

`app/vite.config.ts`:

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  root: '.',
  build: {
    outDir: 'dist/client',
    emptyDirFirst: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:19826',
    },
  },
});
```

`app/tailwind.config.js`:

```javascript
import daisyui from 'daisyui';

export default {
  content: ['./index.html', './src/client/**/*.{ts,tsx}'],
  plugins: [daisyui],
  daisyui: {
    themes: ['light'],
  },
};
```

`app/postcss.config.js`:

```javascript
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

- [ ] **Step 5: Create `app/index.html` and `app/src/client/globals.css`**

`app/index.html`:

```html
<!DOCTYPE html>
<html lang="en" data-theme="light">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>commandGarden</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/client/main.tsx"></script>
</body>
</html>
```

`app/src/client/globals.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 6: Write daemon-client tests**

Create `app/src/server/daemon-client.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DaemonClient } from './daemon-client.js';

describe('DaemonClient', () => {
  let client: DaemonClient;
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
    client = new DaemonClient('http://127.0.0.1:19825', 'test-token');
    mockFetch.mockReset();
  });

  it('sends auth headers on GET', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ ok: true, data: 'test' }),
    });
    await client.get('/api/status');
    expect(mockFetch).toHaveBeenCalledWith(
      'http://127.0.0.1:19825/api/status',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token',
          'X-CommandGarden': '1',
        }),
      }),
    );
  });

  it('sends body on POST', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ ok: true }),
    });
    await client.post('/api/run', { connector: 'test/cmd', args: {} });
    const call = mockFetch.mock.calls[0];
    expect(call[1].method).toBe('POST');
    expect(JSON.parse(call[1].body)).toEqual({ connector: 'test/cmd', args: {} });
  });

  it('throws on non-ok response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ error: 'Unauthorized' }),
    });
    await expect(client.get('/api/status')).rejects.toThrow('Unauthorized');
  });

  it('throws on network error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('fetch failed'));
    await expect(client.get('/api/status')).rejects.toThrow('Cannot connect to daemon');
  });
});
```

- [ ] **Step 7: Run test to verify it fails**

Run: `cd commandGarden && npm install && npm test -w app -- --reporter=verbose 2>&1 | head -30`
Expected: FAIL — DaemonClient not found

- [ ] **Step 8: Implement DaemonClient**

Create `app/src/server/daemon-client.ts`:

```typescript
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

  async pipeRaw(path: string): Promise<Response> {
    const resp = await this.rawFetch(path, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'X-CommandGarden': '1',
        Accept: 'text/event-stream',
      },
    });
    if (!resp.ok) throw new Error(`SSE connection failed: HTTP ${resp.status}`);
    return resp;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    let resp: Response;
    try {
      resp = await this.rawFetch(path, {
        method,
        headers: {
          Authorization: `Bearer ${this.token}`,
          'X-CommandGarden': '1',
          'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new Error('Cannot connect to daemon. Is it running? Try: cg daemon start');
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

- [ ] **Step 9: Create server entry point**

Create `app/src/server/main.ts`. This file imports `AppStore` (Task 3) and `registerRoutes` (Task 4) — it compiles after those tasks are done. The daemon-client tests run independently in the meantime.

```typescript
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { parse as parseYaml } from 'yaml';
import { readFileSync } from 'node:fs';
import { DaemonClient, readToken } from './daemon-client.js';
import { AppStore } from './store.js';
import { registerRoutes } from './routes/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CG_HOME = join(homedir(), '.commandgarden');
const CONFIG_PATH = join(CG_HOME, 'config.yaml');
const TOKEN_PATH = join(CG_HOME, 'session-token');

function readAppPort(): number {
  try {
    if (existsSync(CONFIG_PATH)) {
      const config = parseYaml(readFileSync(CONFIG_PATH, 'utf-8')) as Record<string, Record<string, unknown>>;
      const port = config?.app?.port;
      if (typeof port === 'number') return port;
    }
  } catch { /* use default */ }
  return 19826;
}

async function start() {
  const token = readToken(TOKEN_PATH);
  if (!token) {
    console.error('No session token found. Is the daemon running?');
    process.exit(1);
  }

  const port = readAppPort();
  const daemonUrl = 'http://127.0.0.1:19825';
  const daemon = new DaemonClient(daemonUrl, token);
  const store = new AppStore(join(CG_HOME, 'app.db'));
  const app = Fastify();

  registerRoutes(app, daemon, store);

  // Serve static SPA files in production
  const clientDir = join(__dirname, '..', 'client');
  if (existsSync(clientDir)) {
    await app.register(fastifyStatic, {
      root: clientDir,
      wildcard: false,
    });
    // SPA fallback: serve index.html for all non-API routes
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/')) {
        reply.code(404).send({ ok: false, error: 'Not found' });
      } else {
        reply.sendFile('index.html');
      }
    });
  }

  await app.listen({ port, host: '127.0.0.1' });
  console.log(`commandGarden GUI running at http://127.0.0.1:${port}`);
}

start().catch((err) => {
  console.error('Failed to start:', err);
  process.exit(1);
});
```

- [ ] **Step 10: Run tests to verify daemon-client tests pass**

Run: `npm test -w app -- --reporter=verbose 2>&1 | tail -20`
Expected: DaemonClient tests PASS (store and routes tests will fail — not created yet)

- [ ] **Step 11: Commit**

```bash
git add commandGarden/package.json app/
git commit -m "feat(app): scaffold workspace, daemon client, server entry point"
```

---

### Task 3: App server SQLite store

**Files:**
- Create: `app/src/server/store.ts`
- Create: `app/src/server/store.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `AppStore` class with methods:
  - `getPreference(key: string): string | undefined`
  - `setPreference(key: string, value: string): void`
  - `getAllPreferences(): Record<string, string>`
  - `listViews(app: string): SavedView[]`
  - `createView(app: string, name: string, config: string): SavedView`
  - `deleteView(id: string): boolean`

- [ ] **Step 1: Write store tests**

Create `app/src/server/store.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AppStore } from './store.js';
import Database from 'better-sqlite3';

describe('AppStore', () => {
  let store: AppStore;

  beforeEach(() => {
    store = new AppStore(':memory:');
  });

  afterEach(() => {
    store.close();
  });

  describe('preferences', () => {
    it('returns undefined for missing key', () => {
      expect(store.getPreference('missing')).toBeUndefined();
    });

    it('sets and gets a preference', () => {
      store.setPreference('theme', 'light');
      expect(store.getPreference('theme')).toBe('light');
    });

    it('overwrites existing preference', () => {
      store.setPreference('theme', 'light');
      store.setPreference('theme', 'dark');
      expect(store.getPreference('theme')).toBe('dark');
    });

    it('returns all preferences', () => {
      store.setPreference('a', '1');
      store.setPreference('b', '2');
      expect(store.getAllPreferences()).toEqual({ a: '1', b: '2' });
    });
  });

  describe('saved views', () => {
    it('returns empty array when no views', () => {
      expect(store.listViews('timetracking')).toEqual([]);
    });

    it('creates and lists a view', () => {
      const view = store.createView('timetracking', 'June report', '{"month":"2026-06"}');
      expect(view.id).toBeDefined();
      expect(view.app).toBe('timetracking');
      expect(view.name).toBe('June report');
      expect(view.config).toBe('{"month":"2026-06"}');

      const views = store.listViews('timetracking');
      expect(views).toHaveLength(1);
      expect(views[0].name).toBe('June report');
    });

    it('filters views by app', () => {
      store.createView('timetracking', 'View A', '{}');
      store.createView('rooms', 'View B', '{}');
      expect(store.listViews('timetracking')).toHaveLength(1);
      expect(store.listViews('rooms')).toHaveLength(1);
    });

    it('deletes a view', () => {
      const view = store.createView('timetracking', 'To delete', '{}');
      expect(store.deleteView(view.id)).toBe(true);
      expect(store.listViews('timetracking')).toHaveLength(0);
    });

    it('returns false when deleting non-existent view', () => {
      expect(store.deleteView('nonexistent')).toBe(false);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w app -- --reporter=verbose 2>&1 | head -20`
Expected: FAIL — AppStore not found

- [ ] **Step 3: Implement AppStore**

Create `app/src/server/store.ts`:

```typescript
import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

export interface SavedView {
  id: string;
  app: string;
  name: string;
  config: string;
  created_at: string;
}

export class AppStore {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS preferences (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS saved_views (
        id          TEXT PRIMARY KEY,
        app         TEXT NOT NULL,
        name        TEXT NOT NULL,
        config      TEXT NOT NULL,
        created_at  TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
  }

  getPreference(key: string): string | undefined {
    const row = this.db.prepare('SELECT value FROM preferences WHERE key = ?').get(key) as { value: string } | undefined;
    return row?.value;
  }

  setPreference(key: string, value: string): void {
    this.db.prepare('INSERT OR REPLACE INTO preferences (key, value) VALUES (?, ?)').run(key, value);
  }

  getAllPreferences(): Record<string, string> {
    const rows = this.db.prepare('SELECT key, value FROM preferences').all() as { key: string; value: string }[];
    const result: Record<string, string> = {};
    for (const row of rows) result[row.key] = row.value;
    return result;
  }

  listViews(app: string): SavedView[] {
    return this.db.prepare('SELECT * FROM saved_views WHERE app = ? ORDER BY created_at DESC').all(app) as SavedView[];
  }

  createView(app: string, name: string, config: string): SavedView {
    const id = randomUUID();
    const created_at = new Date().toISOString();
    this.db.prepare('INSERT INTO saved_views (id, app, name, config, created_at) VALUES (?, ?, ?, ?, ?)').run(id, app, name, config, created_at);
    return { id, app, name, config, created_at };
  }

  deleteView(id: string): boolean {
    const result = this.db.prepare('DELETE FROM saved_views WHERE id = ?').run(id);
    return result.changes > 0;
  }

  close(): void {
    this.db.close();
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -w app -- --reporter=verbose 2>&1 | tail -20`
Expected: all store tests PASS

- [ ] **Step 5: Commit**

```bash
git add app/src/server/store.ts app/src/server/store.test.ts
git commit -m "feat(app): SQLite store for preferences and saved views"
```

---

### Task 4: App server facade routes

**Files:**
- Create: `app/src/server/routes/status.ts`, `connectors.ts`, `run.ts`, `audit.ts`, `config.ts`, `preferences.ts`, `index.ts`
- Create: `app/src/server/routes/routes.test.ts`

**Interfaces:**
- Consumes: `DaemonClient` from Task 2, `AppStore` from Task 3
- Produces: Fastify route registrations, `registerRoutes(app, daemon, store)` function

- [ ] **Step 1: Write route tests**

Create `app/src/server/routes/routes.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { registerRoutes } from './index.js';
import { DaemonClient } from '../daemon-client.js';
import { AppStore } from '../store.js';

function mockDaemon() {
  return {
    get: vi.fn(),
    post: vi.fn(),
    pipeRaw: vi.fn(),
  } as unknown as DaemonClient;
}

describe('routes', () => {
  let app: ReturnType<typeof Fastify>;
  let daemon: ReturnType<typeof mockDaemon>;
  let store: AppStore;

  beforeEach(async () => {
    app = Fastify();
    daemon = mockDaemon();
    store = new AppStore(':memory:');
    registerRoutes(app, daemon, store);
    await app.ready();
  });

  describe('GET /api/status', () => {
    it('proxies daemon status', async () => {
      (daemon.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true, extensionConnected: true, connectorCount: 2,
      });
      const resp = await app.inject({ method: 'GET', url: '/api/status' });
      expect(resp.statusCode).toBe(200);
      const body = JSON.parse(resp.payload);
      expect(body.ok).toBe(true);
      expect(body.extensionConnected).toBe(true);
    });
  });

  describe('GET /api/connectors', () => {
    it('proxies and enriches connector list', async () => {
      (daemon.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        connectors: [
          { key: 'timetracking/report', description: 'test', access: 'read', domains: [], capabilities: [] },
        ],
      });
      const resp = await app.inject({ method: 'GET', url: '/api/connectors' });
      expect(resp.statusCode).toBe(200);
      const body = JSON.parse(resp.payload);
      expect(body.connectors).toHaveLength(1);
      expect(body.connectors[0].hasAppPage).toBe(true);
      expect(body.connectors[0].appRoute).toBe('/apps/timetracking');
    });
  });

  describe('GET /api/preferences', () => {
    it('returns empty preferences', async () => {
      const resp = await app.inject({ method: 'GET', url: '/api/preferences' });
      expect(resp.statusCode).toBe(200);
      expect(JSON.parse(resp.payload)).toEqual({ ok: true, preferences: {} });
    });

    it('sets and gets a preference via PUT', async () => {
      await app.inject({
        method: 'PUT', url: '/api/preferences',
        payload: { key: 'theme', value: 'dark' },
      });
      const resp = await app.inject({ method: 'GET', url: '/api/preferences' });
      expect(JSON.parse(resp.payload).preferences).toEqual({ theme: 'dark' });
    });
  });

  describe('POST /api/run', () => {
    it('proxies run to daemon', async () => {
      (daemon.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true, data: [{ a: 1 }], rowCount: 1,
      });
      const resp = await app.inject({
        method: 'POST', url: '/api/run',
        payload: { connector: 'test/cmd', args: {} },
      });
      expect(resp.statusCode).toBe(200);
      expect(JSON.parse(resp.payload).ok).toBe(true);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w app -- --reporter=verbose 2>&1 | head -20`
Expected: FAIL — cannot import routes/index.js

- [ ] **Step 3: Implement route files**

Create `app/src/server/routes/status.ts`:

```typescript
import type { FastifyInstance } from 'fastify';
import type { DaemonClient } from '../daemon-client.js';

export function statusRoutes(app: FastifyInstance, daemon: DaemonClient): void {
  app.get('/api/status', async (req, reply) => {
    try {
      const data = await daemon.get('/api/status');
      return data;
    } catch (err) {
      reply.code(503).send({ ok: false, error: err instanceof Error ? err.message : 'Daemon unreachable' });
    }
  });
}
```

Create `app/src/server/routes/connectors.ts`:

```typescript
import type { FastifyInstance } from 'fastify';
import type { DaemonClient } from '../daemon-client.js';

const APP_ROUTES: Record<string, string> = {
  'timetracking/report': '/apps/timetracking',
  'teams/room-availability': '/apps/rooms',
};

export function connectorRoutes(app: FastifyInstance, daemon: DaemonClient): void {
  app.get('/api/connectors', async () => {
    const data = await daemon.get<{ ok: boolean; connectors: Record<string, unknown>[] }>('/api/connectors');
    const enriched = data.connectors.map((c: Record<string, unknown>) => ({
      ...c,
      hasAppPage: (c.key as string) in APP_ROUTES,
      appRoute: APP_ROUTES[c.key as string] ?? null,
    }));
    return { ok: true, connectors: enriched };
  });

  app.get('/api/connectors/:site/:name', async (req) => {
    const { site, name } = req.params as { site: string; name: string };
    return daemon.get(`/api/connectors/${site}/${name}`);
  });
}
```

Create `app/src/server/routes/run.ts`:

```typescript
import type { FastifyInstance, FastifyReply } from 'fastify';
import type { DaemonClient } from '../daemon-client.js';

export function runRoutes(app: FastifyInstance, daemon: DaemonClient): void {
  app.post('/api/run', async (req) => {
    return daemon.post('/api/run', req.body);
  });

  app.post('/api/approval', async (req) => {
    return daemon.post('/api/approval', req.body);
  });

  app.get('/api/run/events/:requestId', async (req, reply) => {
    const { requestId } = req.params as { requestId: string };
    try {
      const resp = await daemon.pipeRaw(`/api/run/events/${requestId}`);
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });
      const reader = (resp.body as ReadableStream<Uint8Array>).getReader();
      const pump = async () => {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          reply.raw.write(value);
        }
        reply.raw.end();
      };
      pump().catch(() => reply.raw.end());
      req.raw.on('close', () => reader.cancel());
    } catch (err) {
      reply.code(502).send({ ok: false, error: 'Failed to connect to daemon SSE' });
    }
  });
}
```

Create `app/src/server/routes/audit.ts`:

```typescript
import type { FastifyInstance } from 'fastify';
import type { DaemonClient } from '../daemon-client.js';

export function auditRoutes(app: FastifyInstance, daemon: DaemonClient): void {
  app.get('/api/audit', async (req) => {
    const query = req.query as Record<string, string>;
    const params = new URLSearchParams();
    if (query.since) params.set('since', query.since);
    if (query.connector) params.set('connector', query.connector);
    if (query.type) params.set('type', query.type);
    if (query.limit) params.set('limit', query.limit);
    const qs = params.toString();
    return daemon.get(`/api/audit${qs ? `?${qs}` : ''}`);
  });

  app.get('/api/audit/:id', async (req) => {
    const { id } = req.params as { id: string };
    return daemon.get(`/api/audit/${id}`);
  });
}
```

Create `app/src/server/routes/config.ts`:

```typescript
import type { FastifyInstance } from 'fastify';
import type { DaemonClient } from '../daemon-client.js';

export function configRoutes(app: FastifyInstance, daemon: DaemonClient): void {
  app.get('/api/config', async () => {
    return daemon.get('/api/config');
  });

  app.post('/api/config', async (req) => {
    return daemon.post('/api/config', req.body);
  });
}
```

Create `app/src/server/routes/preferences.ts`:

```typescript
import type { FastifyInstance } from 'fastify';
import type { AppStore } from '../store.js';

export function preferencesRoutes(app: FastifyInstance, store: AppStore): void {
  app.get('/api/preferences', async () => {
    return { ok: true, preferences: store.getAllPreferences() };
  });

  app.put('/api/preferences', async (req) => {
    const { key, value } = req.body as { key: string; value: string };
    if (!key || value === undefined) {
      return { ok: false, error: 'Missing key or value' };
    }
    store.setPreference(key, value);
    return { ok: true };
  });

  app.get('/api/views', async (req) => {
    const { app: appName } = req.query as { app: string };
    if (!appName) return { ok: true, views: [] };
    return { ok: true, views: store.listViews(appName) };
  });

  app.post('/api/views', async (req) => {
    const { app: appName, name, config } = req.body as { app: string; name: string; config: string };
    if (!appName || !name || !config) {
      return { ok: false, error: 'Missing app, name, or config' };
    }
    const view = store.createView(appName, name, config);
    return { ok: true, view };
  });

  app.delete('/api/views/:id', async (req) => {
    const { id } = req.params as { id: string };
    const deleted = store.deleteView(id);
    return { ok: deleted, error: deleted ? undefined : 'View not found' };
  });
}
```

Create `app/src/server/routes/index.ts`:

```typescript
import type { FastifyInstance } from 'fastify';
import type { DaemonClient } from '../daemon-client.js';
import type { AppStore } from '../store.js';
import { statusRoutes } from './status.js';
import { connectorRoutes } from './connectors.js';
import { runRoutes } from './run.js';
import { auditRoutes } from './audit.js';
import { configRoutes } from './config.js';
import { preferencesRoutes } from './preferences.js';

export function registerRoutes(app: FastifyInstance, daemon: DaemonClient, store: AppStore): void {
  statusRoutes(app, daemon);
  connectorRoutes(app, daemon);
  runRoutes(app, daemon);
  auditRoutes(app, daemon);
  configRoutes(app, daemon);
  preferencesRoutes(app, store);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -w app -- --reporter=verbose 2>&1 | tail -30`
Expected: all route tests PASS

- [ ] **Step 5: Commit**

```bash
git add app/src/server/routes/
git commit -m "feat(app): facade routes for daemon proxy and preferences"
```

---

### Task 5: GUI shell — React app, router, sidebar layout

**Files:**
- Create: `app/src/client/main.tsx`, `app/src/client/App.tsx`, `app/src/client/api.ts`

**Interfaces:**
- Consumes: app server API at `/api/*`
- Produces:
  - `api` object with methods: `getStatus()`, `getConnectors()`, `getConnector(site, name)`, `run(connector, args)`, `getAudit(params)`, `getAuditEvent(id)`, `getConfig()`, `setConfig(key, value)`, `getPreferences()`, `setPreference(key, value)`
  - `<App />` component with sidebar + `<Outlet />` for page content

- [ ] **Step 1: Create API client**

Create `app/src/client/api.ts`:

```typescript
async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const init: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body) init.body = JSON.stringify(body);
  const resp = await fetch(path, init);
  const data = await resp.json();
  if (!resp.ok) throw new Error((data as Record<string, string>).error ?? `HTTP ${resp.status}`);
  return data as T;
}

export const api = {
  getStatus: () => request<{ ok: boolean; extensionConnected: boolean; connectorCount: number }>('GET', '/api/status'),
  getConnectors: () => request<{ ok: boolean; connectors: Connector[] }>('GET', '/api/connectors'),
  getConnector: (site: string, name: string) => request<{ ok: boolean; connector: ConnectorDetail }>('GET', `/api/connectors/${site}/${name}`),
  run: (connector: string, args: Record<string, string>) => request<RunResponse>('POST', '/api/run', { connector, args }),
  approve: (approvalId: string, approved: boolean) => request('POST', '/api/approval', { approvalId, approved }),
  getAudit: (params: Record<string, string>) => {
    const qs = new URLSearchParams(params).toString();
    return request<{ ok: boolean; events: AuditEvent[]; count: number }>('GET', `/api/audit${qs ? `?${qs}` : ''}`);
  },
  getAuditEvent: (id: string) => request<{ ok: boolean; event: AuditEvent }>('GET', `/api/audit/${id}`),
  getConfig: () => request<{ ok: boolean; config: Record<string, Record<string, unknown>> }>('GET', '/api/config'),
  setConfig: (key: string, value: string) => request('POST', '/api/config', { key, value }),
  getPreferences: () => request<{ ok: boolean; preferences: Record<string, string> }>('GET', '/api/preferences'),
  setPreference: (key: string, value: string) => request('PUT', '/api/preferences', { key, value }),
};

export interface Connector {
  key: string;
  description: string;
  access: string;
  domains: string[];
  capabilities: string[];
  hasAppPage: boolean;
  appRoute: string | null;
}

export interface ConnectorDetail {
  site: string;
  name: string;
  version: string;
  description: string;
  access: string;
  domains: string[];
  capabilities: string[];
  args: { name: string; type: string; required: boolean; help: string; pattern?: string }[];
  columns: { name: string; type: string }[];
}

export interface RunResponse {
  ok: boolean;
  data: Record<string, unknown>[];
  columns?: string[];
  rowCount?: number;
  durationMs?: number;
  error?: string;
  requestId?: string;
  requiresApproval?: boolean;
  connector?: string;
}

export interface AuditEvent {
  id: string;
  type: string;
  connector: string;
  user: string;
  timestamp: string;
  durationMs?: number;
  error?: string;
  correlationId?: string;
  connectorHash?: string;
  args?: Record<string, string>;
  domains?: string[];
  capabilities?: string[];
  rowCount?: number;
  columns?: string[];
  steps?: { step: string; capability: string; durationMs: number; error?: string }[];
}
```

- [ ] **Step 2: Create App shell with sidebar**

Create `app/src/client/App.tsx`:

```tsx
import { BrowserRouter, Routes, Route, NavLink, Outlet } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { api } from './api';
import Dashboard from './pages/Dashboard';
import Connectors from './pages/Connectors';
import ConnectorRun from './pages/ConnectorRun';
import Audit from './pages/Audit';
import Config from './pages/Config';
import Guide from './pages/Guide';
import Timetracking from './pages/Timetracking';
import Rooms from './pages/Rooms';

function navClass({ isActive }: { isActive: boolean }) {
  return `block px-3 py-2 rounded-lg text-sm transition-colors ${isActive ? 'bg-base-300 font-semibold' : 'hover:bg-base-300'}`;
}

function Layout() {
  const [daemonOk, setDaemonOk] = useState(false);
  const [extensionOk, setExtensionOk] = useState(false);

  useEffect(() => {
    const poll = () => {
      api.getStatus()
        .then((s) => { setDaemonOk(s.ok); setExtensionOk(s.extensionConnected); })
        .catch(() => { setDaemonOk(false); setExtensionOk(false); });
    };
    poll();
    const id = setInterval(poll, 30_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex min-h-screen">
      <aside className="w-60 bg-base-200 border-r border-base-300 flex flex-col fixed top-0 left-0 bottom-0">
        <div className="p-4 border-b border-base-300">
          <h1 className="text-lg font-bold tracking-tight">commandGarden</h1>
          <p className="text-xs opacity-50 mt-0.5">Browser automation platform</p>
        </div>
        <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
          <div className="px-2 pt-3 pb-1 text-xs font-semibold opacity-40 uppercase tracking-wider">Overview</div>
          <NavLink to="/" end className={navClass}>Dashboard</NavLink>

          <div className="px-2 pt-4 pb-1 text-xs font-semibold opacity-40 uppercase tracking-wider">Apps</div>
          <NavLink to="/apps/timetracking" className={navClass}>Time Tracking</NavLink>
          <NavLink to="/apps/rooms" className={navClass}>Room Availability</NavLink>

          <div className="px-2 pt-4 pb-1 text-xs font-semibold opacity-40 uppercase tracking-wider">Platform</div>
          <NavLink to="/connectors" className={navClass}>Connectors</NavLink>
          <NavLink to="/audit" className={navClass}>Audit Log</NavLink>
          <NavLink to="/config" className={navClass}>Configuration</NavLink>

          <div className="px-2 pt-4 pb-1 text-xs font-semibold opacity-40 uppercase tracking-wider">Help</div>
          <NavLink to="/guide" className={navClass}>Setup Guide</NavLink>
        </nav>
        <div className="p-3 border-t border-base-300">
          <div className="flex items-center gap-2 text-xs">
            <span className={`w-2 h-2 rounded-full ${daemonOk ? 'bg-success' : 'bg-error'}`} />
            <span className="opacity-60">{daemonOk ? 'Daemon connected' : 'Daemon offline'}</span>
          </div>
          <div className="flex items-center gap-2 text-xs mt-1">
            <span className={`w-2 h-2 rounded-full ${extensionOk ? 'bg-success' : 'bg-error'}`} />
            <span className="opacity-60">{extensionOk ? 'Extension linked' : 'Extension disconnected'}</span>
          </div>
        </div>
      </aside>
      <main className="ml-60 flex-1 p-6">
        <Outlet />
      </main>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="connectors" element={<Connectors />} />
          <Route path="connectors/:site/:name" element={<ConnectorRun />} />
          <Route path="audit" element={<Audit />} />
          <Route path="config" element={<Config />} />
          <Route path="guide" element={<Guide />} />
          <Route path="apps/timetracking" element={<Timetracking />} />
          <Route path="apps/rooms" element={<Rooms />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
```

- [ ] **Step 3: Create React entry point**

Create `app/src/client/main.tsx`:

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './globals.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 4: Create placeholder pages**

Create a placeholder for each page so the app compiles. Each page will be replaced in subsequent tasks. Create these files, each exporting a default component:

`app/src/client/pages/Dashboard.tsx`:
```tsx
export default function Dashboard() {
  return <div><h2 className="text-2xl font-bold">Dashboard</h2><p className="opacity-50">Loading...</p></div>;
}
```

Create the same pattern for: `Connectors.tsx`, `ConnectorRun.tsx`, `Audit.tsx`, `Config.tsx`, `Guide.tsx`, `Timetracking.tsx`, `Rooms.tsx` — each with its page name as heading.

- [ ] **Step 5: Verify the app builds**

Run: `cd commandGarden/app && npx vite build 2>&1 | tail -10`
Expected: build succeeds, output in `dist/client/`

- [ ] **Step 6: Commit**

```bash
git add app/src/client/ app/index.html
git commit -m "feat(app): GUI shell with sidebar layout, router, and placeholder pages"
```

---

### Task 6: Dashboard + shared components

**Files:**
- Modify: `app/src/client/pages/Dashboard.tsx`
- Create: `app/src/client/components/Spinner.tsx`, `app/src/client/components/AuthRequiredCallout.tsx`

**Interfaces:**
- Consumes: `api.getStatus()`, `api.getAudit()`
- Produces: Dashboard page, `Spinner` and `AuthRequiredCallout` reusable components

- [ ] **Step 1: Create Spinner component**

Create `app/src/client/components/Spinner.tsx`:

```tsx
export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 py-4">
      <span className="loading loading-spinner loading-md" />
      {label && <span className="text-sm opacity-60">{label}</span>}
    </div>
  );
}
```

- [ ] **Step 2: Create AuthRequiredCallout component**

Create `app/src/client/components/AuthRequiredCallout.tsx`:

```tsx
export function AuthRequiredCallout({ message }: { message?: string }) {
  return (
    <div role="alert" className="alert alert-warning">
      <span>{message ?? 'Sign in to the target app in Chrome, then try again.'}</span>
    </div>
  );
}
```

- [ ] **Step 3: Implement Dashboard page**

Replace `app/src/client/pages/Dashboard.tsx`:

```tsx
import { useEffect, useState, useCallback } from 'react';
import { api, type AuditEvent } from '../api';

export default function Dashboard() {
  const [status, setStatus] = useState<{ ok: boolean; extensionConnected: boolean; connectorCount: number } | null>(null);
  const [events, setEvents] = useState<AuditEvent[]>([]);

  const load = useCallback(() => {
    api.getStatus().then(setStatus).catch(() => setStatus(null));
    api.getAudit({ limit: '10' }).then((d) => setEvents(d.events)).catch(() => {});
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [load]);

  function timeAgo(ts: string): string {
    const diff = Date.now() - new Date(ts).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins} min ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs} hr ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  }

  const typeBadge: Record<string, string> = {
    'command.success': 'badge-success',
    'command.error': 'badge-error',
    'command.denied': 'badge-error',
    'command.start': 'badge-ghost',
    'auth.failed': 'badge-warning',
    'approval.granted': 'badge-success',
    'approval.rejected': 'badge-error',
    'config.changed': 'badge-info',
  };

  return (
    <div className="max-w-4xl">
      <h2 className="text-2xl font-bold mb-6">Dashboard</h2>
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-base-200 rounded-lg p-4">
          <div className="text-sm opacity-60 mb-1">Daemon</div>
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${status?.ok ? 'bg-success' : 'bg-error'}`} />
            <span className="font-semibold">{status?.ok ? 'Running' : 'Offline'}</span>
          </div>
        </div>
        <div className="bg-base-200 rounded-lg p-4">
          <div className="text-sm opacity-60 mb-1">Chrome Extension</div>
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${status?.extensionConnected ? 'bg-success' : 'bg-error'}`} />
            <span className="font-semibold">{status?.extensionConnected ? 'Connected' : 'Disconnected'}</span>
          </div>
        </div>
        <div className="bg-base-200 rounded-lg p-4">
          <div className="text-sm opacity-60 mb-1">Connectors</div>
          <div className="font-semibold">{status?.connectorCount ?? 0} loaded</div>
        </div>
      </div>

      <h3 className="text-lg font-semibold mb-3">Recent activity</h3>
      {events.length === 0 ? (
        <p className="text-sm opacity-50">No recent events.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="table table-sm">
            <thead><tr><th>Time</th><th>Connector</th><th>Type</th><th>Duration</th></tr></thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id}>
                  <td className="opacity-60 text-sm">{timeAgo(e.timestamp)}</td>
                  <td className="font-mono text-sm">{e.connector}</td>
                  <td><span className={`badge badge-sm ${typeBadge[e.type] ?? 'badge-ghost'}`}>{e.type}</span></td>
                  <td className="text-sm">{e.durationMs ? `${(e.durationMs / 1000).toFixed(1)}s` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Verify build**

Run: `cd commandGarden/app && npx vite build 2>&1 | tail -5`
Expected: build succeeds

- [ ] **Step 5: Commit**

```bash
git add app/src/client/
git commit -m "feat(app): Dashboard page with health cards and recent activity"
```

---

### Task 7: Connectors list + Generic connector runner pages

**Files:**
- Modify: `app/src/client/pages/Connectors.tsx`, `app/src/client/pages/ConnectorRun.tsx`

**Interfaces:**
- Consumes: `api.getConnectors()`, `api.getConnector()`, `api.run()`, `api.approve()`
- Produces: Connectors list page, generic runner page with SSE approval handling

This task is described in the spec under "Connectors list" and "Generic connector runner" page specifications. The Connectors page lists all connectors with "Open App" or "Run" buttons. The ConnectorRun page auto-generates a form from the connector's `args` schema and displays results.

Implement both pages following the mockup layout in `commandGarden/app-mockup.html` (the "Connectors" and "Run Connector" tabs). Use `useParams` from react-router to get `:site/:name`. For SSE approval handling, use `EventSource` connected to `/api/run/events/:requestId`.

- [ ] **Step 1: Implement Connectors.tsx**

Replace the placeholder with the full implementation following the mockup. Each connector row shows key (monospace), access badge, capability badges, description, domains, and action buttons linking to the custom app route or `/connectors/:site/:name`.

- [ ] **Step 2: Implement ConnectorRun.tsx**

Replace the placeholder. The page fetches the connector schema on mount, renders a form with one field per arg, an output format select, and a Run button. On submit, calls `api.run()`. If the response has `requiresApproval: true`, connects to the SSE stream and handles approval events. Results are displayed in a table.

- [ ] **Step 3: Verify build**

Run: `cd commandGarden/app && npx vite build 2>&1 | tail -5`
Expected: build succeeds

- [ ] **Step 4: Commit**

```bash
git add app/src/client/pages/Connectors.tsx app/src/client/pages/ConnectorRun.tsx
git commit -m "feat(app): Connectors list and generic connector runner pages"
```

---

### Task 8: Audit log page

**Files:**
- Modify: `app/src/client/pages/Audit.tsx`

**Interfaces:**
- Consumes: `api.getAudit()`, `api.getAuditEvent()`, `api.getConnectors()`
- Produces: Audit log page with filters, pagination, expandable event detail

Implement following the spec's "Audit log" section and the mockup's "Audit Log" tab. Three filter dropdowns (time range, event type, connector), paginated at 20 per page, click-to-expand event detail with pipeline steps table. Polls every 60 seconds.

- [ ] **Step 1: Implement Audit.tsx**

Replace the placeholder with the full implementation. Use `useState` for filters and pagination offset. Compute the `since` ISO date from the selected time range preset. Fetch connectors list to populate the connector filter dropdown dynamically.

- [ ] **Step 2: Verify build and commit**

```bash
cd commandGarden/app && npx vite build
git add app/src/client/pages/Audit.tsx
git commit -m "feat(app): Audit log page with filters, pagination, and event detail"
```

---

### Task 9: Configuration page

**Files:**
- Modify: `app/src/client/pages/Config.tsx`

**Interfaces:**
- Consumes: `api.getConfig()`, `api.setConfig()`
- Produces: Configuration editor page with grouped sections and inline editing

Implement following the spec's "Configuration" section and the mockup's "Config" tab. Group config by section. Scalar values get text/number inputs. Array values (like `approvedHighRisk`) render as removable chips with an Add button. Save button calls `POST /api/config` for each changed key.

- [ ] **Step 1: Implement Config.tsx**

Replace the placeholder. Track changes in local state, diff against original on save, call `api.setConfig()` for each changed key. Show a DaisyUI toast on success or error.

- [ ] **Step 2: Verify build and commit**

```bash
cd commandGarden/app && npx vite build
git add app/src/client/pages/Config.tsx
git commit -m "feat(app): Configuration editor page"
```

---

### Task 10: Setup guide page

**Files:**
- Modify: `app/src/client/pages/Guide.tsx`

**Interfaces:**
- Consumes: `api.getStatus()`, `api.getConnectors()`, `api.getConfig()`
- Produces: Interactive setup checklist with live status, expandable instructions, tutorial section

Implement following the spec's "Setup guide" section and the mockup's "Setup Guide" tab. Polls `/api/status` every 10 seconds. Checklist items: daemon running, extension connected, connectors loaded, high-risk connectors approved. Each item shows a status badge and expandable `<details>` with instructions. "Try it out" section links to the generic runner.

- [ ] **Step 1: Implement Guide.tsx**

Replace the placeholder. Use `useEffect` with a 10-second poll. Fetch config to check if `approvedHighRisk` covers all connectors using high-risk capabilities.

- [ ] **Step 2: Verify build and commit**

```bash
cd commandGarden/app && npx vite build
git add app/src/client/pages/Guide.tsx
git commit -m "feat(app): Setup guide with interactive checklist and tutorial"
```

---

### Task 11: Timetracking app page

**Files:**
- Modify: `app/src/client/pages/Timetracking.tsx`

**Interfaces:**
- Consumes: `api.run()` with `connector: "timetracking/report"`
- Produces: Timetracking page with month picker, summary cards, grouped-by-project table, raw entries

Implement following the spec's "App: Time Tracking" section and the mockup's "App: Timetracking" tab. The page runs the `timetracking/report` connector and transforms raw rows client-side into summary cards (total hours, working days, projects, draft entries) and a grouped-by-project table. Raw booking lines in a collapsible `<details>`.

- [ ] **Step 1: Implement Timetracking.tsx**

Replace the placeholder. Group data by `projectId`, sum hours per group, count drafts. Handle `auth_required` error state with `AuthRequiredCallout`.

- [ ] **Step 2: Verify build and commit**

```bash
cd commandGarden/app && npx vite build
git add app/src/client/pages/Timetracking.tsx
git commit -m "feat(app): Timetracking app page with summary cards and grouped view"
```

---

### Task 12: Room availability app page

**Files:**
- Modify: `app/src/client/pages/Rooms.tsx`
- Create: `app/src/client/components/RoomCombobox.tsx`, `app/src/client/components/TimelineView.tsx`

**Interfaces:**
- Consumes: `api.run()` with `connector: "teams/room-availability"`
- Produces: Room availability page with combobox, timeline bar, detail table

Implement following the spec's "App: Room Availability" section and the mockup's "App: Rooms" tab. Migrate the `RoomCombobox` from `dashboard/web/components/RoomCombobox.tsx` (filterable dropdown with keyboard navigation). Create a `TimelineView` with a visual proportional-width timeline bar and a detail table with DaisyUI state badges.

- [ ] **Step 1: Migrate RoomCombobox**

Create `app/src/client/components/RoomCombobox.tsx`. Port from `dashboard/web/components/RoomCombobox.tsx`. Replace `@/lib/rooms` import with a hardcoded `ROOM_OPTIONS` array (copy from the existing dashboard). Keep all keyboard navigation and accessibility attributes.

- [ ] **Step 2: Create TimelineView**

Create `app/src/client/components/TimelineView.tsx` with two parts: a proportional-width bar chart (flex blocks colored by state) and a detail table below. Port the badge mapping from `dashboard/web/components/TimelineView.tsx`.

- [ ] **Step 3: Implement Rooms.tsx**

Replace the placeholder. Room combobox + date picker + Run button. Calls `api.run('teams/room-availability', { room, date })`. Renders `TimelineView` on success. Handle `auth_required` with `AuthRequiredCallout`.

- [ ] **Step 4: Verify build and commit**

```bash
cd commandGarden/app && npx vite build
git add app/src/client/pages/Rooms.tsx app/src/client/components/
git commit -m "feat(app): Room availability app page with timeline and combobox"
```

---

### Task 13: CLI commands — cg gui, cg up, cg down

**Files:**
- Create: `cli/src/commands/gui-cmd.ts`, `cli/src/commands/gui-cmd.test.ts`
- Create: `cli/src/commands/up-down.ts`
- Modify: `cli/src/main.ts`

**Interfaces:**
- Consumes: daemon status at `http://127.0.0.1:19825/api/status`, PID files at `~/.commandgarden/`
- Produces: CLI commands `cg gui [start|stop|status]`, `cg up`, `cg down`

- [ ] **Step 1: Write gui-cmd tests**

Create `cli/src/commands/gui-cmd.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { executeGuiStatus, executeGuiStop } from './gui-cmd.js';

describe('gui-cmd', () => {
  describe('executeGuiStatus', () => {
    it('reports not running when no PID file', () => {
      expect(executeGuiStatus('/nonexistent')).toBe('GUI: not running (no PID file found).');
    });
  });

  describe('executeGuiStop', () => {
    it('reports not running when no PID file', () => {
      expect(executeGuiStop('/nonexistent')).toBe('GUI is not running (no PID file found).');
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w cli -- --reporter=verbose 2>&1 | head -20`
Expected: FAIL — gui-cmd not found

- [ ] **Step 3: Implement gui-cmd.ts**

Create `cli/src/commands/gui-cmd.ts`:

```typescript
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, unlinkSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { exec } from 'node:child_process';

export async function executeGuiStart(
  baseUrl: string, cgHome: string, appScript: string, opts: { background?: boolean; noOpen?: boolean },
): Promise<string> {
  // Check daemon first
  try {
    const resp = await fetch(`${baseUrl}/api/status`);
    if (!resp.ok) throw new Error();
  } catch {
    return 'Daemon is not running. Start it with: cg daemon start (or use cg up)';
  }

  // Check if already running
  const pidPath = join(cgHome, 'app.pid');
  if (existsSync(pidPath)) {
    const pid = parseInt(readFileSync(pidPath, 'utf-8').trim(), 10);
    try { process.kill(pid, 0); return 'GUI is already running.'; } catch { unlinkSync(pidPath); }
  }

  mkdirSync(cgHome, { recursive: true });

  if (opts.background) {
    const child = spawn('node', [appScript], { detached: true, stdio: 'ignore' });
    if (child.pid) writeFileSync(pidPath, String(child.pid));
    child.unref();
    if (!opts.noOpen) openBrowser('http://127.0.0.1:19826');
    return `GUI started (PID: ${child.pid ?? 'unknown'}).`;
  }

  // Foreground — exec directly (this blocks)
  if (!opts.noOpen) openBrowser('http://127.0.0.1:19826');
  const child = spawn('node', [appScript], { stdio: 'inherit' });
  await new Promise<void>((resolve) => child.on('exit', () => resolve()));
  return 'GUI stopped.';
}

export function executeGuiStop(cgHome: string): string {
  const pidPath = join(cgHome, 'app.pid');
  if (!existsSync(pidPath)) return 'GUI is not running (no PID file found).';
  const pid = parseInt(readFileSync(pidPath, 'utf-8').trim(), 10);
  try {
    process.kill(pid, 'SIGTERM');
    unlinkSync(pidPath);
    return `GUI stopped (PID: ${pid}).`;
  } catch {
    unlinkSync(pidPath);
    return `GUI process ${pid} not found (stale PID file cleaned up).`;
  }
}

export function executeGuiStatus(cgHome: string): string {
  const pidPath = join(cgHome, 'app.pid');
  if (!existsSync(pidPath)) return 'GUI: not running (no PID file found).';
  const pid = parseInt(readFileSync(pidPath, 'utf-8').trim(), 10);
  try { process.kill(pid, 0); return `GUI: running (PID: ${pid}).`; } catch {
    return 'GUI: not running (stale PID file).';
  }
}

function openBrowser(url: string): void {
  const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
  exec(`${cmd} ${url}`);
}
```

- [ ] **Step 4: Implement up-down.ts**

Create `cli/src/commands/up-down.ts`:

```typescript
import { executeDaemonStart, executeDaemonStop } from './daemon-cmd.js';
import { executeGuiStart, executeGuiStop } from './gui-cmd.js';

export async function executeUp(
  baseUrl: string, cgHome: string, daemonScript: string, appScript: string,
): Promise<string> {
  const lines: string[] = [];
  lines.push(await executeDaemonStart(baseUrl, cgHome, daemonScript));

  // Wait for daemon to be ready
  for (let i = 0; i < 10; i++) {
    try {
      const resp = await fetch(`${baseUrl}/api/status`);
      if (resp.ok) break;
    } catch { /* not ready yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }

  lines.push(await executeGuiStart(baseUrl, cgHome, appScript, { background: true }));
  return lines.join('\n');
}

export async function executeDown(cgHome: string): Promise<string> {
  const lines: string[] = [];
  lines.push(executeGuiStop(cgHome));
  lines.push(await executeDaemonStop(cgHome));
  lines.push('All services stopped.');
  return lines.join('\n');
}
```

- [ ] **Step 5: Register commands in main.ts**

In `cli/src/main.ts`, add imports and register the new commands after existing ones:

```typescript
import { executeGuiStart, executeGuiStop, executeGuiStatus } from './commands/gui-cmd.js';
import { executeUp, executeDown } from './commands/up-down.js';
```

Add the `gui` command group:

```typescript
const APP_SCRIPT = join(__dirname, '..', '..', 'app', 'dist', 'server', 'main.js');

const gui = program
  .command('gui')
  .description('Manage the GUI app server');

gui
  .command('start', { isDefault: true })
  .description('Start the GUI (foreground by default)')
  .option('-b, --background', 'Run in background')
  .option('--no-open', 'Do not open browser')
  .action(async (opts: { background?: boolean; open?: boolean }) => {
    console.log(await executeGuiStart(BASE_URL, CG_HOME, APP_SCRIPT, {
      background: opts.background,
      noOpen: opts.open === false,
    }));
  });

gui
  .command('stop')
  .description('Stop the GUI')
  .action(() => { console.log(executeGuiStop(CG_HOME)); });

gui
  .command('status')
  .description('Check GUI status')
  .action(() => { console.log(executeGuiStatus(CG_HOME)); });

program
  .command('up')
  .description('Start daemon + GUI, open browser')
  .action(async () => {
    console.log(await executeUp(BASE_URL, CG_HOME, DAEMON_SCRIPT, APP_SCRIPT));
  });

program
  .command('down')
  .description('Stop GUI + daemon')
  .action(async () => {
    console.log(await executeDown(CG_HOME));
  });
```

- [ ] **Step 6: Run tests**

Run: `npm test -w cli -- --reporter=verbose 2>&1 | tail -20`
Expected: all tests PASS

- [ ] **Step 7: Commit**

```bash
git add cli/src/commands/gui-cmd.ts cli/src/commands/gui-cmd.test.ts \
       cli/src/commands/up-down.ts cli/src/commands/up-down.test.ts \
       cli/src/main.ts
git commit -m "feat(cli): add cg gui, cg up, cg down commands"
```

---

### Task 14: Integration smoke test + cleanup

**Files:**
- Modify: `commandGarden/package.json` (build script)
- Delete: `commandGarden/app-mockup.html` (design artifact)

**Interfaces:**
- Consumes: everything from Tasks 1-13
- Produces: working end-to-end build, verified with a manual smoke test

- [ ] **Step 1: Verify full monorepo build**

Run: `cd commandGarden && npm run build 2>&1 | tail -20`
Expected: all workspaces build successfully including the new `app` workspace

- [ ] **Step 2: Run all tests**

Run: `cd commandGarden && npm test 2>&1 | tail -30`
Expected: all tests pass across all workspaces

- [ ] **Step 3: Manual smoke test**

Start the daemon and app server, verify the GUI loads:

```bash
cd commandGarden
node daemon/dist/main.js &
node app/dist/server/main.js &
# Open http://127.0.0.1:19826 in browser
# Verify: sidebar renders, dashboard shows daemon status, connectors page lists connectors
# Stop both: kill %1 %2
```

- [ ] **Step 4: Clean up design artifact**

```bash
rm commandGarden/app-mockup.html
```

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat: commandGarden GUI v1 — app server, React SPA, CLI commands

Three-tier architecture:
- App server (Fastify, :19826) with facade endpoints, SQLite store
- React SPA with Tailwind + DaisyUI (sidebar, 8 pages)
- CLI commands: cg gui, cg up, cg down

Pages: Dashboard, Connectors, Generic Runner, Audit Log,
Configuration, Setup Guide, Timetracking app, Room Availability app

Spec: docs/superpowers/specs/2026-07-01-commandgarden-gui-design.md"
```
