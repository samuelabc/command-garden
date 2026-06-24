// src/server.ts
import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import { isRunCommandRequest, createAuditEvent } from '@commandgarden/shared';
import { userInfo } from 'node:os';
import type { DaemonConfig } from './config.js';
import type { ConnectorRegistry } from './registry.js';
import type { AuditStore } from './audit-store.js';
import { WsRelay } from './ws-relay.js';
import { validateCommand } from './validator.js';
import { validateToken } from './auth.js';

export interface ServerDeps {
  config: DaemonConfig;
  sessionToken: string;
  registry: ConnectorRegistry;
  auditStore: AuditStore;
  wsRelay: WsRelay;
}

export async function createServer(deps: ServerDeps) {
  const app = Fastify({ bodyLimit: 1024 * 1024 });
  await app.register(websocket);
  const user = userInfo().username;

  // Auth + CSRF hook (skip for /api/status and WS upgrade)
  app.addHook('preHandler', async (req, reply) => {
    if (req.url === '/api/status') return;
    const csrf = req.headers['x-commandgarden'];
    if (!csrf) { reply.code(403).send({ ok: false, error: 'Missing X-CommandGarden header' }); return; }
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) { reply.code(401).send({ ok: false, error: 'Unauthorized' }); return; }
    if (!validateToken(auth.slice(7), deps.sessionToken)) {
      reply.code(401).send({ ok: false, error: 'Invalid token' }); return;
    }
  });

  app.get('/api/status', async () => ({
    ok: true,
    extensionConnected: deps.wsRelay.connected,
    connectorCount: deps.registry.keys().length,
  }));

  app.get('/api/connectors', async () => ({
    ok: true,
    connectors: deps.registry.list().map(c => ({
      key: `${c.site}/${c.name}`, description: c.description,
      access: c.access, domains: c.domains, capabilities: c.capabilities,
    })),
  }));

  app.post('/api/run', async (req, reply) => {
    if (!isRunCommandRequest(req.body)) {
      reply.code(400).send({ ok: false, error: 'Invalid request' }); return;
    }
    const body = req.body;
    const validation = validateCommand(body.connector, deps.registry, deps.config);
    if (!validation.ok) {
      deps.auditStore.insert(createAuditEvent({
        type: 'command.denied', connector: body.connector, user,
        denialReason: validation.denialReason,
        args: body.args as Record<string, string>,
      }));
      reply.code(404).send({ ok: false, error: validation.denialReason }); return;
    }
    if (!deps.wsRelay.connected) {
      reply.code(503).send({ ok: false, error: 'Extension not connected' }); return;
    }
    const connector = validation.connector!;
    const startTime = Date.now();
    deps.auditStore.insert(createAuditEvent({
      type: 'command.start', connector: body.connector, user,
      args: body.args as Record<string, string>,
      domains: connector.domains, capabilities: [...connector.capabilities],
    }));
    try {
      const resp = await deps.wsRelay.send(connector, body.args);
      const durationMs = Date.now() - startTime;
      deps.auditStore.insert(createAuditEvent({
        type: resp.ok ? 'command.success' : 'command.error',
        connector: body.connector, user,
        args: body.args as Record<string, string>,
        domains: connector.domains, capabilities: [...connector.capabilities],
        rowCount: resp.data.length,
        columns: connector.columns?.map(c => c.name),
        durationMs, error: resp.error,
      }));
      return {
        ok: resp.ok, connector: body.connector, rowCount: resp.data.length,
        columns: connector.columns?.map(c => c.name) ?? [],
        data: resp.data, error: resp.error, durationMs,
      };
    } catch (err) {
      const durationMs = Date.now() - startTime;
      const error = err instanceof Error ? err.message : 'Unknown error';
      deps.auditStore.insert(createAuditEvent({
        type: 'command.error', connector: body.connector, user,
        args: body.args as Record<string, string>, durationMs, error,
      }));
      reply.code(500).send({ ok: false, error });
    }
  });

  app.get('/ws/extension', { websocket: true }, (socket, req) => {
    const origin = req.headers.origin ?? '';
    if (deps.config.security.extensionId &&
        origin !== `chrome-extension://${deps.config.security.extensionId}`) {
      socket.close(4001, 'Invalid origin');
      return;
    }
    deps.wsRelay.attach(socket);
  });

  return app;
}
