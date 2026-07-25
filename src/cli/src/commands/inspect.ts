// src/commands/inspect.ts
import type { DaemonClient } from '@commandgarden/shared';
import type { ConnectorDef } from '@commandgarden/shared';
import { CAPABILITY_RISK } from '@commandgarden/shared';

export async function executeInspect(client: DaemonClient, connectorKey: string): Promise<string> {
  if (!connectorKey.includes('/')) {
    return 'Invalid connector key. Use format: <site>/<command> (e.g., timetracking/report)';
  }

  try {
    const resp = await client.get<{ ok: boolean; connector: ConnectorDef }>(
      `/api/connectors/${connectorKey}`,
    );
    return renderConnector(resp.connector);
  } catch (err) {
    return `Error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

function renderConnector(c: ConnectorDef): string {
  const lines: string[] = [];
  lines.push(`Connector: ${c.site}/${c.name}`);
  lines.push(`Version:   ${c.version}`);
  if (c.description) lines.push(`Desc:      ${c.description}`);
  lines.push(`Access:    ${c.access}`);
  if (c.cdp) lines.push(`CDP:       enabled`);
  lines.push(`Domains:   ${c.domains.join(', ')}`);
  lines.push(`Caps:      ${c.capabilities.map(cap => `${cap} [${CAPABILITY_RISK[cap]}]`).join(', ')}`);

  if (c.args && c.args.length > 0) {
    lines.push('');
    lines.push('Arguments:');
    for (const a of c.args) {
      const req = a.required ? '(required)' : `(default: ${a.default ?? 'none'})`;
      lines.push(`  --${a.name}  ${a.type}  ${req}${a.help ? '  ' + a.help : ''}`);
    }
  }

  if (c.columns && c.columns.length > 0) {
    lines.push('');
    lines.push('Output columns:');
    for (const col of c.columns) {
      lines.push(`  ${col.name}  (${col.type})`);
    }
  }

  lines.push('');
  lines.push(`Pipeline: ${c.pipeline.length} step(s)`);
  for (let i = 0; i < c.pipeline.length; i++) {
    const s = c.pipeline[i] as Record<string, unknown>;
    lines.push(`  ${i + 1}. ${s.step}${stepSummary(s)}`);
  }

  return lines.join('\n');
}

function stepSummary(step: Record<string, unknown>): string {
  switch (step.step) {
    case 'navigate': return ` → ${step.url}`;
    case 'wait': return ` → ${step.selector ?? 'delay'}${step.timeout ? ` (${step.timeout}ms)` : ''}`;
    case 'extract': return ` → ${step.selector}`;
    case 'click': return ` → ${step.selector}`;
    case 'type': return ` → ${step.selector}`;
    case 'set': return ` → ${step.name} = ${step.value}`;
    case 'filter': return ` → ${step.field} ${step.operator} ${step.value}`;
    case 'map': return ` → ${Object.keys(step.fields as Record<string, string>).join(', ')}`;
    case 'cookie': return ` → ${step.domain}`;
    case 'fetch': return ` → ${step.method ?? 'GET'} ${step.url}`;
    case 'transform': return ` → ${step.type}`;
    default: return '';
  }
}
