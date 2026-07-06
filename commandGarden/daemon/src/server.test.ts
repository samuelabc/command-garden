// src/server.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer, type ServerDeps } from './server.js';
import { configSchema } from './config.js';
import { ConnectorRegistry } from './registry.js';
import { AuditStore } from './audit-store.js';
import { WsRelay } from './ws-relay.js';
import { createAuditEvent } from '@commandgarden/shared';

const CONN_YAML = `
site: test
name: cmd
version: "1.0"
domains: ["example.com"]
capabilities: ["navigate"]
columns: [{ name: "id", type: "string" }]
pipeline:
  - step: navigate
    url: "https://example.com"
`;

async function makeDeps(tmpDir: string): Promise<ServerDeps> {
  writeFileSync(join(tmpDir, 'cmd.yaml'), CONN_YAML);
  const registry = new ConnectorRegistry([tmpDir]);
  registry.load();
  return {
    config: configSchema.parse({}),
    configPath: join(tmpDir, 'config.yaml'),
    sessionToken: 'test-token-abc',
    registry,
    auditStore: await AuditStore.create(':memory:'),
    wsRelay: new WsRelay(),
  };
}

describe('server', () => {
  let tmpDir: string;
  let deps: ServerDeps;

  beforeEach(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'cg-srv-'));
    deps = await makeDeps(tmpDir);
  });
  afterEach(() => {
    deps.auditStore.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('GET /api/status returns ok', async () => {
    const app = await createServer(deps);
    const res = await app.inject({ method: 'GET', url: '/api/status' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(true);
  });

  it('POST /api/run rejects missing X-CommandGarden header', async () => {
    const app = await createServer(deps);
    const res = await app.inject({
      method: 'POST', url: '/api/run',
      headers: { authorization: 'Bearer test-token-abc' },
      payload: { connector: 'test/cmd', args: {} },
    });
    expect(res.statusCode).toBe(403);
  });

  it('POST /api/run rejects missing auth', async () => {
    const app = await createServer(deps);
    const res = await app.inject({
      method: 'POST', url: '/api/run',
      headers: { 'x-commandgarden': '1' },
      payload: { connector: 'test/cmd', args: {} },
    });
    expect(res.statusCode).toBe(401);
  });

  it('POST /api/run rejects wrong token', async () => {
    const app = await createServer(deps);
    const res = await app.inject({
      method: 'POST', url: '/api/run',
      headers: { 'x-commandgarden': '1', authorization: 'Bearer wrong' },
      payload: { connector: 'test/cmd', args: {} },
    });
    expect(res.statusCode).toBe(401);
  });

  it('POST /api/run returns 404 for unknown connector', async () => {
    const app = await createServer(deps);
    const res = await app.inject({
      method: 'POST', url: '/api/run',
      headers: { 'x-commandgarden': '1', authorization: 'Bearer test-token-abc' },
      payload: { connector: 'no/such', args: {} },
    });
    expect(res.statusCode).toBe(404);
  });

  it('POST /api/run returns 503 when extension not connected', async () => {
    const app = await createServer(deps);
    const res = await app.inject({
      method: 'POST', url: '/api/run',
      headers: { 'x-commandgarden': '1', authorization: 'Bearer test-token-abc' },
      payload: { connector: 'test/cmd', args: {} },
    });
    expect(res.statusCode).toBe(503);
  });

  it('GET /api/connectors returns loaded connectors', async () => {
    const app = await createServer(deps);
    const res = await app.inject({
      method: 'GET', url: '/api/connectors',
      headers: { 'x-commandgarden': '1', authorization: 'Bearer test-token-abc' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.connectors).toHaveLength(1);
  });

  it('logs denied command to audit store', async () => {
    const app = await createServer(deps);
    await app.inject({
      method: 'POST', url: '/api/run',
      headers: { 'x-commandgarden': '1', authorization: 'Bearer test-token-abc' },
      payload: { connector: 'no/such', args: {} },
    });
    const events = deps.auditStore.list();
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('command.denied');
  });

  it('GET /api/connectors/:site/:name returns full connector', async () => {
    const app = await createServer(deps);
    const res = await app.inject({
      method: 'GET', url: '/api/connectors/test/cmd',
      headers: { 'x-commandgarden': '1', authorization: 'Bearer test-token-abc' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(true);
    expect(body.connector.site).toBe('test');
    expect(body.connector.name).toBe('cmd');
    expect(body.connector.pipeline).toBeDefined();
  });

  it('GET /api/connectors/:site/:name returns 404 for unknown', async () => {
    const app = await createServer(deps);
    const res = await app.inject({
      method: 'GET', url: '/api/connectors/no/such',
      headers: { 'x-commandgarden': '1', authorization: 'Bearer test-token-abc' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('GET /api/audit returns audit events', async () => {
    const app = await createServer(deps);
    await app.inject({
      method: 'POST', url: '/api/run',
      headers: { 'x-commandgarden': '1', authorization: 'Bearer test-token-abc' },
      payload: { connector: 'no/such', args: {} },
    });
    const res = await app.inject({
      method: 'GET', url: '/api/audit',
      headers: { 'x-commandgarden': '1', authorization: 'Bearer test-token-abc' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(true);
    expect(body.events).toHaveLength(1);
    expect(body.events[0].type).toBe('command.denied');
  });

  it('GET /api/audit filters by connector pattern', async () => {
    const app = await createServer(deps);
    await app.inject({
      method: 'POST', url: '/api/run',
      headers: { 'x-commandgarden': '1', authorization: 'Bearer test-token-abc' },
      payload: { connector: 'no/such', args: {} },
    });
    const res = await app.inject({
      method: 'GET', url: '/api/audit?connector=other/*',
      headers: { 'x-commandgarden': '1', authorization: 'Bearer test-token-abc' },
    });
    const body = JSON.parse(res.body);
    expect(body.events).toHaveLength(0);
  });

  it('logs auth.failed event for missing CSRF header', async () => {
    const app = await createServer(deps);
    await app.inject({
      method: 'POST', url: '/api/run',
      headers: { authorization: 'Bearer test-token-abc' },
      payload: { connector: 'test/cmd', args: {} },
    });
    const events = deps.auditStore.list({ type: 'auth.failed' });
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('auth.failed');
    expect(events[0].source).toBe('/api/run');
  });

  it('logs auth.failed event for invalid token', async () => {
    const app = await createServer(deps);
    await app.inject({
      method: 'POST', url: '/api/run',
      headers: { 'x-commandgarden': '1', authorization: 'Bearer wrong' },
      payload: { connector: 'test/cmd', args: {} },
    });
    const events = deps.auditStore.list({ type: 'auth.failed' });
    expect(events).toHaveLength(1);
  });

  it('GET /api/audit supports type filter', async () => {
    const app = await createServer(deps);
    deps.auditStore.insert(createAuditEvent({ type: 'auth.failed', connector: '', user: 'u', source: '/api/run' }));
    deps.auditStore.insert(createAuditEvent({ type: 'command.denied', connector: 'no/such', user: 'u' }));
    const res = await app.inject({
      method: 'GET', url: '/api/audit?type=auth.failed',
      headers: { 'x-commandgarden': '1', authorization: 'Bearer test-token-abc' },
    });
    const body = JSON.parse(res.body);
    expect(body.events).toHaveLength(1);
    expect(body.events[0].type).toBe('auth.failed');
  });

  it('GET /api/audit/:id returns single event', async () => {
    const app = await createServer(deps);
    const evt = createAuditEvent({ type: 'command.start', connector: 'a/b', user: 'u' });
    deps.auditStore.insert(evt);
    const res = await app.inject({
      method: 'GET', url: `/api/audit/${evt.id}`,
      headers: { 'x-commandgarden': '1', authorization: 'Bearer test-token-abc' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(true);
    expect(body.event.id).toBe(evt.id);
  });

  it('GET /api/audit/:id returns 404 for unknown', async () => {
    const app = await createServer(deps);
    const res = await app.inject({
      method: 'GET', url: '/api/audit/no-such-id',
      headers: { 'x-commandgarden': '1', authorization: 'Bearer test-token-abc' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('POST /api/config stores JSON array values as arrays', async () => {
    const app = await createServer(deps);
    const res = await app.inject({
      method: 'POST', url: '/api/config',
      headers: { 'x-commandgarden': '1', authorization: 'Bearer test-token-abc' },
      payload: { key: 'security.approvedHighRisk', value: '["timetracking/report"]' },
    });
    expect(res.statusCode).toBe(200);
    const configRes = await app.inject({
      method: 'GET', url: '/api/config',
      headers: { 'x-commandgarden': '1', authorization: 'Bearer test-token-abc' },
    });
    const body = JSON.parse(configRes.payload);
    expect(body.config.security.approvedHighRisk).toEqual(['timetracking/report']);
  });

  it('POST /api/config logs config.changed audit event', async () => {
    const app = await createServer(deps);
    const res = await app.inject({
      method: 'POST', url: '/api/config',
      headers: { 'x-commandgarden': '1', authorization: 'Bearer test-token-abc' },
      payload: { key: 'audit.retentionDays', value: '180' },
    });
    expect(res.statusCode).toBe(200);
    const events = deps.auditStore.list({ type: 'config.changed' });
    expect(events).toHaveLength(1);
    expect(events[0].source).toBe('audit.retentionDays');
    expect(events[0].newValue).toBe('180');
  });

  describe('enum arg validation', () => {
    const ENUM_YAML = `
site: test
name: regional
version: "1.0"
domains: ["a.example.com", "b.example.com"]
capabilities: ["navigate"]
args:
  - name: region
    type: string
    required: false
    default: "all"
    enum: [a, b]
pipeline:
  - step: navigate
    url: "https://a.example.com"
`;

    it('rejects invalid enum value with 400', async () => {
      writeFileSync(join(tmpDir, 'regional.yaml'), ENUM_YAML);
      deps.registry.load();
      const app = await createServer(deps);
      const res = await app.inject({
        method: 'POST', url: '/api/run',
        headers: { 'x-commandgarden': '1', authorization: 'Bearer test-token-abc' },
        payload: { connector: 'test/regional', args: { region: 'xyz' } },
      });
      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.error).toContain('Invalid value "xyz"');
    });

    it('accepts valid enum value', async () => {
      writeFileSync(join(tmpDir, 'regional.yaml'), ENUM_YAML);
      deps.registry.load();
      const app = await createServer(deps);
      // Will return 503 (extension not connected) but NOT 400 — validation passed
      const res = await app.inject({
        method: 'POST', url: '/api/run',
        headers: { 'x-commandgarden': '1', authorization: 'Bearer test-token-abc' },
        payload: { connector: 'test/regional', args: { region: 'a' } },
      });
      expect(res.statusCode).toBe(503);
    });

    it('accepts "all" as enum value', async () => {
      writeFileSync(join(tmpDir, 'regional.yaml'), ENUM_YAML);
      deps.registry.load();
      const app = await createServer(deps);
      const res = await app.inject({
        method: 'POST', url: '/api/run',
        headers: { 'x-commandgarden': '1', authorization: 'Bearer test-token-abc' },
        payload: { connector: 'test/regional', args: { region: 'all' } },
      });
      // 503 = passed validation, hit extension check
      expect(res.statusCode).toBe(503);
    });
  });

  describe('GET /api/config', () => {
    it('returns parsed config when file exists', async () => {
      const configPath = join(tmpDir, 'config.yaml');
      writeFileSync(configPath, 'daemon:\n  port: 9091\nsecurity:\n  extensionId: "test-ext"\n');

      const app = await createServer(deps);
      const resp = await app.inject({
        method: 'GET',
        url: '/api/config',
        headers: { authorization: `Bearer test-token-abc`, 'x-commandgarden': '1' },
      });

      expect(resp.statusCode).toBe(200);
      const body = JSON.parse(resp.payload);
      expect(body.ok).toBe(true);
      expect(body.config.daemon.port).toBe(9091);
      expect(body.config.security.extensionId).toBe('test-ext');
    });

    it('returns empty config when file does not exist', async () => {
      const nonExistentDeps = {
        ...deps,
        configPath: join(tmpDir, 'nonexistent-config.yaml'),
      };
      const app = await createServer(nonExistentDeps);
      const resp = await app.inject({
        method: 'GET',
        url: '/api/config',
        headers: { authorization: `Bearer test-token-abc`, 'x-commandgarden': '1' },
      });

      expect(resp.statusCode).toBe(200);
      const body = JSON.parse(resp.payload);
      expect(body.ok).toBe(true);
      expect(body.config).toEqual({});
    });

    it('requires auth', async () => {
      const app = await createServer(deps);
      const resp = await app.inject({ method: 'GET', url: '/api/config' });
      expect(resp.statusCode).toBe(403);
    });
  });
});
