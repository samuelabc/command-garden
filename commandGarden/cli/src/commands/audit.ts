// src/commands/audit.ts
import Table from 'cli-table3';
import type { DaemonClient } from '../client.js';
import type { AuditEvent } from '@commandgarden/shared';

interface AuditFilter {
  since?: string;
  connector?: string;
  limit?: number;
}

function buildQueryString(filter: AuditFilter): string {
  const params = new URLSearchParams();
  if (filter.since) params.set('since', filter.since);
  if (filter.connector) params.set('connector', filter.connector);
  if (filter.limit) params.set('limit', String(filter.limit));
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export async function executeAuditList(
  client: DaemonClient,
  filter: AuditFilter,
): Promise<string> {
  try {
    const resp = await client.get<{ ok: boolean; events: AuditEvent[]; count: number }>(
      `/api/audit${buildQueryString(filter)}`,
    );
    if (resp.events.length === 0) return 'No audit events found.';

    const table = new Table({
      head: ['Timestamp', 'Type', 'Connector', 'User', 'Duration', 'Rows', 'Error'],
      style: { head: ['cyan'] },
    });
    for (const e of resp.events) {
      table.push([
        e.timestamp.replace('T', ' ').slice(0, 19),
        e.type,
        e.connector,
        e.user,
        `${e.durationMs}ms`,
        e.rowCount?.toString() ?? '-',
        e.error ?? e.denialReason ?? '',
      ]);
    }
    return table.toString();
  } catch (err) {
    return `Error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

const AUDIT_COLUMNS = ['id', 'timestamp', 'type', 'user', 'connector', 'durationMs', 'rowCount', 'error', 'denialReason'];

export async function executeAuditExport(
  client: DaemonClient,
  filter: AuditFilter,
  format: 'json' | 'csv',
): Promise<string> {
  try {
    const resp = await client.get<{ ok: boolean; events: AuditEvent[]; count: number }>(
      `/api/audit${buildQueryString(filter)}`,
    );

    if (format === 'json') {
      return JSON.stringify({ events: resp.events, count: resp.count }, null, 2);
    }

    // CSV
    const header = AUDIT_COLUMNS.join(',');
    const rows = resp.events.map(e =>
      AUDIT_COLUMNS.map(col => {
        const val = (e as Record<string, unknown>)[col];
        const str = String(val ?? '');
        return str.includes(',') || str.includes('"') ? `"${str.replace(/"/g, '""')}"` : str;
      }).join(','),
    );
    return [header, ...rows].join('\n') + '\n';
  } catch (err) {
    return `Error: ${err instanceof Error ? err.message : String(err)}`;
  }
}
