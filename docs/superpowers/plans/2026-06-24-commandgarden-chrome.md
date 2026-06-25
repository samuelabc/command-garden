# commandGarden Chrome Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the commandGarden Chrome MV3 extension — connects to daemon via WebSocket, receives pipeline requests, executes steps in browser tabs, returns structured data.

**Architecture:** Service worker connects to daemon WebSocket, receives `ExtensionRequest`, orchestrates pipeline steps across Chrome APIs (navigate, cookies) and content script (DOM ops), returns `ExtensionResponse`.

**Tech Stack:** TypeScript 5.4, esbuild (bundler), Vitest 2.x, chrome-types (dev)

**Branch:** `feat/commandgarden-chrome` (branch from `feat/commandgarden-daemon`)

**Depends on:** `@commandgarden/shared` (Plan 1 — 97 tests), `@commandgarden/daemon` (Plan 2 — 50 tests)

---

## File Map

```
commandGarden/chrome/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── build.mjs                 # esbuild multi-entry bundler
├── manifest.json             # MV3 manifest
└── src/
    ├── messages.ts           # Internal message types (SW ↔ content script)
    ├── messages.test.ts
    ├── domain-guard.ts       # Domain allowlist builder + URL checker
    ├── domain-guard.test.ts
    ├── content/
    │   ├── dom-executor.ts   # DOM operations: wait, extract, click, type, fetch
    │   ├── dom-executor.test.ts
    │   └── content-script.ts # Entry point: message listener → dom-executor
    ├── pipeline/
    │   ├── runner.ts         # Pipeline orchestrator with injected deps
    │   ├── runner.test.ts
    │   └── context.ts        # Variable context + expression interpolation
    │   └── context.test.ts
    └── background/
        ├── ws-client.ts      # WebSocket client to daemon
        ├── ws-client.test.ts
        ├── chrome-adapter.ts # Chrome API abstraction (tabs, cookies, scripting)
        └── service-worker.ts # Entry point: WS + adapter + runner wiring
```

---

## Task 1: Package Scaffold

**Files:** Create `package.json`, `tsconfig.json`, `vitest.config.ts`, `build.mjs`, `manifest.json`, placeholder source files

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "@commandgarden/chrome",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "node build.mjs",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@commandgarden/shared": "*"
  },
  "devDependencies": {
    "@anthropic-ai/chrome-types": "^0.1.0",
    "@anthropic-ai/typescript": "^5.4.0",
    "chrome-types": "^0.1.0",
    "@anthropic-ai/esbuild": "^0.21.0",
    "@types/node": "^22.0.0",
    "esbuild": "^0.25.0",
    "typescript": "^5.4.0",
    "vitest": "^2.0.0"
  }
}
```

> **Note:** `chrome-types` may need version adjustment after `npm install`. If unavailable, we'll use `@anthropic-ai/chrome-types` or manual type declarations.

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "types": ["chrome"]
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
    environment: 'jsdom',
  },
});
```

> Using jsdom environment for content script DOM tests.

- [ ] **Step 4: Create `build.mjs`**

```javascript
import { build } from 'esbuild';
import { cpSync } from 'node:fs';

// Bundle service worker (ESM for MV3 module workers)
await build({
  entryPoints: ['src/background/service-worker.ts'],
  bundle: true,
  outfile: 'dist/service-worker.js',
  format: 'esm',
  platform: 'browser',
  target: 'chrome120',
  sourcemap: true,
});

// Bundle content script (IIFE — no module support in content scripts)
await build({
  entryPoints: ['src/content/content-script.ts'],
  bundle: true,
  outfile: 'dist/content-script.js',
  format: 'iife',
  platform: 'browser',
  target: 'chrome120',
  sourcemap: true,
});

// Copy manifest
cpSync('manifest.json', 'dist/manifest.json');

console.log('Build complete → dist/');
```

- [ ] **Step 5: Create `manifest.json`**

```json
{
  "manifest_version": 3,
  "name": "commandGarden",
  "version": "0.1.0",
  "description": "Enterprise browser automation — secure, auditable CLI commands for websites",
  "permissions": ["cookies", "tabs", "scripting", "webRequest"],
  "host_permissions": ["<all_urls>"],
  "background": {
    "service_worker": "service-worker.js",
    "type": "module"
  }
}
```

> `host_permissions: ["<all_urls>"]` is a v1 simplification. Production will scope to connector-declared domains only.

- [ ] **Step 6: Create placeholder source files**

Create empty entry points:
- `src/background/service-worker.ts` → `console.log('commandGarden service worker');`
- `src/content/content-script.ts` → `console.log('commandGarden content script');`

- [ ] **Step 7: Install deps, verify build**

Run: `npm install` from `commandGarden/chrome/`
Run: `node build.mjs`
Expected: `dist/` contains `service-worker.js`, `content-script.js`, `manifest.json`

- [ ] **Step 8: Commit**

```bash
git add commandGarden/chrome/
git commit -m "chore: scaffold @commandgarden/chrome extension package"
```

---

## Task 2: Internal Message Protocol (TDD)

**Files:** Create `src/messages.ts`, `src/messages.test.ts`

Messages between service worker and content script for DOM operations.

- [ ] **Step 1: Write failing tests**

```typescript
// src/messages.test.ts
import { describe, it, expect } from 'vitest';
import {
  createDomRequest, createDomResponse,
  isDomRequest, isDomResponse,
  type DomRequest, type DomResponse,
} from './messages.js';

describe('createDomRequest', () => {
  it('creates a wait request', () => {
    const req = createDomRequest('wait', { selector: '.table', timeout: 5000 });
    expect(req.id).toBeDefined();
    expect(req.action).toBe('wait');
    expect(req.params.selector).toBe('.table');
  });

  it('creates an extract request', () => {
    const req = createDomRequest('extract', { selector: 'tr', fields: { name: 'td:first-child' } });
    expect(req.action).toBe('extract');
    expect(req.params.fields).toBeDefined();
  });

  it('creates a click request', () => {
    const req = createDomRequest('click', { selector: '#btn' });
    expect(req.action).toBe('click');
  });

  it('creates a type request', () => {
    const req = createDomRequest('type', { selector: '#input', value: 'hello' });
    expect(req.action).toBe('type');
  });

  it('creates a fetch request', () => {
    const req = createDomRequest('fetch', { url: 'https://example.com/api', method: 'GET' });
    expect(req.action).toBe('fetch');
  });
});

describe('createDomResponse', () => {
  it('creates success response', () => {
    const res = createDomResponse('req-1', true, [{ a: 1 }]);
    expect(res.requestId).toBe('req-1');
    expect(res.ok).toBe(true);
    expect(res.data).toEqual([{ a: 1 }]);
  });

  it('creates error response', () => {
    const res = createDomResponse('req-1', false, undefined, 'Element not found');
    expect(res.ok).toBe(false);
    expect(res.error).toBe('Element not found');
  });
});

describe('type guards', () => {
  it('isDomRequest accepts valid request', () => {
    expect(isDomRequest({ id: '1', action: 'wait', params: {} })).toBe(true);
  });
  it('isDomRequest rejects invalid', () => {
    expect(isDomRequest({ foo: 'bar' })).toBe(false);
  });
  it('isDomResponse accepts valid response', () => {
    expect(isDomResponse({ requestId: '1', ok: true })).toBe(true);
  });
  it('isDomResponse rejects invalid', () => {
    expect(isDomResponse(null)).toBe(false);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**
- [ ] **Step 3: Implement**

```typescript
// src/messages.ts
import { randomUUID } from 'node:crypto';

export type DomAction = 'wait' | 'extract' | 'click' | 'type' | 'fetch';

export interface DomRequest {
  id: string;
  action: DomAction;
  params: Record<string, unknown>;
}

export interface DomResponse {
  requestId: string;
  ok: boolean;
  data?: unknown;
  error?: string;
}

export function createDomRequest(action: DomAction, params: Record<string, unknown>): DomRequest {
  return { id: randomUUID(), action, params };
}

export function createDomResponse(
  requestId: string, ok: boolean, data?: unknown, error?: string,
): DomResponse {
  return { requestId, ok, data, error };
}

export function isDomRequest(value: unknown): value is DomRequest {
  if (value == null || typeof value !== 'object') return false;
  const obj = value as Record<string, unknown>;
  return typeof obj.id === 'string' && typeof obj.action === 'string' && typeof obj.params === 'object';
}

export function isDomResponse(value: unknown): value is DomResponse {
  if (value == null || typeof value !== 'object') return false;
  const obj = value as Record<string, unknown>;
  return typeof obj.requestId === 'string' && typeof obj.ok === 'boolean';
}
```

- [ ] **Step 4: Run — expect PASS (~11 tests)**
- [ ] **Step 5: Commit** `"feat(chrome): internal message protocol for SW ↔ content script"`

---

## Task 3: Domain Guard (TDD)

**Files:** Create `src/domain-guard.ts`, `src/domain-guard.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/domain-guard.test.ts
import { describe, it, expect } from 'vitest';
import { buildAllowlist, isUrlAllowed, extractHostname } from './domain-guard.js';
import type { ConnectorDef } from '@commandgarden/shared';

const makeConnector = (domains: string[]): ConnectorDef => ({
  site: 'test', name: 'cmd', version: '1.0',
  access: 'read', domains, capabilities: ['navigate'],
  args: [], columns: [], pipeline: [{ step: 'navigate', url: 'https://example.com' }],
} as ConnectorDef);

describe('buildAllowlist', () => {
  it('merges domains from multiple connectors', () => {
    const list = buildAllowlist([
      makeConnector(['a.com', 'b.com']),
      makeConnector(['b.com', 'c.com']),
    ]);
    expect(list.size).toBe(3);
    expect(list.has('a.com')).toBe(true);
    expect(list.has('c.com')).toBe(true);
  });

  it('returns empty set for no connectors', () => {
    expect(buildAllowlist([]).size).toBe(0);
  });
});

describe('extractHostname', () => {
  it('extracts hostname from full URL', () => {
    expect(extractHostname('https://example.com/path')).toBe('example.com');
  });
  it('extracts hostname with port', () => {
    expect(extractHostname('https://example.com:8080/path')).toBe('example.com');
  });
  it('returns null for invalid URL', () => {
    expect(extractHostname('not-a-url')).toBeNull();
  });
  it('handles chrome:// URLs', () => {
    expect(extractHostname('chrome://extensions')).toBe('extensions');
  });
});

describe('isUrlAllowed', () => {
  const allowlist = new Set(['example.com', 'api.example.com']);

  it('allows listed domain', () => {
    expect(isUrlAllowed('https://example.com/page', allowlist)).toBe(true);
  });
  it('allows listed subdomain', () => {
    expect(isUrlAllowed('https://api.example.com/v1', allowlist)).toBe(true);
  });
  it('blocks unlisted domain', () => {
    expect(isUrlAllowed('https://evil.com', allowlist)).toBe(false);
  });
  it('blocks invalid URL', () => {
    expect(isUrlAllowed('not-a-url', allowlist)).toBe(false);
  });
  it('blocks empty allowlist', () => {
    expect(isUrlAllowed('https://example.com', new Set())).toBe(false);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**
- [ ] **Step 3: Implement**

```typescript
// src/domain-guard.ts
import type { ConnectorDef } from '@commandgarden/shared';

export function buildAllowlist(connectors: ConnectorDef[]): Set<string> {
  const domains = new Set<string>();
  for (const c of connectors) {
    for (const d of c.domains) domains.add(d);
  }
  return domains;
}

export function extractHostname(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

export function isUrlAllowed(url: string, allowlist: Set<string>): boolean {
  const hostname = extractHostname(url);
  if (!hostname) return false;
  return allowlist.has(hostname);
}
```

- [ ] **Step 4: Run — expect PASS (~10 tests)**
- [ ] **Step 5: Commit** `"feat(chrome): domain guard with allowlist builder"`

---

## Task 4: Pipeline Context (TDD)

**Files:** Create `src/pipeline/context.ts`, `src/pipeline/context.test.ts`

Manages variable store and expression interpolation for pipeline execution.

- [ ] **Step 1: Write failing tests**

```typescript
// src/pipeline/context.test.ts
import { describe, it, expect } from 'vitest';
import { PipelineContext } from './context.js';

describe('PipelineContext', () => {
  it('stores and retrieves variables', () => {
    const ctx = new PipelineContext({ month: '2026-06' });
    ctx.setVar('token', 'abc');
    expect(ctx.getVar('token')).toBe('abc');
  });

  it('interpolates args in templates', () => {
    const ctx = new PipelineContext({ month: '2026-06' });
    expect(ctx.interpolate('Report for ${{ args.month }}')).toBe('Report for 2026-06');
  });

  it('interpolates vars in templates', () => {
    const ctx = new PipelineContext({});
    ctx.setVar('base', 'https://example.com');
    expect(ctx.interpolate('${{ vars.base }}/api')).toBe('https://example.com/api');
  });

  it('interpolates cookies in templates', () => {
    const ctx = new PipelineContext({});
    ctx.setCookies({ session: 'xyz' });
    expect(ctx.interpolate('Bearer ${{ cookies.session }}')).toBe('Bearer xyz');
  });

  it('returns template unchanged if no expressions', () => {
    const ctx = new PipelineContext({});
    expect(ctx.interpolate('plain text')).toBe('plain text');
  });

  it('collects data rows', () => {
    const ctx = new PipelineContext({});
    ctx.setData([{ a: 1 }, { a: 2 }]);
    expect(ctx.getData()).toHaveLength(2);
  });

  it('applies map to data', () => {
    const ctx = new PipelineContext({});
    ctx.setData([{ firstName: 'Alice' }]);
    ctx.applyMap({ name: '${{ row.firstName }}' });
    expect(ctx.getData()[0].name).toBe('Alice');
  });

  it('applies filter to data', () => {
    const ctx = new PipelineContext({});
    ctx.setData([{ score: 5 }, { score: 15 }, { score: 25 }]);
    ctx.applyFilter('score', 'gt', '10');
    expect(ctx.getData()).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**
- [ ] **Step 3: Implement**

```typescript
// src/pipeline/context.ts
import { interpolate as sharedInterpolate, type ExprContext } from '@commandgarden/shared';

export class PipelineContext {
  private vars: Record<string, unknown> = {};
  private cookies: Record<string, string> = {};
  private data: Record<string, unknown>[] = [];
  private readonly args: Record<string, string | number | boolean>;

  constructor(args: Record<string, string | number | boolean>) {
    this.args = args;
  }

  setVar(name: string, value: unknown): void { this.vars[name] = value; }
  getVar(name: string): unknown { return this.vars[name]; }
  setCookies(cookies: Record<string, string>): void { Object.assign(this.cookies, cookies); }
  setData(data: Record<string, unknown>[]): void { this.data = data; }
  getData(): Record<string, unknown>[] { return this.data; }

  interpolate(template: string): string {
    const ctx: ExprContext = { args: this.args, vars: this.vars, cookies: this.cookies };
    return sharedInterpolate(template, ctx);
  }

  applyMap(fields: Record<string, string>): void {
    this.data = this.data.map(row => {
      const mapped: Record<string, unknown> = {};
      for (const [key, expr] of Object.entries(fields)) {
        const rowCtx: ExprContext = {
          args: this.args, vars: { ...this.vars, row }, cookies: this.cookies,
        };
        mapped[key] = sharedInterpolate(expr, rowCtx);
      }
      return mapped;
    });
  }

  applyFilter(field: string, operator: string, value: string): void {
    this.data = this.data.filter(row => {
      const actual = row[field];
      const expected = isNaN(Number(value)) ? value : Number(value);
      switch (operator) {
        case 'eq': return actual === expected;
        case 'ne': return actual !== expected;
        case 'gt': return Number(actual) > Number(expected);
        case 'lt': return Number(actual) < Number(expected);
        case 'gte': return Number(actual) >= Number(expected);
        case 'lte': return Number(actual) <= Number(expected);
        case 'contains': return String(actual).includes(String(expected));
        case 'matches': return new RegExp(String(expected)).test(String(actual));
        default: return true;
      }
    });
  }
}
```

- [ ] **Step 4: Run — expect PASS (~8 tests)**
- [ ] **Step 5: Commit** `"feat(chrome): pipeline context with interpolation and data transforms"`

---

## Task 5: Content Script DOM Executor (TDD)

**Files:** Create `src/content/dom-executor.ts`, `src/content/dom-executor.test.ts`

Pure DOM functions tested with jsdom. No Chrome API dependencies.

- [ ] **Step 1: Write failing tests**

```typescript
// src/content/dom-executor.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { waitForSelector, extractData, clickElement, typeIntoElement } from './dom-executor.js';

describe('waitForSelector', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('resolves immediately when element exists', async () => {
    document.body.innerHTML = '<div class="target">hello</div>';
    await expect(waitForSelector('.target', 1000)).resolves.toBeUndefined();
  });

  it('rejects on timeout when element missing', async () => {
    await expect(waitForSelector('.missing', 100)).rejects.toThrow('timed out');
  });

  it('resolves when element appears later', async () => {
    setTimeout(() => { document.body.innerHTML = '<div class="later"></div>'; }, 50);
    await expect(waitForSelector('.later', 1000)).resolves.toBeUndefined();
  });
});

describe('extractData', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <table><tbody>
        <tr><td class="name">Alice</td><td class="age">30</td></tr>
        <tr><td class="name">Bob</td><td class="age">25</td></tr>
      </tbody></table>`;
  });

  it('extracts data from matching rows', () => {
    const data = extractData('tbody tr', { name: '.name', age: '.age' });
    expect(data).toHaveLength(2);
    expect(data[0]).toEqual({ name: 'Alice', age: '30' });
    expect(data[1]).toEqual({ name: 'Bob', age: '25' });
  });

  it('returns empty array when no rows match', () => {
    expect(extractData('.missing', { a: 'td' })).toEqual([]);
  });

  it('returns empty string for missing field selector', () => {
    const data = extractData('tbody tr', { name: '.name', email: '.email' });
    expect(data[0].email).toBe('');
  });
});

describe('clickElement', () => {
  it('clicks the element', async () => {
    let clicked = false;
    document.body.innerHTML = '<button id="btn">Click</button>';
    document.getElementById('btn')!.addEventListener('click', () => { clicked = true; });
    await clickElement('#btn');
    expect(clicked).toBe(true);
  });

  it('throws for missing element', async () => {
    await expect(clickElement('#missing')).rejects.toThrow('not found');
  });
});

describe('typeIntoElement', () => {
  it('sets value on input', async () => {
    document.body.innerHTML = '<input id="inp" />';
    await typeIntoElement('#inp', 'hello');
    expect((document.getElementById('inp') as HTMLInputElement).value).toBe('hello');
  });

  it('throws for missing element', async () => {
    await expect(typeIntoElement('#missing', 'x')).rejects.toThrow('not found');
  });
});
```

- [ ] **Step 2: Run — expect FAIL**
- [ ] **Step 3: Implement**

```typescript
// src/content/dom-executor.ts

export function waitForSelector(selector: string, timeout: number): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(selector)) { resolve(); return; }
    const interval = 100;
    let elapsed = 0;
    const timer = setInterval(() => {
      if (document.querySelector(selector)) { clearInterval(timer); resolve(); return; }
      elapsed += interval;
      if (elapsed >= timeout) { clearInterval(timer); reject(new Error(`Selector "${selector}" timed out after ${timeout}ms`)); }
    }, interval);
  });
}

export function extractData(
  rowSelector: string,
  fields: Record<string, string>,
): Record<string, string>[] {
  const rows = document.querySelectorAll(rowSelector);
  return Array.from(rows).map(row => {
    const record: Record<string, string> = {};
    for (const [name, selector] of Object.entries(fields)) {
      record[name] = row.querySelector(selector)?.textContent?.trim() ?? '';
    }
    return record;
  });
}

export async function clickElement(selector: string): Promise<void> {
  const el = document.querySelector(selector);
  if (!el) throw new Error(`Element "${selector}" not found`);
  (el as HTMLElement).click();
}

export async function typeIntoElement(selector: string, value: string): Promise<void> {
  const el = document.querySelector(selector) as HTMLInputElement | null;
  if (!el) throw new Error(`Element "${selector}" not found`);
  el.focus();
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

export async function fetchFromPage(
  url: string, method = 'GET', headers?: Record<string, string>, body?: string,
): Promise<unknown> {
  const resp = await fetch(url, {
    method, headers, body, credentials: 'include',
  });
  const contentType = resp.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) return resp.json();
  return resp.text();
}
```

- [ ] **Step 4: Run — expect PASS (~10 tests)**
- [ ] **Step 5: Commit** `"feat(chrome): content script DOM executor with wait, extract, click, type"`

---

## Task 6: Pipeline Runner (TDD)

**Files:** Create `src/pipeline/runner.ts`, `src/pipeline/runner.test.ts`

The runner orchestrates pipeline steps using dependency injection for Chrome APIs and content script communication.

- [ ] **Step 1: Write failing tests**

```typescript
// src/pipeline/runner.test.ts
import { describe, it, expect, vi } from 'vitest';
import { PipelineRunner, type ChromeAdapter } from './runner.js';
import type { ConnectorDef, PipelineStep } from '@commandgarden/shared';

function mockAdapter(overrides?: Partial<ChromeAdapter>): ChromeAdapter {
  return {
    navigateTab: vi.fn().mockResolvedValue(1),
    waitForTabLoad: vi.fn().mockResolvedValue(undefined),
    executeInContent: vi.fn().mockResolvedValue(undefined),
    getCookies: vi.fn().mockResolvedValue({}),
    ...overrides,
  };
}

function makeConnector(pipeline: PipelineStep[]): ConnectorDef {
  return {
    site: 'test', name: 'cmd', version: '1.0', access: 'read',
    domains: ['example.com'], capabilities: ['navigate', 'dom_read', 'cookie_read'],
    args: [], columns: [], pipeline,
  } as ConnectorDef;
}

describe('PipelineRunner', () => {
  it('executes navigate step', async () => {
    const adapter = mockAdapter();
    const runner = new PipelineRunner(adapter);
    const connector = makeConnector([{ step: 'navigate', url: 'https://example.com' }]);
    await runner.run(connector, {});
    expect(adapter.navigateTab).toHaveBeenCalledWith('https://example.com');
  });

  it('executes wait step via content script', async () => {
    const adapter = mockAdapter();
    const runner = new PipelineRunner(adapter);
    const connector = makeConnector([
      { step: 'navigate', url: 'https://example.com' },
      { step: 'wait', selector: '.table', timeout: 5000 },
    ]);
    await runner.run(connector, {});
    expect(adapter.executeInContent).toHaveBeenCalled();
  });

  it('executes extract step and collects data', async () => {
    const adapter = mockAdapter({
      executeInContent: vi.fn().mockResolvedValue([{ name: 'Alice' }]),
    });
    const runner = new PipelineRunner(adapter);
    const connector = makeConnector([
      { step: 'navigate', url: 'https://example.com' },
      { step: 'extract', selector: 'tr', fields: { name: 'td' } },
    ]);
    const result = await runner.run(connector, {});
    expect(result.data).toEqual([{ name: 'Alice' }]);
  });

  it('executes set step and uses variable in later steps', async () => {
    const adapter = mockAdapter();
    const runner = new PipelineRunner(adapter);
    const connector = makeConnector([
      { step: 'set', name: 'base', value: 'https://example.com' },
      { step: 'navigate', url: '${{ vars.base }}/page' },
    ]);
    await runner.run(connector, {});
    expect(adapter.navigateTab).toHaveBeenCalledWith('https://example.com/page');
  });

  it('executes cookie step', async () => {
    const adapter = mockAdapter({
      getCookies: vi.fn().mockResolvedValue({ session: 'abc' }),
    });
    const runner = new PipelineRunner(adapter);
    const connector = makeConnector([
      { step: 'cookie', domain: 'example.com' },
    ]);
    await runner.run(connector, {});
    expect(adapter.getCookies).toHaveBeenCalledWith('example.com');
  });

  it('executes filter step on data', async () => {
    const adapter = mockAdapter({
      executeInContent: vi.fn().mockResolvedValue([
        { name: 'A', score: 5 }, { name: 'B', score: 15 },
      ]),
    });
    const runner = new PipelineRunner(adapter);
    const connector = makeConnector([
      { step: 'navigate', url: 'https://example.com' },
      { step: 'extract', selector: 'tr', fields: { name: 'td', score: 'td:nth-child(2)' } },
      { step: 'filter', field: 'score', operator: 'gt', value: '10' },
    ]);
    const result = await runner.run(connector, {});
    expect(result.data).toHaveLength(1);
    expect(result.data[0].name).toBe('B');
  });

  it('interpolates args in navigate URL', async () => {
    const adapter = mockAdapter();
    const runner = new PipelineRunner(adapter);
    const connector = makeConnector([
      { step: 'navigate', url: 'https://example.com/${{ args.month }}' },
    ]);
    await runner.run(connector, { month: '2026-06' });
    expect(adapter.navigateTab).toHaveBeenCalledWith('https://example.com/2026-06');
  });

  it('returns error result on step failure', async () => {
    const adapter = mockAdapter({
      navigateTab: vi.fn().mockRejectedValue(new Error('Tab error')),
    });
    const runner = new PipelineRunner(adapter);
    const connector = makeConnector([{ step: 'navigate', url: 'https://example.com' }]);
    const result = await runner.run(connector, {});
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Tab error');
  });
});
```

- [ ] **Step 2: Run — expect FAIL**
- [ ] **Step 3: Implement**

```typescript
// src/pipeline/runner.ts
import type { ConnectorDef, PipelineStep, ExtensionResponse } from '@commandgarden/shared';
import { PipelineContext } from './context.js';

export interface ChromeAdapter {
  navigateTab(url: string): Promise<number>;
  waitForTabLoad(tabId: number): Promise<void>;
  executeInContent(tabId: number, step: PipelineStep): Promise<unknown>;
  getCookies(domain: string): Promise<Record<string, string>>;
}

export class PipelineRunner {
  constructor(private adapter: ChromeAdapter) {}

  async run(
    connector: ConnectorDef,
    args: Record<string, string | number | boolean>,
  ): Promise<ExtensionResponse> {
    const ctx = new PipelineContext(args);
    let tabId = -1;
    const id = ''; // Will be set by caller

    try {
      for (const step of connector.pipeline) {
        switch (step.step) {
          case 'navigate': {
            const url = ctx.interpolate(step.url);
            tabId = await this.adapter.navigateTab(url);
            await this.adapter.waitForTabLoad(tabId);
            break;
          }
          case 'wait':
          case 'click':
          case 'type':
            await this.adapter.executeInContent(tabId, {
              ...step,
              ...(step.step === 'type' ? { value: ctx.interpolate(step.value) } : {}),
            } as PipelineStep);
            break;
          case 'extract': {
            const data = await this.adapter.executeInContent(tabId, step) as Record<string, unknown>[];
            ctx.setData(data);
            break;
          }
          case 'fetch': {
            const fetchStep = {
              ...step,
              url: ctx.interpolate(step.url),
              headers: step.headers
                ? Object.fromEntries(Object.entries(step.headers).map(([k, v]) => [k, ctx.interpolate(v)]))
                : undefined,
              body: step.body ? ctx.interpolate(step.body) : undefined,
            };
            const result = await this.adapter.executeInContent(tabId, fetchStep as PipelineStep);
            if (step.as) {
              ctx.setVar(step.as, result);
            } else if (Array.isArray(result)) {
              ctx.setData(result as Record<string, unknown>[]);
            }
            break;
          }
          case 'intercept': {
            const result = await this.adapter.executeInContent(tabId, step);
            if (step.as) ctx.setVar(step.as, result);
            break;
          }
          case 'cookie': {
            const cookies = await this.adapter.getCookies(step.domain);
            ctx.setCookies(cookies);
            if (step.name && step.as) {
              ctx.setVar(step.as, cookies[step.name] ?? '');
            }
            break;
          }
          case 'set':
            ctx.setVar(step.name, ctx.interpolate(step.value));
            break;
          case 'map':
            ctx.applyMap(step.fields);
            break;
          case 'filter':
            ctx.applyFilter(step.field, step.operator, step.value);
            break;
        }
      }
      return { id, ok: true, data: ctx.getData() };
    } catch (err) {
      return { id, ok: false, data: [], error: err instanceof Error ? err.message : String(err) };
    }
  }
}
```

- [ ] **Step 4: Run — expect PASS (~8 tests)**
- [ ] **Step 5: Commit** `"feat(chrome): pipeline runner with step orchestration and expression interpolation"`

---

## Task 7: WebSocket Client (TDD)

**Files:** Create `src/background/ws-client.ts`, `src/background/ws-client.test.ts`

Client that connects to daemon's `ws://127.0.0.1:{port}/ws/extension`.

- [ ] **Step 1: Write failing tests**

```typescript
// src/background/ws-client.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WsClient } from './ws-client.js';
import { EventEmitter } from 'node:events';

class MockWebSocket extends EventEmitter {
  static OPEN = 1;
  readyState = 1;
  sent: string[] = [];
  url: string;
  constructor(url: string) { super(); this.url = url; }
  send(data: string) { this.sent.push(data); }
  close() { this.readyState = 3; this.emit('close'); }
  addEventListener(event: string, cb: (...args: unknown[]) => void) { this.on(event, cb); }
  removeEventListener(event: string, cb: (...args: unknown[]) => void) { this.off(event, cb); }
}

describe('WsClient', () => {
  let client: WsClient;

  beforeEach(() => {
    client = new WsClient('ws://127.0.0.1:19825/ws/extension', MockWebSocket as any);
  });

  it('connects to daemon URL', () => {
    client.connect();
    expect(client.isConnected()).toBe(true);
  });

  it('sends ExtensionResponse', () => {
    client.connect();
    client.sendResponse({ id: '1', ok: true, data: [] });
    const ws = client.getSocket() as unknown as MockWebSocket;
    expect(ws.sent).toHaveLength(1);
    expect(JSON.parse(ws.sent[0]).id).toBe('1');
  });

  it('invokes onRequest handler for incoming messages', () => {
    const handler = vi.fn();
    client.onRequest(handler);
    client.connect();
    const ws = client.getSocket() as unknown as MockWebSocket;
    ws.emit('message', { data: JSON.stringify({ id: '1', connector: {}, args: {} }) });
    expect(handler).toHaveBeenCalled();
  });

  it('handles disconnect', () => {
    client.connect();
    const ws = client.getSocket() as unknown as MockWebSocket;
    ws.emit('close');
    expect(client.isConnected()).toBe(false);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**
- [ ] **Step 3: Implement**

```typescript
// src/background/ws-client.ts
import type { ExtensionRequest, ExtensionResponse } from '@commandgarden/shared';

type RequestHandler = (request: ExtensionRequest) => void;

interface WebSocketLike {
  readyState: number;
  send(data: string): void;
  close(): void;
  addEventListener(event: string, cb: (...args: unknown[]) => void): void;
  removeEventListener(event: string, cb: (...args: unknown[]) => void): void;
}

interface WebSocketConstructor {
  new(url: string): WebSocketLike;
  OPEN: number;
}

export class WsClient {
  private ws: WebSocketLike | null = null;
  private handler: RequestHandler | null = null;

  constructor(
    private url: string,
    private WS: WebSocketConstructor = globalThis.WebSocket as unknown as WebSocketConstructor,
  ) {}

  connect(): void {
    this.ws = new this.WS(this.url);
    const onMessage = (event: unknown) => {
      const data = typeof event === 'string' ? event : (event as MessageEvent)?.data;
      if (!data || !this.handler) return;
      try {
        const parsed = JSON.parse(String(data));
        if (parsed.id && parsed.connector) this.handler(parsed as ExtensionRequest);
      } catch { /* ignore parse errors */ }
    };
    const onClose = () => { this.ws = null; };
    this.ws.addEventListener('message', onMessage);
    this.ws.addEventListener('close', onClose);
  }

  onRequest(handler: RequestHandler): void { this.handler = handler; }

  sendResponse(response: ExtensionResponse): void {
    if (this.ws && this.ws.readyState === this.WS.OPEN) {
      this.ws.send(JSON.stringify(response));
    }
  }

  isConnected(): boolean { return this.ws !== null && this.ws.readyState === this.WS.OPEN; }

  disconnect(): void { if (this.ws) this.ws.close(); }

  getSocket(): WebSocketLike | null { return this.ws; }
}
```

- [ ] **Step 4: Run — expect PASS (~4 tests)**
- [ ] **Step 5: Commit** `"feat(chrome): WebSocket client for daemon connection"`

---

## Task 8: Chrome Adapter + Service Worker

**Files:** Create `src/background/chrome-adapter.ts`, finalize `src/background/service-worker.ts`, finalize `src/content/content-script.ts`

These files use real Chrome APIs and can't be fully unit-tested — they wire everything together.

- [ ] **Step 1: Implement Chrome Adapter**

```typescript
// src/background/chrome-adapter.ts
import type { PipelineStep } from '@commandgarden/shared';
import type { ChromeAdapter } from '../pipeline/runner.js';
import { createDomRequest, type DomResponse } from '../messages.js';

export class RealChromeAdapter implements ChromeAdapter {
  private tabId: number | null = null;

  async navigateTab(url: string): Promise<number> {
    if (this.tabId) {
      await chrome.tabs.update(this.tabId, { url });
    } else {
      const tab = await chrome.tabs.create({ url, active: false });
      this.tabId = tab.id!;
    }
    return this.tabId;
  }

  async waitForTabLoad(tabId: number): Promise<void> {
    return new Promise((resolve) => {
      const listener = (id: number, info: chrome.tabs.TabChangeInfo) => {
        if (id === tabId && info.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      };
      chrome.tabs.onUpdated.addListener(listener);
      // Also check if already complete
      chrome.tabs.get(tabId).then(tab => {
        if (tab.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      });
    });
  }

  async executeInContent(tabId: number, step: PipelineStep): Promise<unknown> {
    // Inject content script if not already injected
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content-script.js'],
    });

    const req = createDomRequest(
      step.step as 'wait' | 'extract' | 'click' | 'type' | 'fetch',
      step as unknown as Record<string, unknown>,
    );

    const response = await chrome.tabs.sendMessage(tabId, req) as DomResponse;
    if (!response.ok) throw new Error(response.error ?? 'Content script error');
    return response.data;
  }

  async getCookies(domain: string): Promise<Record<string, string>> {
    const cookies = await chrome.cookies.getAll({ domain });
    const result: Record<string, string> = {};
    for (const c of cookies) result[c.name] = c.value;
    return result;
  }

  cleanup(): void {
    if (this.tabId) {
      chrome.tabs.remove(this.tabId).catch(() => {});
      this.tabId = null;
    }
  }
}
```

- [ ] **Step 2: Implement Service Worker**

```typescript
// src/background/service-worker.ts
import type { ExtensionRequest } from '@commandgarden/shared';
import { WsClient } from './ws-client.js';
import { PipelineRunner } from '../pipeline/runner.js';
import { RealChromeAdapter } from './chrome-adapter.js';

const DAEMON_URL = 'ws://127.0.0.1:19825/ws/extension';
const client = new WsClient(DAEMON_URL);

client.onRequest(async (request: ExtensionRequest) => {
  const adapter = new RealChromeAdapter();
  const runner = new PipelineRunner(adapter);
  try {
    const result = await runner.run(request.connector, request.args);
    client.sendResponse({ ...result, id: request.id });
  } catch (err) {
    client.sendResponse({
      id: request.id, ok: false, data: [],
      error: err instanceof Error ? err.message : 'Unknown error',
    });
  } finally {
    adapter.cleanup();
  }
});

client.connect();
console.log('commandGarden service worker started');
```

- [ ] **Step 3: Implement Content Script entry point**

```typescript
// src/content/content-script.ts
import { isDomRequest, createDomResponse, type DomRequest } from '../messages.js';
import { waitForSelector, extractData, clickElement, typeIntoElement, fetchFromPage } from './dom-executor.js';

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!isDomRequest(message)) return false;
  const req = message as DomRequest;
  handleRequest(req).then(
    (data) => sendResponse(createDomResponse(req.id, true, data)),
    (err) => sendResponse(createDomResponse(req.id, false, undefined, err.message)),
  );
  return true; // Keep channel open for async response
});

async function handleRequest(req: DomRequest): Promise<unknown> {
  const p = req.params;
  switch (req.action) {
    case 'wait':
      await waitForSelector(p.selector as string, (p.timeout as number) ?? 10000);
      return undefined;
    case 'extract':
      return extractData(p.selector as string, p.fields as Record<string, string>);
    case 'click':
      await clickElement(p.selector as string);
      return undefined;
    case 'type':
      await typeIntoElement(p.selector as string, p.value as string);
      return undefined;
    case 'fetch':
      return fetchFromPage(
        p.url as string, p.method as string,
        p.headers as Record<string, string>, p.body as string,
      );
    default:
      throw new Error(`Unknown action: ${req.action}`);
  }
}
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit` (may need to skip chrome type errors for now)

- [ ] **Step 5: Commit** `"feat(chrome): Chrome adapter, service worker, and content script entry points"`

---

## Task 9: Build & Final Verification

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run` from `commandGarden/chrome/`
Expected: All tests pass (~41+ tests)

- [ ] **Step 2: Run shared tests to verify no regressions**

Run: `npx vitest run` from `commandGarden/shared/`
Expected: 97 tests pass

- [ ] **Step 3: Run daemon tests to verify no regressions**

Run: `npx vitest run` from `commandGarden/daemon/`
Expected: 50 tests pass

- [ ] **Step 4: Build extension**

Run: `node build.mjs` from `commandGarden/chrome/`
Expected: `dist/` contains `service-worker.js`, `content-script.js`, `manifest.json`

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat(chrome): final verification — all tests pass, extension builds"
```

---

## Summary

| Module | File | Tests | Purpose |
|--------|------|-------|---------|
| Messages | `messages.ts` | ~11 | SW ↔ content script protocol |
| Domain Guard | `domain-guard.ts` | ~10 | Domain allowlist enforcement |
| Pipeline Context | `pipeline/context.ts` | ~8 | Variables, interpolation, data transforms |
| DOM Executor | `content/dom-executor.ts` | ~10 | Wait, extract, click, type, fetch |
| Pipeline Runner | `pipeline/runner.ts` | ~8 | Step orchestration with injected deps |
| WS Client | `background/ws-client.ts` | ~4 | WebSocket connection to daemon |
| **Total** | | **~51** | |
