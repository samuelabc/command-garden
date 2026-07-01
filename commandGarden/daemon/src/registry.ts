// src/registry.ts
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { parseConnectorYaml, validateConnectorSemantics, type ConnectorDef } from '@commandgarden/shared';

export class ConnectorRegistry {
  private connectors = new Map<string, ConnectorDef>();
  private meta = new Map<string, { yamlContent: string; filePath: string }>();

  constructor(private paths: string[]) {}

  load(): { loaded: number; errors: string[] } {
    const errors: string[] = [];
    let loaded = 0;
    this.connectors.clear();
    this.meta.clear();
    for (const dir of this.paths) {
      const resolved = resolve(dir);
      if (!existsSync(resolved)) continue;
      for (const file of readdirSync(resolved).filter(f => f.endsWith('.yaml') || f.endsWith('.yml'))) {
        const content = readFileSync(join(resolved, file), 'utf-8');
        const result = parseConnectorYaml(content);
        if (!result.ok) { errors.push(`${file}: ${result.error.message}`); continue; }
        const fileErr = this.resolveFileRefs(result.data, join(resolved, file));
        if (fileErr) { errors.push(`${file}: ${fileErr}`); continue; }
        const semErrs = validateConnectorSemantics(result.data);
        if (semErrs.length > 0) { errors.push(`${file}: ${semErrs.join('; ')}`); continue; }
        const key = `${result.data.site}/${result.data.name}`;
        this.connectors.set(key, result.data);
        this.meta.set(key, { yamlContent: content, filePath: join(resolved, file) });
        loaded++;
      }
    }
    return { loaded, errors };
  }

  private resolveFileRefs(connector: ConnectorDef, yamlPath: string): string | null {
    const baseDir = dirname(yamlPath);
    for (const step of connector.pipeline) {
      if (step.step === 'js_evaluate' && step.file) {
        const filePath = join(baseDir, step.file);
        if (!existsSync(filePath)) {
          return `js_evaluate file not found: ${step.file}`;
        }
        (step as { code?: string }).code = readFileSync(filePath, 'utf-8');
      }
    }
    return null;
  }

  get(key: string): ConnectorDef | undefined { return this.connectors.get(key); }
  list(): ConnectorDef[] { return [...this.connectors.values()]; }
  keys(): string[] { return [...this.connectors.keys()]; }

  getWithMeta(key: string): { connector: ConnectorDef; yamlContent: string; filePath: string } | undefined {
    const connector = this.connectors.get(key);
    const m = this.meta.get(key);
    if (!connector || !m) return undefined;
    return { connector, ...m };
  }
}
