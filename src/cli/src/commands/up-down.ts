import { executeDaemonStart, executeDaemonStop } from './daemon-cmd.js';
import { executeGuiStart, executeGuiStop, waitForAppAndOpen } from './gui-cmd.js';
import type { LifecycleStatus } from './lifecycle-types.js';

export type UpResult = {
  ok: boolean;
  message: string;
};

// 'unresponsive' is a failure: the process spawned but never answered, so the
// GUI cannot work. ('locked' never reaches here — see resolveConcurrentStart.)
function isFailure(status: LifecycleStatus): boolean {
  return status === 'failed' || status === 'unresponsive';
}

// 'locked' means a concurrent `cg up` is already bringing services up (e.g. the
// user double-clicked the desktop launcher). That instance will finish the job,
// but it will not open a browser for *this* invocation — so wait for the GUI to
// come up and open it here, rather than exiting 0 with nothing on screen.
async function resolveConcurrentStart(
  lines: string[], cgHome: string, configPath: string, noOpen: boolean | undefined,
): Promise<UpResult> {
  if (noOpen) return { ok: true, message: lines.join('\n') };

  const waited = await waitForAppAndOpen(cgHome, configPath);
  lines.push(waited.message);
  return { ok: waited.ok, message: lines.join('\n') };
}

export async function executeUp(
  baseUrl: string, cgHome: string, daemonScript: string, appScript: string, nodeBinary: string, configPath: string,
  opts: { noOpen?: boolean } = {},
): Promise<UpResult> {
  const lines: string[] = [];
  const daemonResult = await executeDaemonStart(baseUrl, cgHome, daemonScript, nodeBinary);
  lines.push(daemonResult.message);

  if (daemonResult.status === 'locked') {
    return resolveConcurrentStart(lines, cgHome, configPath, opts.noOpen);
  }

  const canProceed = daemonResult.status === 'started' || daemonResult.status === 'already-running';
  if (!canProceed) {
    return { ok: !isFailure(daemonResult.status), message: lines.join('\n') };
  }

  const guiResult = await executeGuiStart(baseUrl, cgHome, appScript, nodeBinary, {
    background: true, configPath, noOpen: opts.noOpen,
  });

  if (typeof guiResult === 'string') {
    lines.push(guiResult);
    return { ok: true, message: lines.join('\n') };
  }

  lines.push(guiResult.message);

  if (guiResult.status === 'locked') {
    return resolveConcurrentStart(lines, cgHome, configPath, opts.noOpen);
  }
  return { ok: !isFailure(guiResult.status), message: lines.join('\n') };
}

export async function executeDown(cgHome: string): Promise<string> {
  const lines: string[] = [];
  lines.push(executeGuiStop(cgHome));
  lines.push(await executeDaemonStop(cgHome));
  lines.push('All services stopped.');
  return lines.join('\n');
}
