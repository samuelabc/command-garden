import { executeDaemonStart, executeDaemonStop } from './daemon-cmd.js';
import { executeGuiStart, executeGuiStop } from './gui-cmd.js';

export async function executeUp(
  baseUrl: string, cgHome: string, daemonScript: string, appScript: string, configPath: string,
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

  lines.push(await executeGuiStart(baseUrl, cgHome, appScript, { background: true, configPath }));
  return lines.join('\n');
}

export async function executeDown(cgHome: string): Promise<string> {
  const lines: string[] = [];
  lines.push(executeGuiStop(cgHome));
  lines.push(await executeDaemonStop(cgHome));
  lines.push('All services stopped.');
  return lines.join('\n');
}
