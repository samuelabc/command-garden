import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, unlinkSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { exec } from 'node:child_process';
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
    const child = spawn('node', [appScript], { detached: true, stdio: 'ignore' });
    if (child.pid) writeFileSync(pidPath, String(child.pid));
    child.unref();
    if (!opts.noOpen) openBrowser(`http://127.0.0.1:${appPort}`);
    return `GUI started (PID: ${child.pid ?? 'unknown'}).`;
  }

  // Foreground — exec directly (this blocks)
  if (!opts.noOpen) openBrowser(`http://127.0.0.1:${appPort}`);
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
