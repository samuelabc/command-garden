// src/commands/run.ts
import type { DaemonClient } from '../client.js';
import type { RunCommandResponse } from '@commandgarden/shared';
import { format, type OutputFormat } from '../formatters.js';

export function parseConnectorArgs(rawArgs: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  let i = 0;
  while (i < rawArgs.length) {
    const arg = rawArgs[i];
    if (arg.startsWith('--')) {
      const eqIdx = arg.indexOf('=');
      if (eqIdx !== -1) {
        result[arg.slice(2, eqIdx)] = arg.slice(eqIdx + 1);
      } else if (i + 1 < rawArgs.length && !rawArgs[i + 1].startsWith('--')) {
        result[arg.slice(2)] = rawArgs[i + 1];
        i++;
      } else {
        result[arg.slice(2)] = 'true';
      }
    }
    i++;
  }
  return result;
}

export async function executeRun(
  client: DaemonClient,
  connector: string,
  args: Record<string, string>,
  outputFormat: OutputFormat,
): Promise<string> {
  try {
    const resp = await client.post<RunCommandResponse>('/api/run', {
      connector, args, format: outputFormat,
    });
    return format(resp.data, resp.columns, connector, outputFormat);
  } catch (err) {
    return `Error: ${err instanceof Error ? err.message : String(err)}`;
  }
}
