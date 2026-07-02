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
    const child = spawn('node', [daemonScript], { detached: true, stdio: ['ignore', logFd, logFd], cwd: cgHome });
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
