// src/registry.ts
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseConnectorYaml, validateConnectorSemantics, type ConnectorDef } from '@commandgarden/shared';

export class ConnectorRegistry {
  private connectors = new Map<string, ConnectorDef>();

  constructor(private paths: string[]) {}

  load(): { loaded: number; errors: string[] } {
    const errors: string[] = [];
    let loaded = 0;
    this.connectors.clear();
    for (const dir of this.paths) {
      const resolved = resolve(dir);
      if (!existsSync(resolved)) continue;
      for (const file of readdirSync(resolved).filter(f => f.endsWith('.yaml') || f.endsWith('.yml'))) {
        const content = readFileSync(join(resolved, file), 'utf-8');
        const result = parseConnectorYaml(content);
        if (!result.ok) { errors.push(`${file}: ${result.error.message}`); continue; }
        const semErrs = validateConnectorSemantics(result.data);
        if (semErrs.length > 0) { errors.push(`${file}: ${semErrs.join('; ')}`); continue; }
        this.connectors.set(`${result.data.site}/${result.data.name}`, result.data);
        loaded++;
      }
    }
    return { loaded, errors };
  }

  get(key: string): ConnectorDef | undefined { return this.connectors.get(key); }
  list(): ConnectorDef[] { return [...this.connectors.values()]; }
  keys(): string[] { return [...this.connectors.keys()]; }
}
