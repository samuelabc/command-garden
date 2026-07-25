// src/commands/config-cmd.ts
import { readFileSync, existsSync } from 'node:fs';
import type { DaemonClient } from '@commandgarden/shared';

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

export async function executeConfigApprove(
  client: DaemonClient,
  connectorId: string,
  capabilities: string[],
): Promise<string> {
  if (!connectorId || capabilities.length === 0) {
    return 'Usage: cg config approve <connector-id> <capability> [capability...]';
  }
  try {
    const resp = await client.get('/api/config') as { ok: boolean; config: Record<string, unknown> };
    const config = resp.config ?? {};
    const security = (config.security ?? {}) as Record<string, unknown>;
    const approvedHighRisk = (security.approvedHighRisk ?? {}) as Record<string, string[]>;

    const existing = approvedHighRisk[connectorId] ?? [];
    const merged = [...new Set([...existing, ...capabilities])];
    approvedHighRisk[connectorId] = merged;

    await client.post('/api/config', {
      key: 'security.approvedHighRisk',
      value: JSON.stringify(approvedHighRisk),
    });
    return `Approved ${connectorId} for capabilities: ${merged.join(', ')}`;
  } catch (err) {
    return `Error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

export async function executeConfigRevoke(
  client: DaemonClient,
  connectorId: string,
  capabilities: string[],
): Promise<string> {
  if (!connectorId) {
    return 'Usage: cg config revoke <connector-id> [capability...]';
  }
  try {
    const resp = await client.get('/api/config') as { ok: boolean; config: Record<string, unknown> };
    const config = resp.config ?? {};
    const security = (config.security ?? {}) as Record<string, unknown>;
    const approvedHighRisk = (security.approvedHighRisk ?? {}) as Record<string, string[]>;

    if (capabilities.length === 0) {
      delete approvedHighRisk[connectorId];
    } else {
      const existing = approvedHighRisk[connectorId] ?? [];
      approvedHighRisk[connectorId] = existing.filter(c => !capabilities.includes(c));
      if (approvedHighRisk[connectorId].length === 0) {
        delete approvedHighRisk[connectorId];
      }
    }

    await client.post('/api/config', {
      key: 'security.approvedHighRisk',
      value: JSON.stringify(approvedHighRisk),
    });
    return capabilities.length === 0
      ? `Revoked all approvals for ${connectorId}`
      : `Revoked ${connectorId} capabilities: ${capabilities.join(', ')}`;
  } catch (err) {
    return `Error: ${err instanceof Error ? err.message : String(err)}`;
  }
}
