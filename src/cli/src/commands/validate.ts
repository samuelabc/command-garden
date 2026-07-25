// src/commands/validate.ts
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parseConnectorYaml, validateConnectorSemantics } from '@commandgarden/shared';

export function executeValidate(filePath: string): string {
  let content: string;
  try {
    content = readFileSync(filePath, 'utf-8');
  } catch (err) {
    return `Error: Cannot read file "${filePath}": ${err instanceof Error ? err.message : String(err)}`;
  }

  const result = parseConnectorYaml(content);
  if (!result.ok) {
    const lines = [`Invalid: ${result.error.message}`];
    if (result.error.details) {
      for (const d of result.error.details) lines.push(`  - ${d}`);
    }
    return lines.join('\n');
  }

  const evalFileContents = new Map<string, string>();
  const dir = dirname(filePath);
  for (const step of result.data.pipeline) {
    if (step.step === 'js_evaluate' && step.file) {
      const evalPath = join(dir, step.file);
      if (existsSync(evalPath)) {
        evalFileContents.set(step.file, readFileSync(evalPath, 'utf-8'));
      }
    }
  }

  const semanticErrors = validateConnectorSemantics(result.data, { evalFileContents });
  if (semanticErrors.length > 0) {
    const lines = ['Invalid: Semantic validation failed'];
    for (const e of semanticErrors) lines.push(`  - ${e}`);
    return lines.join('\n');
  }

  const c = result.data;
  return [
    `Valid: ${c.site}/${c.name} v${c.version}`,
    `  Access: ${c.access}`,
    `  Domains: ${c.domains.join(', ')}`,
    `  Capabilities: ${c.capabilities.join(', ')}`,
    `  Pipeline: ${c.pipeline.length} step(s)`,
    `  Args: ${c.args.length > 0 ? c.args.map(a => a.name).join(', ') : 'none'}`,
    `  Columns: ${c.columns.length > 0 ? c.columns.map(col => col.name).join(', ') : 'none'}`,
  ].join('\n');
}
