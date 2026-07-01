// src/commands/config-cmd.ts
import { readFileSync, existsSync } from 'node:fs';
import type { DaemonClient } from '../client.js';

export function executeConfigShow(configPath: string): string {
  if (!existsSync(configPath)) {
    return [
      'No config file found.',
      `Expected at: ${configPath}`,
      'Using defaults. Run "commandgarden config set <key> <value>" to create one.',
    ].join('\n');
  }
  return readFileSync(configPath, 'utf-8');
}

export async function executeConfigSet(client: DaemonClient, key: string, value: string): Promise<string> {
  try {
    await client.post('/api/config', { key, value });
    return `Set ${key} = ${value}`;
  } catch (err) {
    return `Error: ${err instanceof Error ? err.message : String(err)}`;
  }
}
