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
