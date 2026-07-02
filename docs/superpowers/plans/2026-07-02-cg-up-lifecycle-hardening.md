# cg up Lifecycle Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace string-matching control flow, add crash/lock safety, and dedupe polling logic in commandGarden's daemon/GUI startup lifecycle (`cg up`, `cg daemon start`, `cg gui start`).

**Architecture:** Extract two tiny shared utilities (`process-alive.ts`, `poll.ts`) plus a new `lockfile.ts`, introduce a `LifecycleStartResult` discriminated-union type, and thread it through `daemon-cmd.ts` / `gui-cmd.ts` / `up-down.ts` / `main.ts`.

**Tech Stack:** TypeScript, Node.js `child_process`/`fs`, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-02-cg-up-lifecycle-hardening-design.md`

## Global Constraints

- All existing CLI output strings (the `message` field) must remain byte-identical to current behavior — no user-visible text changes except the two new progress lines (`"Starting daemon..."`, `"Starting GUI..."`) and the new `'locked'` case message.
- No changes to `daemon/src/` or `app/` — commands-layer only.
- Every new/modified file lives under `commandGarden/cli/src/`.
- Run `npx vitest run` from `commandGarden/cli` after every task; all tests must pass before commit.

---

### Task 1: `process-alive.ts` — shared liveness check

**Files:**
- Create: `commandGarden/cli/src/process-alive.ts`
- Test: `commandGarden/cli/src/process-alive.test.ts`

**Interfaces:**
- Produces: `isProcessAlive(pid: number): boolean`

- [ ] **Step 1: Write the failing test**

```typescript
// commandGarden/cli/src/process-alive.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { isProcessAlive } from './process-alive.js';

describe('isProcessAlive', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('returns true when process.kill does not throw', () => {
    vi.spyOn(process, 'kill').mockImplementation(() => true);
    expect(isProcessAlive(12345)).toBe(true);
  });

  it('returns false when process.kill throws', () => {
    vi.spyOn(process, 'kill').mockImplementation(() => { throw new Error('ESRCH'); });
    expect(isProcessAlive(12345)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (cwd `commandGarden/cli`): `npx vitest run src/process-alive.test.ts`
Expected: FAIL — `Cannot find module './process-alive.js'`

- [ ] **Step 3: Write minimal implementation**

```typescript
// commandGarden/cli/src/process-alive.ts
export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/process-alive.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add commandGarden/cli/src/process-alive.ts commandGarden/cli/src/process-alive.test.ts
git commit -m "feat(cli): add isProcessAlive helper"
```

---

### Task 2: `poll.ts` — shared readiness polling loop

**Files:**
- Create: `commandGarden/cli/src/poll.ts`
- Test: `commandGarden/cli/src/poll.test.ts`

**Interfaces:**
- Consumes: none (takes callbacks as params)
- Produces: `pollUntilReady(opts: { checkReady: () => Promise<boolean>; isAlive: () => boolean; maxAttempts: number; intervalMs: number }): Promise<'ready' | 'died' | 'timeout'>`

- [ ] **Step 1: Write the failing test**

```typescript
// commandGarden/cli/src/poll.test.ts
import { describe, it, expect, vi } from 'vitest';
import { pollUntilReady } from './poll.js';

describe('pollUntilReady', () => {
  it('returns "ready" as soon as checkReady succeeds', async () => {
    const checkReady = vi.fn().mockResolvedValue(true);
    const isAlive = vi.fn().mockReturnValue(true);
    const result = await pollUntilReady({ checkReady, isAlive, maxAttempts: 5, intervalMs: 0 });
    expect(result).toBe('ready');
    expect(checkReady).toHaveBeenCalledTimes(1);
  });

  it('returns "died" as soon as isAlive goes false', async () => {
    const checkReady = vi.fn().mockResolvedValue(false);
    const isAlive = vi.fn().mockReturnValue(false);
    const result = await pollUntilReady({ checkReady, isAlive, maxAttempts: 5, intervalMs: 0 });
    expect(result).toBe('died');
    expect(checkReady).not.toHaveBeenCalled();
  });

  it('returns "timeout" when neither happens within maxAttempts', async () => {
    const checkReady = vi.fn().mockResolvedValue(false);
    const isAlive = vi.fn().mockReturnValue(true);
    const result = await pollUntilReady({ checkReady, isAlive, maxAttempts: 3, intervalMs: 0 });
    expect(result).toBe('timeout');
    expect(checkReady).toHaveBeenCalledTimes(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/poll.test.ts`
Expected: FAIL — `Cannot find module './poll.js'`

- [ ] **Step 3: Write minimal implementation**

```typescript
// commandGarden/cli/src/poll.ts
export type PollOutcome = 'ready' | 'died' | 'timeout';

export async function pollUntilReady(opts: {
  checkReady: () => Promise<boolean>;
  isAlive: () => boolean;
  maxAttempts: number;
  intervalMs: number;
}): Promise<PollOutcome> {
  for (let i = 0; i < opts.maxAttempts; i++) {
    if (!opts.isAlive()) return 'died';
    if (await opts.checkReady()) return 'ready';
    await new Promise((r) => setTimeout(r, opts.intervalMs));
  }
  return 'timeout';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/poll.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add commandGarden/cli/src/poll.ts commandGarden/cli/src/poll.test.ts
git commit -m "feat(cli): add pollUntilReady shared polling helper"
```

---

### Task 3: `lockfile.ts` — PID-based lock with stale-lock stealing

**Files:**
- Create: `commandGarden/cli/src/lockfile.ts`
- Test: `commandGarden/cli/src/lockfile.test.ts`

**Interfaces:**
- Consumes: `isProcessAlive` from `./process-alive.js` (Task 1)
- Produces: `acquireLock(lockPath: string): { acquired: true } | { acquired: false; holderPid: number }`, `releaseLock(lockPath: string): void`

- [ ] **Step 1: Write the failing test**

```typescript
// commandGarden/cli/src/lockfile.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { acquireLock, releaseLock } from './lockfile.js';

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(),
  unlinkSync: vi.fn(),
}));

describe('acquireLock', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('acquires when no lock file exists', () => {
    vi.mocked(existsSync).mockReturnValue(false);
    const result = acquireLock('/fake/.cg/daemon.lock');
    expect(result).toEqual({ acquired: true });
    expect(writeFileSync).toHaveBeenCalledWith('/fake/.cg/daemon.lock', String(process.pid));
  });

  it('refuses when lock is held by a live process', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue('999');
    vi.spyOn(process, 'kill').mockImplementation(() => true);
    const result = acquireLock('/fake/.cg/daemon.lock');
    expect(result).toEqual({ acquired: false, holderPid: 999 });
  });

  it('steals a stale lock left by a dead process', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue('999');
    vi.spyOn(process, 'kill').mockImplementation(() => { throw new Error('ESRCH'); });
    const result = acquireLock('/fake/.cg/daemon.lock');
    expect(result).toEqual({ acquired: true });
    expect(writeFileSync).toHaveBeenCalledWith('/fake/.cg/daemon.lock', String(process.pid));
  });
});

describe('releaseLock', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('removes the lock file', () => {
    releaseLock('/fake/.cg/daemon.lock');
    expect(unlinkSync).toHaveBeenCalledWith('/fake/.cg/daemon.lock');
  });

  it('is a no-op if the file is already gone', () => {
    vi.mocked(unlinkSync).mockImplementation(() => { throw new Error('ENOENT'); });
    expect(() => releaseLock('/fake/.cg/daemon.lock')).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lockfile.test.ts`
Expected: FAIL — `Cannot find module './lockfile.js'`

- [ ] **Step 3: Write minimal implementation**

```typescript
// commandGarden/cli/src/lockfile.ts
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { isProcessAlive } from './process-alive.js';

export type LockResult = { acquired: true } | { acquired: false; holderPid: number };

export function acquireLock(lockPath: string): LockResult {
  if (existsSync(lockPath)) {
    const holderPid = parseInt(readFileSync(lockPath, 'utf-8').trim(), 10);
    if (isProcessAlive(holderPid)) return { acquired: false, holderPid };
  }
  writeFileSync(lockPath, String(process.pid));
  return { acquired: true };
}

export function releaseLock(lockPath: string): void {
  try { unlinkSync(lockPath); } catch { /* already gone */ }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lockfile.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add commandGarden/cli/src/lockfile.ts commandGarden/cli/src/lockfile.test.ts
git commit -m "feat(cli): add lockfile with stale-lock stealing"
```

---

### Task 4: `lifecycle-types.ts` — structured start result type

**Files:**
- Create: `commandGarden/cli/src/commands/lifecycle-types.ts`

**Interfaces:**
- Produces: `LifecycleStartResult` type, consumed by Tasks 5-7

- [ ] **Step 1: Create the type file (no test needed — type-only file)**

```typescript
// commandGarden/cli/src/commands/lifecycle-types.ts
export type LifecycleStatus = 'already-running' | 'started' | 'failed' | 'unresponsive' | 'locked';

export type LifecycleStartResult = {
  status: LifecycleStatus;
  message: string;
  pid?: number;
};
```

- [ ] **Step 2: Verify it compiles**

Run (cwd `commandGarden/cli`): `npx tsc --noEmit`
Expected: no errors (file has no consumers yet, so this just checks syntax)

- [ ] **Step 3: Commit**

```bash
git add commandGarden/cli/src/commands/lifecycle-types.ts
git commit -m "feat(cli): add LifecycleStartResult type"
```

---

### Task 5: Refactor `daemon-cmd.ts` to use `LifecycleStartResult`, `poll.ts`, `lockfile.ts`, spawn error handling, progress message

**Files:**
- Modify: `commandGarden/cli/src/commands/daemon-cmd.ts`
- Modify: `commandGarden/cli/src/commands/daemon-cmd.test.ts`

**Interfaces:**
- Consumes: `pollUntilReady` (Task 2), `acquireLock`/`releaseLock` (Task 3), `isProcessAlive` (Task 1), `LifecycleStartResult` (Task 4)
- Produces: `executeDaemonStart(baseUrl, cgHome, daemonScript): Promise<LifecycleStartResult>` (signature change — return type only, params unchanged). `executeDaemonStatus` and `executeDaemonStop` are unchanged (still return `string`).

- [ ] **Step 1: Rewrite `daemon-cmd.test.ts`'s `executeDaemonStart` describe block**

Replace the existing `describe('executeDaemonStart', ...)` block (lines 48-107 of the current file) with:

```typescript
describe('executeDaemonStart', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it('spawns daemon process and waits for ready', async () => {
    const fakeChild = { pid: 12345, unref: vi.fn(), on: vi.fn(), stderr: { on: vi.fn() } } as unknown as ChildProcess;
    vi.mocked(spawn).mockReturnValue(fakeChild);
    vi.mocked(existsSync).mockReturnValue(false);

    let fetchCount = 0;
    vi.mocked(globalThis.fetch).mockImplementation(() => {
      fetchCount++;
      if (fetchCount <= 1) return Promise.reject(new Error('ECONNREFUSED'));
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) } as Response);
    });
    vi.spyOn(process, 'kill').mockImplementation(() => true);

    const result = await executeDaemonStart('http://127.0.0.1:19825', '/fake/home/.commandgarden', '/fake/daemon/main.js');
    expect(result.status).toBe('started');
    expect(result.pid).toBe(12345);
    expect(result.message).toContain('12345');
    expect(spawn).toHaveBeenCalled();
  });

  it('reports failure when daemon process crashes', async () => {
    const fakeChild = { pid: 12345, unref: vi.fn(), on: vi.fn(), stderr: { on: vi.fn() } } as unknown as ChildProcess;
    vi.mocked(spawn).mockReturnValue(fakeChild);
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue('EADDRINUSE: address already in use');
    vi.mocked(globalThis.fetch).mockRejectedValue(new Error('ECONNREFUSED'));
    vi.spyOn(process, 'kill').mockImplementation(() => { throw new Error('ESRCH'); });

    const result = await executeDaemonStart('http://127.0.0.1:19825', '/fake/home/.commandgarden', '/fake/daemon/main.js');
    expect(result.status).toBe('failed');
    expect(result.message).toContain('failed to start');
    expect(result.message).toContain('EADDRINUSE');
  });

  it('reports unresponsive on timeout without crash', async () => {
    vi.useFakeTimers();
    const fakeChild = { pid: 12345, unref: vi.fn(), on: vi.fn(), stderr: { on: vi.fn() } } as unknown as ChildProcess;
    vi.mocked(spawn).mockReturnValue(fakeChild);
    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(globalThis.fetch).mockRejectedValue(new Error('ECONNREFUSED'));
    vi.spyOn(process, 'kill').mockImplementation(() => true);

    const resultPromise = executeDaemonStart('http://127.0.0.1:19825', '/fake/home/.commandgarden', '/fake/daemon/main.js');
    await vi.runAllTimersAsync();
    const result = await resultPromise;
    expect(result.status).toBe('unresponsive');
    expect(result.message).toContain('not responding');
    vi.useRealTimers();
  });

  it('reports if already running', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({ ok: true, json: () => Promise.resolve({ ok: true }) } as Response);
    const result = await executeDaemonStart('http://127.0.0.1:19825', '/fake/home/.commandgarden', '/fake/daemon/main.js');
    expect(result.status).toBe('already-running');
  });

  it('returns locked status when another instance holds the lock', async () => {
    vi.mocked(globalThis.fetch).mockRejectedValue(new Error('ECONNREFUSED'));
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue('999');
    vi.spyOn(process, 'kill').mockImplementation(() => true);

    const result = await executeDaemonStart('http://127.0.0.1:19825', '/fake/home/.commandgarden', '/fake/daemon/main.js');
    expect(result.status).toBe('locked');
    expect(result.message).toContain('999');
    expect(spawn).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/commands/daemon-cmd.test.ts`
Expected: FAIL — `result.status` is undefined (current implementation returns a plain string)

- [ ] **Step 3: Rewrite `daemon-cmd.ts`**

```typescript
// src/commands/daemon-cmd.ts
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, unlinkSync, mkdirSync, openSync, closeSync } from 'node:fs';
import { join } from 'node:path';
import { pollUntilReady } from '../poll.js';
import { isProcessAlive } from '../process-alive.js';
import { acquireLock, releaseLock } from '../lockfile.js';
import type { LifecycleStartResult } from './lifecycle-types.js';

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

export async function executeDaemonStart(baseUrl: string, cgHome: string, daemonScript: string): Promise<LifecycleStartResult> {
  try {
    const resp = await fetch(`${baseUrl}/api/status`);
    if (resp.ok) return { status: 'already-running', message: 'Daemon is already running.' };
  } catch { /* not running — proceed to start */ }

  mkdirSync(cgHome, { recursive: true });

  const lockPath = join(cgHome, 'daemon.lock');
  const lock = acquireLock(lockPath);
  if (!lock.acquired) {
    return {
      status: 'locked',
      message: `Another cg up/daemon start is already in progress (PID ${lock.holderPid}).`,
    };
  }

  try {
    const pidPath = join(cgHome, 'daemon.pid');
    const logPath = join(cgHome, 'daemon.log');

    console.error('Starting daemon...');

    const logFd = openSync(logPath, 'a');
    const child = spawn('node', [daemonScript], { detached: true, stdio: ['ignore', logFd, logFd] });
    closeSync(logFd);

    let spawnFailed = false;
    child.on('error', () => { spawnFailed = true; });

    if (child.pid) writeFileSync(pidPath, String(child.pid));
    child.unref();

    const outcome = await pollUntilReady({
      checkReady: async () => {
        try { const resp = await fetch(`${baseUrl}/api/status`); return resp.ok; } catch { return false; }
      },
      isAlive: () => !spawnFailed && (!child.pid || isProcessAlive(child.pid)),
      maxAttempts: 20,
      intervalMs: 500,
    });

    if (outcome === 'ready') {
      return { status: 'started', message: `Daemon started (PID: ${child.pid ?? 'unknown'}).`, pid: child.pid };
    }
    if (outcome === 'died') {
      if (existsSync(pidPath)) unlinkSync(pidPath);
      const tail = readLogTail(logPath, 10);
      return { status: 'failed', message: `Daemon failed to start.\n${tail}` };
    }
    return {
      status: 'unresponsive',
      message: `Daemon started (PID: ${child.pid ?? 'unknown'}) but is not responding. Check ${logPath} for details.`,
      pid: child.pid,
    };
  } finally {
    releaseLock(lockPath);
  }
}

function readLogTail(logPath: string, lines: number): string {
  try {
    const content = readFileSync(logPath, 'utf-8');
    return content.split('\n').slice(-lines).join('\n').trim();
  } catch {
    return '(no log available)';
  }
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

Also add `openSync: vi.fn().mockReturnValue(3), closeSync: vi.fn(),` to the `vi.mock('node:fs', ...)` block at the top of `daemon-cmd.test.ts` (already present from the earlier fix — verify it's there; if not, add it).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/commands/daemon-cmd.test.ts`
Expected: PASS (all tests, including 5 in `executeDaemonStart`)

- [ ] **Step 5: Commit**

```bash
git add commandGarden/cli/src/commands/daemon-cmd.ts commandGarden/cli/src/commands/daemon-cmd.test.ts
git commit -m "refactor(cli): daemon-cmd uses structured result, lock, shared poll"
```

---

### Task 6: Refactor `gui-cmd.ts` background-start path to match

**Files:**
- Modify: `commandGarden/cli/src/commands/gui-cmd.ts`
- Modify: `commandGarden/cli/src/commands/gui-cmd.test.ts`

**Interfaces:**
- Consumes: `pollUntilReady` (Task 2), `acquireLock`/`releaseLock` (Task 3), `isProcessAlive` (Task 1), `LifecycleStartResult` (Task 4)
- Produces: `executeGuiStart(baseUrl, cgHome, appScript, opts): Promise<LifecycleStartResult | string>` — **background path returns `LifecycleStartResult`; foreground path (`opts.background` falsy) keeps returning `string`** (foreground blocks until exit, is never consumed by `up-down.ts`, out of scope per spec). `executeGuiStop`/`executeGuiStatus` unchanged.

- [ ] **Step 1: Rewrite the `executeGuiStart` describe block in `gui-cmd.test.ts`**

Replace lines 86-129 of the current file with:

```typescript
describe('executeGuiStart', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(spawn).mockReturnValue(fakeChild());
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it('returns failed status when daemon is not running', async () => {
    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));
    const result = await executeGuiStart(
      'http://127.0.0.1:19825', '/fake/.cg', '/fake/app.js', { background: true },
    ) as import('./lifecycle-types.js').LifecycleStartResult;
    expect(result.status).toBe('failed');
    expect(result.message).toContain('Daemon is not running');
  });

  it('reports already running when PID is alive', async () => {
    mockFetch.mockResolvedValue({ ok: true } as Response);
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue('12345');
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);

    const result = await executeGuiStart(
      'http://127.0.0.1:19825', '/fake/.cg', '/fake/app.js', { background: true, noOpen: true },
    ) as import('./lifecycle-types.js').LifecycleStartResult;
    expect(result.status).toBe('already-running');
    killSpy.mockRestore();
  });

  it('starts in background and writes PID', async () => {
    mockFetch.mockResolvedValue({ ok: true } as Response);

    const result = await executeGuiStart(
      'http://127.0.0.1:19825', '/fake/.cg', '/fake/app.js', { background: true, noOpen: true },
    ) as import('./lifecycle-types.js').LifecycleStartResult;
    expect(result.status).toBe('started');
    expect(spawn).toHaveBeenCalledWith('node', ['/fake/app.js'], expect.anything());
    expect(writeFileSync).toHaveBeenCalled();
  });

  it('returns locked status when another instance holds the lock', async () => {
    mockFetch.mockResolvedValue({ ok: true } as Response);
    vi.mocked(existsSync).mockImplementation((p) => String(p).endsWith('app.lock'));
    vi.mocked(readFileSync).mockReturnValue('999');
    vi.spyOn(process, 'kill').mockImplementation(() => true);

    const result = await executeGuiStart(
      'http://127.0.0.1:19825', '/fake/.cg', '/fake/app.js', { background: true, noOpen: true },
    ) as import('./lifecycle-types.js').LifecycleStartResult;
    expect(result.status).toBe('locked');
    expect(spawn).not.toHaveBeenCalled();
  });
});
```

Note: the "already running when PID is alive" test's `existsSync` mock now needs to distinguish `app.pid` (true) from `app.lock` (false, so the lock check doesn't interfere) — the implementation in Step 3 checks the PID file before acquiring the lock, so `existsSync` returning `true` unconditionally is fine there since the function returns early before ever calling `acquireLock`. No change needed to that test's mock beyond what's shown.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/commands/gui-cmd.test.ts`
Expected: FAIL — background-path assertions expect `.status`, current code returns a plain string

- [ ] **Step 3: Rewrite `gui-cmd.ts`**

```typescript
// src/commands/gui-cmd.ts
import { spawn, type ChildProcess } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, unlinkSync, mkdirSync, openSync, closeSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { pollUntilReady } from '../poll.js';
import { isProcessAlive } from '../process-alive.js';
import { acquireLock, releaseLock } from '../lockfile.js';
import type { LifecycleStartResult } from './lifecycle-types.js';

function readAppPort(configPath: string): number {
  try {
    if (existsSync(configPath)) {
      const config = parseYaml(readFileSync(configPath, 'utf-8')) as Record<string, Record<string, unknown>>;
      const port = config?.app?.port;
      if (typeof port === 'number') return port;
    }
  } catch { /* use default */ }
  return 19826;
}

export async function executeGuiStart(
  baseUrl: string, cgHome: string, appScript: string, opts: { background?: boolean; noOpen?: boolean; configPath?: string },
): Promise<LifecycleStartResult | string> {
  const appPort = opts.configPath ? readAppPort(opts.configPath) : 19826;

  try {
    const resp = await fetch(`${baseUrl}/api/status`);
    if (!resp.ok) throw new Error();
  } catch {
    const message = 'Daemon is not running. Start it with: cg daemon start (or use cg up)';
    return opts.background ? { status: 'failed', message } : message;
  }

  const pidPath = join(cgHome, 'app.pid');
  if (existsSync(pidPath)) {
    const pid = parseInt(readFileSync(pidPath, 'utf-8').trim(), 10);
    if (isProcessAlive(pid)) {
      const message = 'GUI is already running.';
      return opts.background ? { status: 'already-running', message } : message;
    }
    unlinkSync(pidPath);
  }

  mkdirSync(cgHome, { recursive: true });

  if (opts.background) {
    const lockPath = join(cgHome, 'app.lock');
    const lock = acquireLock(lockPath);
    if (!lock.acquired) {
      return { status: 'locked', message: `Another cg up/gui start is already in progress (PID ${lock.holderPid}).` };
    }

    try {
      console.error('Starting GUI...');
      const logPath = join(cgHome, 'app.log');
      const logFd = openSync(logPath, 'a');
      const child = spawn('node', [appScript], { detached: true, stdio: ['ignore', logFd, logFd] });
      closeSync(logFd);

      let spawnFailed = false;
      child.on('error', () => { spawnFailed = true; });

      if (child.pid) writeFileSync(pidPath, String(child.pid));
      child.unref();

      if (opts.noOpen) {
        return { status: 'started', message: `GUI started (PID: ${child.pid ?? 'unknown'}).`, pid: child.pid };
      }

      const appUrl = `http://127.0.0.1:${appPort}`;
      const outcome = await pollUntilReady({
        checkReady: async () => { try { await fetch(appUrl); return true; } catch { return false; } },
        isAlive: () => !spawnFailed && (!child.pid || isProcessAlive(child.pid)),
        maxAttempts: 40,
        intervalMs: 500,
      });

      if (outcome === 'ready') {
        openBrowser(appUrl);
        return { status: 'started', message: `GUI started (PID: ${child.pid ?? 'unknown'}).`, pid: child.pid };
      }
      if (child.pid) try { process.kill(child.pid, 'SIGTERM'); } catch { /* already dead */ }
      if (existsSync(pidPath)) unlinkSync(pidPath);
      return { status: 'failed', message: `GUI failed to start. Check ${logPath} for errors.` };
    } finally {
      releaseLock(lockPath);
    }
  }

  // Foreground — exec directly (this blocks)
  const child = spawn('node', [appScript], { stdio: 'inherit' });
  if (!opts.noOpen) {
    const appUrl = `http://127.0.0.1:${appPort}`;
    const ready = await waitForServer(appUrl, child);
    if (ready) openBrowser(appUrl);
  }
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

async function waitForServer(url: string, child: ChildProcess): Promise<boolean> {
  for (let i = 0; i < 40; i++) {
    try { if (child.pid) process.kill(child.pid, 0); } catch { return false; }
    try { await fetch(url); return true; } catch { /* not ready yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

function openBrowser(url: string): void {
  const child = process.platform === 'darwin'
    ? spawn('open', [url], { stdio: 'ignore' })
    : process.platform === 'win32'
      ? spawn('cmd', ['/c', 'start', '', url], { stdio: 'ignore' })
      : spawn('xdg-open', [url], { stdio: 'ignore' });
  child.unref();
}
```

Note: the foreground path's `waitForServer` is intentionally left as-is (not migrated to `pollUntilReady`) since it returns a plain `boolean`, not the `PollOutcome` union, and refactoring it is out of scope (foreground GUI start is not consumed by `up-down.ts`).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/commands/gui-cmd.test.ts`
Expected: PASS (all tests)

- [ ] **Step 5: Commit**

```bash
git add commandGarden/cli/src/commands/gui-cmd.ts commandGarden/cli/src/commands/gui-cmd.test.ts
git commit -m "refactor(cli): gui-cmd background start uses structured result, lock, shared poll"
```

---

### Task 7: Refactor `up-down.ts` to branch on `status`, add missing test

**Files:**
- Modify: `commandGarden/cli/src/commands/up-down.ts`
- Modify: `commandGarden/cli/src/commands/up-down.test.ts`

**Interfaces:**
- Consumes: `executeDaemonStart` returning `LifecycleStartResult` (Task 5), `executeGuiStart` background path returning `LifecycleStartResult` (Task 6)
- Produces: `executeUp(...): Promise<string>` (unchanged signature — still joins messages into a display string), `executeDown(...): Promise<string>` (unchanged)

- [ ] **Step 1: Add the missing test case + update existing ones in `up-down.test.ts`**

Replace the full `describe('executeUp', ...)` block with:

```typescript
describe('executeUp', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
    vi.mocked(spawn).mockReturnValue(fakeChild());
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it('starts daemon then GUI', async () => {
    let fetchCount = 0;
    mockFetch.mockImplementation(() => {
      fetchCount++;
      if (fetchCount <= 1) return Promise.reject(new Error('ECONNREFUSED'));
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) });
    });
    vi.spyOn(process, 'kill').mockImplementation(() => true);
    vi.mocked(existsSync).mockReturnValue(false);

    const output = await executeUp(
      'http://127.0.0.1:19825', '/fake/.cg', '/fake/daemon.js', '/fake/app.js', '/fake/config.yaml',
    );
    expect(output).toContain('started');
    expect(spawn).toHaveBeenCalled();
  });

  it('reports daemon already running and still starts GUI', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ ok: true }) } as Response);
    vi.mocked(existsSync).mockReturnValue(false);

    const output = await executeUp(
      'http://127.0.0.1:19825', '/fake/.cg', '/fake/daemon.js', '/fake/app.js', '/fake/config.yaml',
    );
    expect(output).toContain('already running');
  });

  it('does not start GUI when daemon fails to start', async () => {
    // Pre-check fails (not running); process dies immediately during poll
    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));
    vi.mocked(existsSync).mockReturnValue(false);
    vi.spyOn(process, 'kill').mockImplementation(() => { throw new Error('ESRCH'); });

    const output = await executeUp(
      'http://127.0.0.1:19825', '/fake/.cg', '/fake/daemon.js', '/fake/app.js', '/fake/config.yaml',
    );
    expect(output).toContain('failed to start');
    // spawn was called once for the daemon attempt, never a second time for GUI
    expect(spawn).toHaveBeenCalledTimes(1);
  });
});
```

Add `existsSync` to the `import { readFileSync, existsSync } from 'node:fs';` line at the top of the test file if not already present (it is — verify).

- [ ] **Step 2: Run tests to verify the new one fails**

Run: `npx vitest run src/commands/up-down.test.ts`
Expected: FAIL on `does not start GUI when daemon fails to start` (current `up-down.ts` checks `.includes('failed')` on a string, but `executeDaemonStart` now returns an object — this test fails with a type/runtime mismatch until Step 3 lands)

- [ ] **Step 3: Rewrite `up-down.ts`**

```typescript
import { executeDaemonStart, executeDaemonStop } from './daemon-cmd.js';
import { executeGuiStart, executeGuiStop } from './gui-cmd.js';
import type { LifecycleStartResult } from './lifecycle-types.js';

export async function executeUp(
  baseUrl: string, cgHome: string, daemonScript: string, appScript: string, configPath: string,
): Promise<string> {
  const lines: string[] = [];
  const daemonResult = await executeDaemonStart(baseUrl, cgHome, daemonScript);
  lines.push(daemonResult.message);

  const canProceed = daemonResult.status === 'started' || daemonResult.status === 'already-running';
  if (!canProceed) {
    return lines.join('\n');
  }

  const guiResult = await executeGuiStart(baseUrl, cgHome, appScript, { background: true, configPath });
  lines.push(typeof guiResult === 'string' ? guiResult : (guiResult as LifecycleStartResult).message);
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

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/commands/up-down.test.ts`
Expected: PASS (all tests, including the new one)

- [ ] **Step 5: Commit**

```bash
git add commandGarden/cli/src/commands/up-down.ts commandGarden/cli/src/commands/up-down.test.ts
git commit -m "refactor(cli): up-down branches on structured status, adds missing skip-GUI-on-failure test"
```

---

### Task 8: Update `main.ts` call sites

**Files:**
- Modify: `commandGarden/cli/src/main.ts:117-119` (daemon start handler)
- Modify: `commandGarden/cli/src/main.ts:204-210` (gui start handler)

**Interfaces:**
- Consumes: `executeDaemonStart` returning `LifecycleStartResult` (Task 5), `executeGuiStart` returning `LifecycleStartResult | string` (Task 6)

- [ ] **Step 1: Update the daemon start handler**

In `commandGarden/cli/src/main.ts`, replace:

```typescript
daemon
  .command('start')
  .description('Start the daemon in background')
  .action(async () => {
    console.log(await executeDaemonStart(BASE_URL, CG_HOME, getDaemonScript()));
  });
```

with:

```typescript
daemon
  .command('start')
  .description('Start the daemon in background')
  .action(async () => {
    const result = await executeDaemonStart(BASE_URL, CG_HOME, getDaemonScript());
    console.log(result.message);
  });
```

- [ ] **Step 2: Update the gui start handler**

Replace:

```typescript
gui
  .command('start', { isDefault: true })
  .description('Start the GUI (foreground by default)')
  .option('-b, --background', 'Run in background')
  .option('--no-open', 'Do not open browser')
  .action(async (opts: { background?: boolean; open?: boolean }) => {
    console.log(await executeGuiStart(BASE_URL, CG_HOME, getAppScript(), {
      background: opts.background,
      noOpen: opts.open === false,
      configPath: CONFIG_PATH,
    }));
  });
```

with:

```typescript
gui
  .command('start', { isDefault: true })
  .description('Start the GUI (foreground by default)')
  .option('-b, --background', 'Run in background')
  .option('--no-open', 'Do not open browser')
  .action(async (opts: { background?: boolean; open?: boolean }) => {
    const result = await executeGuiStart(BASE_URL, CG_HOME, getAppScript(), {
      background: opts.background,
      noOpen: opts.open === false,
      configPath: CONFIG_PATH,
    });
    console.log(typeof result === 'string' ? result : result.message);
  });
```

- [ ] **Step 3: Verify the CLI builds**

Run (cwd `commandGarden/cli`): `npx tsc --noEmit`
Expected: no type errors

- [ ] **Step 4: Run the full test suite**

Run: `npx vitest run`
Expected: PASS — all tests across the package, including `daemon-cmd.test.ts`, `gui-cmd.test.ts`, `up-down.test.ts`, `poll.test.ts`, `lockfile.test.ts`, `process-alive.test.ts`

- [ ] **Step 5: Commit**

```bash
git add commandGarden/cli/src/main.ts
git commit -m "refactor(cli): main.ts prints .message from structured lifecycle results"
```

---

### Task 9: Build and manual end-to-end verification

**Files:** none (verification only)

- [ ] **Step 1: Build the CLI**

Run (cwd `commandGarden/cli`): `npm run build`
Expected: `dist/main.js` built successfully, no errors

- [ ] **Step 2: Re-link globally (if using `npm link`)**

Run (cwd `commandGarden/cli`): `npm link`
Expected: `cg` command now points at the freshly built `dist/main.js`

- [ ] **Step 3: Full clean-state manual test**

Run (cwd `commandGarden/cli`):
```
cg down
cg up
```
Expected: `Daemon started (PID: <n>).` then `GUI started (PID: <n>).` — no `Daemon is not running` message, no leftover `.lock` files in `~/.commandgarden/` after completion.

- [ ] **Step 4: Verify lock file cleanup**

Run: `Test-Path "$env:USERPROFILE\.commandgarden\daemon.lock"` and `Test-Path "$env:USERPROFILE\.commandgarden\app.lock"`
Expected: both `False` (locks released after successful start)

- [ ] **Step 5: Final commit (if any docs/TODO updates are needed)**

```bash
git add -A
git commit -m "chore: verify cg up lifecycle hardening end-to-end" --allow-empty
```
