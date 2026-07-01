// src/server.ts
import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import { randomUUID } from 'node:crypto';
import { isRunCommandRequest, createAuditEvent, STEP_CAPABILITY_MAP } from '@commandgarden/shared';
import type { ApprovalRequest, ApprovalConfig } from '@commandgarden/shared';
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
    if (req.url === '/api/status' || req.url === '/ws/extension') return;
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

  app.get('/api/connectors/:site/:name', async (req, reply) => {
    const { site, name } = req.params as { site: string; name: string };
    const key = `${site}/${name}`;
    const connector = deps.registry.get(key);
    if (!connector) {
      reply.code(404).send({ ok: false, error: `Connector "${key}" not found` });
      return;
    }
    return { ok: true, connector };
  });

  app.get('/api/audit', async (req) => {
    const query = req.query as Record<string, string>;
    const since = query.since ? new Date(query.since) : undefined;
    const connector = query.connector;
    const limit = query.limit ? parseInt(query.limit, 10) : 100;
    const events = deps.auditStore.list({ since, connector, limit });
    return { ok: true, events, count: events.length };
  });

  // SSE streams indexed by requestId
  const sseClients = new Map<string, (event: string, data: unknown) => void>();
  const sseReadyResolvers = new Map<string, () => void>();

  function buildApprovalConfig(): ApprovalConfig {
    return {
      approvalRequired: deps.config.security.approvalRequired,
      autoApproveConnectors: deps.config.security.autoApproveConnectors,
    };
  }

  function connectorNeedsApproval(connectorKey: string, connector: { pipeline: { step: string }[]; capabilities: string[] }): boolean {
    const approvalRequired = new Set(deps.config.security.approvalRequired);
    if (approvalRequired.size === 0) return false;
    if (deps.config.security.autoApproveConnectors.includes(connectorKey)) return false;
    return connector.pipeline.some(s => {
      const cap = STEP_CAPABILITY_MAP[s.step as keyof typeof STEP_CAPABILITY_MAP];
      return cap != null && approvalRequired.has(cap);
    });
  }

  deps.wsRelay.onApprovalRequest((request: ApprovalRequest) => {
    const sendSse = sseClients.get(request.requestId);
    if (sendSse) {
      sendSse('approval', request);
    }
    deps.wsRelay.registerApproval(request, deps.config.security.approvalTimeoutMs);
  });

  app.get('/api/run/events/:requestId', async (req, reply) => {
    const { requestId } = req.params as { requestId: string };
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    const sendSse = (event: string, data: unknown) => {
      reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    sseClients.set(requestId, sendSse);

    // Signal that SSE is ready — unblocks the pipeline start
    const resolver = sseReadyResolvers.get(requestId);
    if (resolver) {
      sseReadyResolvers.delete(requestId);
      resolver();
    }

    req.raw.on('close', () => {
      sseClients.delete(requestId);
    });
  });

  app.post('/api/approval', async (req, reply) => {
    const body = req.body as { approvalId?: string; approved?: boolean };
    if (!body.approvalId || typeof body.approved !== 'boolean') {
      reply.code(400).send({ ok: false, error: 'Missing approvalId or approved field' }); return;
    }
    const resolved = deps.wsRelay.resolveApproval(body.approvalId, body.approved);
    if (!resolved) {
      reply.code(404).send({ ok: false, error: 'No pending approval with that ID' }); return;
    }
    return { ok: true };
  });

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
    const requiresApproval = connectorNeedsApproval(body.connector, connector);
    const approvalConfig = requiresApproval ? buildApprovalConfig() : undefined;
    const startTime = Date.now();
    deps.auditStore.insert(createAuditEvent({
      type: 'command.start', connector: body.connector, user,
      args: body.args as Record<string, string>,
      domains: connector.domains, capabilities: [...connector.capabilities],
    }));

    const runPipeline = async (requestId: string) => {
      try {
        const resp = await deps.wsRelay.send(connector, body.args, approvalConfig, undefined, requestId || undefined);
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
          requestId, requiresApproval,
        };
      } catch (err) {
        const durationMs = Date.now() - startTime;
        const error = err instanceof Error ? err.message : 'Unknown error';
        deps.auditStore.insert(createAuditEvent({
          type: 'command.error', connector: body.connector, user,
          args: body.args as Record<string, string>, durationMs, error,
        }));
        return { ok: false, error, durationMs, requestId, requiresApproval };
      }
    };

    if (requiresApproval) {
      const requestId = randomUUID();
      // Wait for SSE connection before starting pipeline to avoid race condition
      const sseConnected = new Promise<void>(resolve => {
        sseReadyResolvers.set(requestId, resolve);
      });
      sseConnected.then(() => runPipeline(requestId)).then(result => {
        const sendSse = sseClients.get(requestId);
        if (sendSse) {
          sendSse('result', result);
          sseClients.delete(requestId);
        }
      });
      reply.code(202).send({
        ok: true, requestId, requiresApproval: true,
        connector: body.connector,
      });
    } else {
      const result = await runPipeline('');
      if (!result.ok && !result.data) {
        reply.code(500).send(result);
      } else {
        return result;
      }
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
