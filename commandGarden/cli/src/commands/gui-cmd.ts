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

function openBrowser(url: string): void {
  const child = process.platform === 'darwin'
    ? spawn('open', [url], { stdio: 'ignore' })
    : process.platform === 'win32'
      ? spawn('cmd', ['/c', 'start', '', url], { stdio: 'ignore' })
      : spawn('xdg-open', [url], { stdio: 'ignore' });
  child.unref();
}
