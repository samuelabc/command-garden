# cg up Lifecycle Hardening

Design spec for hardening `cg up`/`cg daemon start`/`cg gui start` startup lifecycle, addressing findings from the code review of the "silent daemon crash" bug fix.

---

## Context

A bug was found where `cg up` reported `"Daemon started (PID: X)."` followed immediately by `"Daemon is not running."` The root cause: the daemon was spawned with `stdio: 'ignore'`, so a crash (e.g. `EADDRINUSE` from a stale, still-running daemon on the same port) was invisible, and the CLI declared success without verifying the daemon actually became reachable.

That was fixed by logging daemon stdio to `daemon.log` and polling `/api/status` after spawn before reporting success. A code review of that fix surfaced further gaps:

- `up-down.ts` decides whether to start the GUI by checking `daemonResult.includes('failed')` — string-matching on human-readable output used as control flow.
- Neither `daemon-cmd.ts` nor `gui-cmd.ts` attach an `error` listener to the spawned child process; if `spawn()` itself fails to launch (e.g. `node` not on PATH), Node.js throws an uncaught exception and crashes the CLI.
- The readiness-polling loop is duplicated near-verbatim between `daemon-cmd.ts` (daemon health check) and `gui-cmd.ts` (`waitForServer`).
- `cg up` can block up to ~30 seconds with no output, which reads as a hang.
- Two concurrent invocations of `cg up` or `cg daemon start` can both pass the "already running?" check and both spawn, reproducing the original crash.

**Scope:** This spec covers all of the above — the two correctness gaps (test coverage, spawn error handling) plus the four suggested improvements (structured return type, shared polling helper, progress messages, and a lockfile). This is a self-contained hardening pass over the daemon/GUI process-lifecycle code in `commandGarden/cli/src/commands/`; it does not touch the daemon or app server code itself.

---

## 1. New Shared Modules

### 1.1 `src/poll.ts`

Extracts the duplicated polling loop currently hand-rolled in `daemon-cmd.ts` and `gui-cmd.ts` (`waitForServer`).

```typescript
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

`checkReady` wraps the existing `fetch(...)` health checks (daemon: `/api/status`; GUI: the app URL). `isAlive` wraps `process.kill(pid, 0)` in a try/catch returning a boolean instead of throwing. Both call sites (`executeDaemonStart`, `executeGuiStart`) replace their loops with a call to `pollUntilReady` and branch on the returned outcome.

### 1.2 `src/lockfile.ts`

New generic file-based lock to close the concurrent-invocation race.

```typescript
export type LockResult = { acquired: true } | { acquired: false; holderPid: number };

export function acquireLock(lockPath: string): LockResult {
  if (existsSync(lockPath)) {
    const holderPid = parseInt(readFileSync(lockPath, 'utf-8').trim(), 10);
    if (isProcessAlive(holderPid)) return { acquired: false, holderPid };
    // Stale lock (holder crashed) — steal it
  }
  writeFileSync(lockPath, String(process.pid));
  return { acquired: true };
}

export function releaseLock(lockPath: string): void {
  try { unlinkSync(lockPath); } catch { /* already gone */ }
}
```

`isProcessAlive` is the same `process.kill(pid, 0)` try/catch helper used by `pollUntilReady`'s `isAlive` — factored into this module and imported by `poll.ts` to avoid duplication.

---

## 2. Structured Return Type

Replaces the current plain-string return from `executeDaemonStart` (and the background path of `executeGuiStart`):

```typescript
export type LifecycleStartResult = {
  status: 'already-running' | 'started' | 'failed' | 'unresponsive' | 'locked';
  message: string;
  pid?: number;
};
```

- `message` is the exact human-readable string previously returned — CLI output behavior is unchanged.
- `status` is what callers branch on. `up-down.ts`'s `executeUp` proceeds to GUI start only if `daemonResult.status === 'started' || daemonResult.status === 'already-running'`.
- `main.ts` command handlers (`cg daemon start`, `cg gui start`) print `result.message` exactly as they print the current string return — no user-visible change for standalone invocations.

`executeDaemonStop`, `executeGuiStop`, `executeDaemonStatus`, `executeGuiStatus` are unaffected — they aren't consumed programmatically by other functions, so plain-string returns stay as-is (no speculative refactor).

---

## 3. Lock Acquisition Points

- `executeDaemonStart` acquires `daemon.lock` (in `cgHome`) immediately after the "already running?" pre-check and before `spawn()`. Released in a `finally` block after the poll loop resolves (success, failure, or timeout).
- `executeGuiStart`'s background path acquires `app.lock` the same way, mirroring the daemon path.
- If the lock is held by a live process, return immediately (no waiting):
  ```
  { status: 'locked', message: 'Another cg up/daemon start is already in progress (PID <holderPid>).' }
  ```
- `executeUp` treats `'locked'` the same as `'failed'`/`'unresponsive'` — does not proceed to GUI start.

---

## 4. Spawn Error Handling

Both `daemon-cmd.ts` and `gui-cmd.ts` attach a listener before the poll loop:

```typescript
let spawnError: Error | undefined;
child.on('error', (err) => { spawnError = err; });
```

The poll loop's `isAlive` check treats a populated `spawnError` the same as a dead process — the function returns `status: 'failed'` with `spawnError.message` included, instead of letting the event throw uncaught.

---

## 5. Progress Feedback

Before entering the poll loop, both `executeDaemonStart` and `executeGuiStart` (background path) write a single line to stderr via `console.error`:

- `"Starting daemon..."`
- `"Starting GUI..."`

This keeps stdout clean for scripting while giving interactive users feedback during the up-to-~30s wait. Not included in the returned `message` (it's immediate, ephemeral progress — not part of the final result).

---

## 6. Testing Plan

| File | Coverage |
|---|---|
| `src/poll.test.ts` (new) | `pollUntilReady` returns `'ready'` when `checkReady` succeeds; `'died'` when `isAlive` goes false mid-loop; `'timeout'` when neither happens within `maxAttempts`. |
| `src/lockfile.test.ts` (new) | `acquireLock` succeeds when no lock file exists; fails with `holderPid` when a live process holds it; succeeds (steals) when the lock file's PID is dead; `releaseLock` removes the file and is a no-op if already gone. |
| `daemon-cmd.test.ts` (update) | Adjust existing assertions for the new `{ status, message, pid }` return shape. Add: lock held → `status: 'locked'`; spawn `error` event → `status: 'failed'` with error message included. |
| `gui-cmd.test.ts` (update) | Same additions mirrored for the GUI background-start path. |
| `up-down.test.ts` (update) | Add the missing case identified in review: daemon `status: 'failed'` → assert `executeGuiStart`'s fetch/spawn is never invoked (the actual behavior the original bug fix was supposed to guarantee). |

All existing test assertions that currently do `expect(output).toContain(...)` against the raw string continue to work unchanged where they check `result.message`; only the control-flow assertions (`already running`, `failed`, etc.) move to checking `result.status`.

---

## 7. Non-Goals

- No changes to the daemon (`daemon/src/`) or app server (`app/`) processes themselves.
- No wait-and-retry behavior for the lock (bail-out only, per design decision) — a future enhancement if concurrent invocation turns out to be common in practice.
- No log rotation for `daemon.log`/`app.log` (flagged in review as a minor future concern, out of scope here).
- `executeDaemonStatus`/`executeGuiStatus`/`executeDaemonStop`/`executeGuiStop` keep their current plain-string signatures.
