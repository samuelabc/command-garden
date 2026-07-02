import { spawn, type ChildProcess } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, unlinkSync, mkdirSync, openSync, closeSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';

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
): Promise<string> {
  const appPort = opts.configPath ? readAppPort(opts.configPath) : 19826;
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
    const logPath = join(cgHome, 'app.log');
    const logFd = openSync(logPath, 'a');
    const child = spawn('node', [appScript], { detached: true, stdio: ['ignore', logFd, logFd] });
    closeSync(logFd);
    if (child.pid) writeFileSync(pidPath, String(child.pid));
    child.unref();
    if (!opts.noOpen) {
      const appUrl = `http://127.0.0.1:${appPort}`;
      const ready = await waitForServer(appUrl, child);
      if (ready) {
        openBrowser(appUrl);
      } else {
        // Clean up the process and PID file since the server never became reachable
        if (child.pid) try { process.kill(child.pid, 'SIGTERM'); } catch { /* already dead */ }
        if (existsSync(pidPath)) unlinkSync(pidPath);
        return `GUI failed to start. Check ${logPath} for errors.`;
      }
    }
    return `GUI started (PID: ${child.pid ?? 'unknown'}).`;
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
