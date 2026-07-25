// src/commands/audit.ts
import Table from 'cli-table3';
import type { DaemonClient } from '@commandgarden/shared';
import type { AuditEvent } from '@commandgarden/shared';
import { escapeCsvField } from '../formatters.js';

interface AuditFilter {
  since?: string;
  connector?: string;
  type?: string;
  limit?: number;
}

function buildQueryString(filter: AuditFilter): string {
  const params = new URLSearchParams();
  if (filter.since) params.set('since', filter.since);
  if (filter.connector) params.set('connector', filter.connector);
  if (filter.type) params.set('type', filter.type);
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
      head: ['Timestamp', 'Type', 'Connector', 'User', 'Duration', 'Rows', 'Source', 'Error'],
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
        e.source ?? '-',
        e.error ?? e.denialReason ?? '',
      ]);
    }
    return table.toString();
  } catch (err) {
    return `Error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

const AUDIT_COLUMNS = [
  'id', 'timestamp', 'type', 'user', 'connector', 'durationMs', 'rowCount',
  'error', 'denialReason', 'correlationId', 'connectorHash', 'source',
  'args', 'domains', 'capabilities', 'steps',
];

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
        const val = (e as unknown as Record<string, unknown>)[col];
        if (val === null || val === undefined) return '';
        const raw = typeof val === 'object' ? JSON.stringify(val) : val;
        return escapeCsvField(raw);
      }).join(','),
    );
    return [header, ...rows].join('\n') + '\n';
  } catch (err) {
    return `Error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

export async function executeAuditShow(
  client: DaemonClient,
  id: string,
): Promise<string> {
  try {
    const resp = await client.get<{ ok: boolean; event: AuditEvent }>(`/api/audit/${id}`);
    const e = resp.event;
    const lines: string[] = [
      `Event: ${e.id}`,
      `Type: ${e.type}`,
      `Connector: ${e.connector}${e.connectorHash ? ` (hash: ${e.connectorHash})` : ''}`,
      `Correlation: ${e.correlationId ?? '-'}`,
      `User: ${e.user}`,
      `Timestamp: ${e.timestamp.replace('T', ' ').slice(0, 19)}`,
      `Duration: ${e.durationMs}ms`,
    ];
    if (e.rowCount !== undefined) lines.push(`Rows: ${e.rowCount}`);
    if (e.error) lines.push(`Error: ${e.error}`);
    if (e.denialReason) lines.push(`Denial: ${e.denialReason}`);
    if (e.source) lines.push(`Source: ${e.source}`);
    if (e.previousValue !== undefined) lines.push(`Previous: ${e.previousValue}`);
    if (e.newValue !== undefined) lines.push(`New: ${e.newValue}`);
    if (Object.keys(e.args).length > 0) {
      lines.push(`Args: ${JSON.stringify(e.args)}`);
    }
    if (e.steps && e.steps.length > 0) {
      lines.push('');
      lines.push('Pipeline Steps:');
      const stepTable = new Table({
        head: ['#', 'Step', 'Capabilities', 'Duration', 'Error'],
        style: { head: ['cyan'] },
      });
      for (const s of e.steps) {
        stepTable.push([
          s.index + 1,
          s.step,
          s.capabilities.length > 0 ? s.capabilities.join(', ') : '-',
          `${s.durationMs}ms`,
          s.error ?? '',
        ]);
      }
      lines.push(stepTable.toString());
    }
    return lines.join('\n');
  } catch (err) {
    return `Error: ${err instanceof Error ? err.message : String(err)}`;
  }
}
