// src/validator.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ConnectorRegistry } from './registry.js';
import { validateCommand, type ValidationResult } from './validator.js';
import { configSchema } from './config.js';

const CONN_YAML = `
site: test
name: cmd
version: "1.0"
domains: ["example.com"]
capabilities: ["navigate"]
pipeline:
  - step: navigate
    url: "https://example.com"
`;

const HIGH_RISK_YAML = `
site: risky
name: eval
version: "1.0"
domains: ["example.com"]
capabilities: ["navigate", "js_evaluate"]
pipeline:
  - step: navigate
    url: "https://example.com"
`;

describe('validateCommand', () => {
  let tmpDir: string;
  let registry: ConnectorRegistry;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'cg-val-'));
    writeFileSync(join(tmpDir, 'cmd.yaml'), CONN_YAML);
    writeFileSync(join(tmpDir, 'risky.yaml'), HIGH_RISK_YAML);
    registry = new ConnectorRegistry([tmpDir]);
    registry.load();
  });
  afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

  it('accepts a valid low-risk request', () => {
    const config = configSchema.parse({});
    const r = validateCommand('test/cmd', registry, config);
    expect(r.ok).toBe(true);
    expect(r.connector).toBeDefined();
  });

  it('rejects unknown connector', () => {
    const config = configSchema.parse({});
    const r = validateCommand('no/such', registry, config);
    expect(r.ok).toBe(false);
    expect(r.denialReason).toContain('not found');
  });

  it('rejects high-risk connector not in approved list', () => {
    const config = configSchema.parse({});
    const r = validateCommand('risky/eval', registry, config);
    expect(r.ok).toBe(false);
    expect(r.denialReason).toContain('high-risk');
  });

  it('accepts high-risk connector when approved', () => {
    const config = configSchema.parse({ security: { approvedHighRisk: ['risky/eval'] } });
    const r = validateCommand('risky/eval', registry, config);
    expect(r.ok).toBe(true);
  });
});
