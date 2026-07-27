import { spawn, type ChildProcess } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, unlinkSync, mkdirSync, openSync, closeSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { pollUntilReady } from '../poll.js';
import { isProcessAlive } from '../process-alive.js';
import { acquireLock, releaseLock } from '../lockfile.js';
import type { LifecycleStartResult } from './lifecycle-types.js';

const DEFAULT_APP_PORT = 9092;

// Node emits exactly one of 'spawn' or 'error' for every spawned child, so this
// only guards against an environment where neither ever arrives. It assumes
// success: nagging a user whose browser did open is worse than staying quiet.
const BROWSER_SPAWN_TIMEOUT_MS = 3000;

function appUrlFor(configPath: string | undefined): string {
  return `http://127.0.0.1:${configPath ? readAppPort(configPath) : DEFAULT_APP_PORT}`;
}

function readAppPort(configPath: string): number {
  try {
    if (existsSync(configPath)) {
      const config = parseYaml(readFileSync(configPath, 'utf-8')) as Record<string, Record<string, unknown>>;
      const port = config?.app?.port;
      if (typeof port === 'number') return port;
    }
  } catch { /* use default */ }
  return DEFAULT_APP_PORT;
}

// Opening a browser is best-effort, but a silent failure leaves desktop-launcher
// users staring at nothing, so a failure has to make it into the message.
async function openBrowserOrNote(url: string, cgHome: string): Promise<string> {
  const opened = await openBrowser(url, cgHome);
  return opened ? '' : `\nCould not open a browser automatically — visit ${url}`;
}

// Used when another `cg up` holds the startup lock: that instance will finish
// bringing the services up, but it cannot open a browser for *this* invocation.
export async function waitForAppAndOpen(cgHome: string, configPath?: string): Promise<{ ok: boolean; message: string }> {
  const appUrl = appUrlFor(configPath);
  const outcome = await pollUntilReady({
    checkReady: async () => { try { await fetch(appUrl); return true; } catch { return false; } },
    isAlive: () => true,
    maxAttempts: 40,
    intervalMs: 500,
  });

  if (outcome !== 'ready') {
    return { ok: false, message: `The GUI did not become reachable at ${appUrl}.` };
  }
  return { ok: true, message: `GUI is reachable at ${appUrl}.${await openBrowserOrNote(appUrl, cgHome)}` };
}

export async function executeGuiStart(
  baseUrl: string, cgHome: string, appScript: string, nodeBinary: string, opts: { background?: boolean; noOpen?: boolean; configPath?: string },
): Promise<LifecycleStartResult | string> {
  const appUrl = appUrlFor(opts.configPath);

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
      const note = opts.noOpen ? '' : await openBrowserOrNote(appUrl, cgHome);
      const message = `GUI is already running.${note}`;
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
      const child = spawn(nodeBinary, [appScript], { detached: true, stdio: ['ignore', logFd, logFd] });
      closeSync(logFd);

      let spawnFailed = false;
      child.on('error', () => { spawnFailed = true; });

      if (child.pid) writeFileSync(pidPath, String(child.pid));
      child.unref();

      if (opts.noOpen) {
        return { status: 'started', message: `GUI started (PID: ${child.pid ?? 'unknown'}).`, pid: child.pid };
      }

      const outcome = await pollUntilReady({
        checkReady: async () => { try { await fetch(appUrl); return true; } catch { return false; } },
        isAlive: () => !spawnFailed && (!child.pid || isProcessAlive(child.pid)),
        maxAttempts: 40,
        intervalMs: 500,
      });

      if (outcome === 'ready') {
        const note = await openBrowserOrNote(appUrl, cgHome);
        return { status: 'started', message: `GUI started (PID: ${child.pid ?? 'unknown'}).${note}`, pid: child.pid };
      }
      if (child.pid) try { process.kill(child.pid, 'SIGTERM'); } catch { /* already dead */ }
      if (existsSync(pidPath)) unlinkSync(pidPath);
      return { status: 'failed', message: `GUI failed to start. Check ${logPath} for errors.` };
    } finally {
      releaseLock(lockPath);
    }
  }

  // Foreground — exec directly (this blocks)
  const child = spawn(nodeBinary, [appScript], { stdio: 'inherit' });
  if (!opts.noOpen) {
    const ready = await waitForServer(appUrl, child);
    if (ready) {
      const note = await openBrowserOrNote(appUrl, cgHome);
      if (note) console.error(note.trim());
    }
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
    // Check if process died
    try { if (child.pid) process.kill(child.pid, 0); } catch { return false; }
    try {
      await fetch(url);
      return true;
    } catch { /* not ready yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

function openBrowser(url: string, cgHome: string): Promise<boolean> {
  console.error('Opening browser...');
  const logPath = join(cgHome, 'browser.log');
  const log = (line: string): void => {
    try { writeFileSync(logPath, `[${new Date().toISOString()}] ${line}\n`, { flag: 'a' }); } catch { /* best-effort */ }
  };

  const [command, args]: [string, string[]] = process.platform === 'darwin'
    ? ['open', [url]]
    : process.platform === 'win32'
      ? ['cmd', ['/c', 'start', '', url]]
      : ['xdg-open', [url]];
  log(`platform=${process.platform} spawning: ${command} ${JSON.stringify(args)}`);

  const child = spawn(command, args, { stdio: 'ignore', detached: true });
  log(`spawned pid=${child.pid ?? 'unknown'}`);

  return new Promise<boolean>((resolve) => {
    let settled = false;
    const settle = (opened: boolean): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(opened);
    };
    const timer = setTimeout(() => settle(true), BROWSER_SPAWN_TIMEOUT_MS);
    timer.unref?.();

    child.on('spawn', () => { log('event: spawn (process launched)'); settle(true); });
    child.on('error', (err) => {
      log(`event: error ${err instanceof Error ? err.stack ?? err.message : String(err)}`);
      settle(false);
    });
    child.on('exit', (code, signal) => log(`event: exit code=${code} signal=${signal}`));
    child.unref();
  });
}
