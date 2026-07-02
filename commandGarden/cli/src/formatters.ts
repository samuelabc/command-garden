// src/formatters.ts
import Table from 'cli-table3';

export function formatTable(data: Record<string, unknown>[], columns: string[]): string {
  if (data.length === 0) return 'No data returned.';
  const table = new Table({ head: columns, style: { head: ['cyan'] } });
  for (const row of data) {
    table.push(columns.map(c => String(row[c] ?? '')));
  }
  return table.toString();
}

export function formatJson(
  data: Record<string, unknown>[],
  columns: string[],
  connector: string,
): string {
  return JSON.stringify({ ok: true, connector, rowCount: data.length, columns, data }, null, 2);
}

export function escapeCsvField(value: unknown): string {
  const str = String(value ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function formatCsv(data: Record<string, unknown>[], columns: string[]): string {
  const header = columns.join(',');
  const rows = data.map(row => columns.map(c => escapeCsvField(row[c])).join(','));
  return [header, ...rows].join('\n') + '\n';
}

export type OutputFormat = 'table' | 'json' | 'csv';

export function format(
  data: Record<string, unknown>[],
  columns: string[],
  connector: string,
  fmt: OutputFormat,
): string {
  switch (fmt) {
    case 'table': return formatTable(data, columns);
    case 'json': return formatJson(data, columns, connector);
    case 'csv': return formatCsv(data, columns);
    default: throw new Error(`Unknown format: ${fmt}`);
  }
}
