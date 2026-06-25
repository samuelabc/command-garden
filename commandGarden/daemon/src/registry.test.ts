// src/registry.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ConnectorRegistry } from './registry.js';

const VALID_YAML = `
site: test
name: cmd
version: "1.0"
domains: ["example.com"]
capabilities: ["navigate"]
pipeline:
  - step: navigate
    url: "https://example.com"
`;

const INVALID_YAML = `site: test\nname: bad\nversion: "1.0"`;

describe('ConnectorRegistry', () => {
  let tmpDir: string;
  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'cg-reg-'));
    writeFileSync(join(tmpDir, 'valid.yaml'), VALID_YAML);
  });
  afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

  it('loads valid connectors from directory', () => {
    const reg = new ConnectorRegistry([tmpDir]);
    const { loaded, errors } = reg.load();
    expect(loaded).toBe(1);
    expect(errors).toHaveLength(0);
  });

  it('looks up connector by site/name key', () => {
    const reg = new ConnectorRegistry([tmpDir]);
    reg.load();
    const c = reg.get('test/cmd');
    expect(c).toBeDefined();
    expect(c!.site).toBe('test');
  });

  it('returns undefined for unknown key', () => {
    const reg = new ConnectorRegistry([tmpDir]);
    reg.load();
    expect(reg.get('no/such')).toBeUndefined();
  });

  it('skips invalid YAML and reports errors', () => {
    writeFileSync(join(tmpDir, 'bad.yaml'), INVALID_YAML);
    const reg = new ConnectorRegistry([tmpDir]);
    const { loaded, errors } = reg.load();
    expect(loaded).toBe(1);
    expect(errors).toHaveLength(1);
  });

  it('skips nonexistent directories', () => {
    const reg = new ConnectorRegistry(['/nonexistent/path']);
    const { loaded, errors } = reg.load();
    expect(loaded).toBe(0);
    expect(errors).toHaveLength(0);
  });

  it('lists all loaded connectors', () => {
    const reg = new ConnectorRegistry([tmpDir]);
    reg.load();
    expect(reg.list()).toHaveLength(1);
  });

  it('loads from multiple paths', () => {
    const dir2 = mkdtempSync(join(tmpdir(), 'cg-reg2-'));
    writeFileSync(join(dir2, 'other.yaml'), VALID_YAML.replace('test', 'other'));
    const reg = new ConnectorRegistry([tmpDir, dir2]);
    reg.load();
    expect(reg.keys()).toHaveLength(2);
    rmSync(dir2, { recursive: true, force: true });
  });
});
