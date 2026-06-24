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

function makeDeps(tmpDir: string): ServerDeps {
  writeFileSync(join(tmpDir, 'cmd.yaml'), CONN_YAML);
  const registry = new ConnectorRegistry([tmpDir]);
  registry.load();
  return {
    config: configSchema.parse({}),
    sessionToken: 'test-token-abc',
    registry,
    auditStore: new AuditStore(':memory:'),
    wsRelay: new WsRelay(),
  };
}

describe('server', () => {
  let tmpDir: string;
  let deps: ServerDeps;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'cg-srv-'));
    deps = makeDeps(tmpDir);
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
});
