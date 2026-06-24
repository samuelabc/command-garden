// src/commands/list.ts
import Table from 'cli-table3';
import type { DaemonClient } from '../client.js';

interface ConnectorSummary {
  key: string;
  description?: string;
  access: string;
  domains: string[];
  capabilities: string[];
}

export async function executeList(client: DaemonClient): Promise<string> {
  try {
    const resp = await client.get<{ ok: boolean; connectors: ConnectorSummary[] }>('/api/connectors');
    if (resp.connectors.length === 0) return 'No connectors installed.';
    const table = new Table({
      head: ['Connector', 'Description', 'Access', 'Domains', 'Capabilities'],
      style: { head: ['cyan'] },
    });
    for (const c of resp.connectors) {
      table.push([
        c.key,
        c.description ?? '',
        c.access,
        c.domains.join(', '),
        c.capabilities.join(', '),
      ]);
    }
    return table.toString();
  } catch (err) {
    return `Error: ${err instanceof Error ? err.message : String(err)}`;
  }
}
