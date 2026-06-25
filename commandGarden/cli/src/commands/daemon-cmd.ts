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
