import { parse as parseYaml } from 'yaml';
import { ZodError } from 'zod';
import { connectorSchema, type ConnectorDef } from './connector.js';
import { STEP_CAPABILITY_MAP } from './pipeline.js';

export interface LoadError {
  code: 'YAML_PARSE_ERROR' | 'SCHEMA_VALIDATION_ERROR';
  message: string;
  details?: string[];
}

type LoadResult =
  | { ok: true; data: ConnectorDef }
  | { ok: false; error: LoadError };

export function parseConnectorYaml(yamlContent: string): LoadResult {
  let parsed: unknown;
  try {
    parsed = parseYaml(yamlContent);
  } catch (err) {
    return {
      ok: false,
      error: {
        code: 'YAML_PARSE_ERROR',
        message: err instanceof Error ? err.message : 'Failed to parse YAML',
      },
    };
  }

  const result = connectorSchema.safeParse(parsed);
  if (!result.success) {
    return {
      ok: false,
      error: {
        code: 'SCHEMA_VALIDATION_ERROR',
        message: 'Connector YAML does not match schema',
        details: result.error.issues.map((i: { path: (string | number)[]; message: string }) => `${i.path.join('.')}: ${i.message}`),
      },
    };
  }

  return { ok: true, data: result.data };
}

export function validateConnectorSemantics(connector: ConnectorDef): string[] {
  const errors: string[] = [];
  const declaredCapabilities = new Set(connector.capabilities);
  const declaredDomains = new Set(connector.domains);

  for (const step of connector.pipeline) {
    const requiredCap = STEP_CAPABILITY_MAP[step.step];
    if (requiredCap && !declaredCapabilities.has(requiredCap)) {
      errors.push(
        `Pipeline step "${step.step}" requires capability "${requiredCap}" which is not declared`,
      );
    }

    if (step.step === 'navigate') {
      try {
        const hostname = new URL(step.url).hostname;
        if (!declaredDomains.has(hostname)) {
          errors.push(
            `Navigate step uses domain "${hostname}" which is not declared in domains`,
          );
        }
      } catch {
        // URL might contain ${{ }} expressions — skip domain check for templates
        if (!step.url.includes('${{')) {
          errors.push(`Navigate step has invalid URL: ${step.url}`);
        }
      }
    }

    if (step.step === 'fetch') {
      try {
        const hostname = new URL(step.url).hostname;
        if (!declaredDomains.has(hostname)) {
          errors.push(
            `Fetch step uses domain "${hostname}" which is not declared in domains`,
          );
        }
      } catch {
        if (!step.url.includes('${{')) {
          errors.push(`Fetch step has invalid URL: ${step.url}`);
        }
      }
    }

    if (step.step === 'js_evaluate' && !step.code && !step.file) {
      errors.push('js_evaluate step requires either "code" or "file"');
    }

    if (step.step === 'cookie' && !declaredDomains.has(step.domain)) {
      errors.push(
        `Cookie step uses domain "${step.domain}" which is not declared in domains`,
      );
    }
  }

  // Check vars maps: if a vars entry is an object whose values are all strings,
  // verify each value is declared in the top-level domains list.
  if (connector.vars) {
    for (const [varName, varValue] of Object.entries(connector.vars)) {
      if (varValue == null || typeof varValue !== 'object' || Array.isArray(varValue)) continue;
      const entries = Object.entries(varValue as Record<string, unknown>);
      const allStrings = entries.length > 0 && entries.every(([, v]) => typeof v === 'string');
      if (!allStrings) continue;
      for (const [key, domain] of entries) {
        if (!declaredDomains.has(domain as string)) {
          errors.push(
            `vars.${varName}.${key} references domain "${domain}" which is not declared in domains`,
          );
        }
      }
    }
  }

  return errors;
}
