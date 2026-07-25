// src/config.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join, isAbsolute } from 'node:path';
import { tmpdir } from 'node:os';
import { loadConfig, configSchema, expandHome } from './config.js';

describe('configSchema', () => {
  it('parses empty object with all defaults', () => {
    const c = configSchema.parse({});
    expect(c.daemon.port).toBe(9091);
    expect(c.daemon.host).toBe('127.0.0.1');
    expect(c.security.highRiskCapabilities).toEqual(['js_evaluate', 'cdp_attach', 'state_mutate', 'network_egress']);
    expect(c.security.approvalRequired).toEqual([]);
    expect(c.security.autoApproveConnectors).toEqual([]);
    expect(c.security.approvedHighRisk).toEqual({});
    expect(c.security.approvalTimeoutMs).toBe(120_000);
    expect(c.audit.retentionDays).toBe(90);
    expect(c.output.defaultFormat).toBe('table');
  });

  it('overrides specific fields keeping other defaults', () => {
    const c = configSchema.parse({ daemon: { port: 9999 } });
    expect(c.daemon.port).toBe(9999);
    expect(c.daemon.host).toBe('127.0.0.1');
  });

  it('rejects invalid port', () => {
    expect(configSchema.safeParse({ daemon: { port: 99999 } }).success).toBe(false);
  });

  it('rejects invalid output format', () => {
    expect(configSchema.safeParse({ output: { defaultFormat: 'xml' } }).success).toBe(false);
  });

  it('includes an absolute, cwd-independent bundled connectors directory as the first default path', () => {
    const originalCwd = process.cwd();
    process.chdir(tmpdir());
    try {
      const c = configSchema.parse({});
      expect(c.connectors.paths).toHaveLength(2);
      expect(isAbsolute(c.connectors.paths[0])).toBe(true);
      expect(c.connectors.paths[0]).toContain('connectors');
      expect(c.connectors.paths[0]).not.toBe('./connectors');
      expect(c.connectors.paths[1]).toBe('~/.commandgarden/connectors');
    } finally {
      process.chdir(originalCwd);
    }
  });

  it('migrates old array-style approvedHighRisk to record format', () => {
    const c = configSchema.parse({
      security: { approvedHighRisk: ['timetracking/report', 'jira/my-tickets'] },
    });
    expect(c.security.approvedHighRisk).toEqual({
      'timetracking/report': ['js_evaluate'],
      'jira/my-tickets': ['js_evaluate'],
    });
  });

  it('accepts new record-style approvedHighRisk directly', () => {
    const c = configSchema.parse({
      security: { approvedHighRisk: { 'timetracking/report': ['js_evaluate'] } },
    });
    expect(c.security.approvedHighRisk).toEqual({ 'timetracking/report': ['js_evaluate'] });
  });
});

describe('expandHome', () => {
  it('expands ~ to home directory', () => {
    const r = expandHome('~/foo');
    expect(r).not.toContain('~');
    expect(r).toContain('foo');
  });

  it('leaves absolute paths unchanged', () => {
    expect(expandHome('/usr/local')).toBe('/usr/local');
  });
});

describe('loadConfig', () => {
  let tmpDir: string;
  beforeEach(() => { tmpDir = mkdtempSync(join(tmpdir(), 'cg-cfg-')); });
  afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

  it('returns defaults when file missing', () => {
    expect(loadConfig(join(tmpDir, 'no.yaml')).daemon.port).toBe(9091);
  });

  it('loads valid YAML config', () => {
    const p = join(tmpDir, 'config.yaml');
    writeFileSync(p, 'daemon:\n  port: 8080\nsecurity:\n  extensionId: "ext1"');
    const c = loadConfig(p);
    expect(c.daemon.port).toBe(8080);
    expect(c.security.extensionId).toBe('ext1');
    expect(c.audit.retentionDays).toBe(90);
  });

  it('handles empty YAML file', () => {
    const p = join(tmpDir, 'config.yaml');
    writeFileSync(p, '');
    expect(loadConfig(p).daemon.port).toBe(9091);
  });
});
