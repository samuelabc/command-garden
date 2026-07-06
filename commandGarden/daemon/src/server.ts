// src/server.ts
import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import { randomUUID, createHash } from 'node:crypto';
import { isRunCommandRequest, createAuditEvent, STEP_CAPABILITY_MAP, expandFanOut, validateEnumArgs } from '@commandgarden/shared';
import type { ApprovalRequest, ApprovalConfig } from '@commandgarden/shared';
import { userInfo } from 'node:os';
import type { DaemonConfig } from './config.js';
import type { ConnectorRegistry } from './registry.js';
import type { AuditStore } from './audit-store.js';
import { WsRelay } from './ws-relay.js';
import { validateCommand } from './validator.js';
import { validateToken } from './auth.js';
import { SseManager } from './sse-manager.js';

export interface ServerDeps {
  config: DaemonConfig;
  configPath: string;
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
    if (!csrf) {
      try { deps.auditStore.insert(createAuditEvent({ type: 'auth.failed', connector: '', user, source: req.url })); } catch { /* audit best-effort for auth failures */ }
      reply.code(403).send({ ok: false, error: 'Missing X-CommandGarden header' }); return;
    }
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) {
      try { deps.auditStore.insert(createAuditEvent({ type: 'auth.failed', connector: '', user, source: req.url })); } catch { /* audit best-effort */ }
      reply.code(401).send({ ok: false, error: 'Unauthorized' }); return;
    }
    if (!validateToken(auth.slice(7), deps.sessionToken)) {
      try { deps.auditStore.insert(createAuditEvent({ type: 'auth.failed', connector: '', user, source: req.url })); } catch { /* audit best-effort */ }
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
    const type = query.type;
    const limit = query.limit ? parseInt(query.limit, 10) : 100;
    const events = deps.auditStore.list({ since, connector, type, limit });
    return { ok: true, events, count: events.length };
  });

  app.get('/api/audit/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const event = deps.auditStore.getById(id);
    if (!event) {
      reply.code(404).send({ ok: false, error: 'Event not found' }); return;
    }
    return { ok: true, event };
  });

  app.get('/api/config', async () => {
    const { readFileSync, existsSync } = await import('node:fs');
    const { parse: parseYaml } = await import('yaml');
    let config: Record<string, unknown> = {};
    if (existsSync(deps.configPath)) {
      config = (parseYaml(readFileSync(deps.configPath, 'utf-8')) as Record<string, unknown>) ?? {};
    }
    return { ok: true, config };
  });

  const SSE_CONNECT_TIMEOUT_MS = 30_000;
  const sse = new SseManager();

  function buildApprovalConfig(): ApprovalConfig {
    return {
      approvalRequired: deps.config.security.approvalRequired,
      autoApproveConnectors: deps.config.security.autoApproveConnectors,
      approvalTimeoutMs: deps.config.security.approvalTimeoutMs,
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
    sse.send(request.requestId, 'approval', request);
    deps.wsRelay.registerApproval(request, deps.config.security.approvalTimeoutMs);
  });

  deps.wsRelay.onApprovalResolved((approvalId, approved, request) => {
    try {
      deps.auditStore.insert(createAuditEvent({
        type: approved ? 'approval.granted' : 'approval.rejected',
        connector: request.connectorKey,
        user,
        source: 'extension',
        correlationId: request.requestId,
      }));
    } catch { /* audit best-effort */ }
  });

  app.get('/api/run/events/:requestId', async (req, reply) => {
    const { requestId } = req.params as { requestId: string };
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    sse.register(requestId, (event, data) => {
      reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    });

    req.raw.on('close', () => {
      sse.remove(requestId);
    });
  });

  app.post('/api/approval', async (req, reply) => {
    const body = req.body as { approvalId?: string; approved?: boolean };
    if (!body.approvalId || typeof body.approved !== 'boolean') {
      reply.code(400).send({ ok: false, error: 'Missing approvalId or approved field' }); return;
    }
    // Look up pending approval BEFORE resolving (resolve deletes the entry)
    const pending = deps.wsRelay.getPendingApproval(body.approvalId);
    const resolved = deps.wsRelay.resolveApproval(body.approvalId, body.approved);
    if (!resolved) {
      reply.code(404).send({ ok: false, error: 'No pending approval with that ID' }); return;
    }
    try {
      deps.auditStore.insert(createAuditEvent({
        type: body.approved ? 'approval.granted' : 'approval.rejected',
        connector: pending?.request.connectorKey ?? '',
        user,
        source: 'cli',
        correlationId: pending?.request.requestId,
      }));
    } catch { /* audit best-effort for approvals */ }
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
    const connector = validation.connector!;
    const enumError = validateEnumArgs(body.args as Record<string, string>, connector.args ?? []);
    if (enumError) {
      reply.code(400).send({ ok: false, error: enumError }); return;
    }
    if (!deps.wsRelay.connected) {
      reply.code(503).send({ ok: false, error: 'Extension not connected' }); return;
    }
    const requiresApproval = connectorNeedsApproval(body.connector, connector);
    const approvalConfig = requiresApproval ? buildApprovalConfig() : undefined;
    const correlationId = randomUUID();
    const meta = deps.registry.getWithMeta(body.connector);
    const connectorHash = meta
      ? createHash('sha256').update(meta.yamlContent).digest('hex').slice(0, 16)
      : undefined;
    const startTime = Date.now();
    try {
      deps.auditStore.insert(createAuditEvent({
        type: 'command.start', connector: body.connector, user,
        args: body.args as Record<string, string>,
        domains: connector.domains, capabilities: [...connector.capabilities],
        correlationId, connectorHash,
      }));
    } catch {
      reply.code(500).send({ ok: false, error: 'Audit system unavailable \u2014 command blocked' }); return;
    }

    const runPipeline = async (requestId: string, argsOverride?: Record<string, string | number | boolean>) => {
      const runArgs = argsOverride ?? body.args;
      try {
        const resp = await deps.wsRelay.send(connector, runArgs, approvalConfig, undefined, requestId || undefined);
        const durationMs = Date.now() - startTime;
        deps.auditStore.insert(createAuditEvent({
          type: resp.ok ? 'command.success' : 'command.error',
          connector: body.connector, user,
          args: runArgs as Record<string, string>,
          domains: connector.domains, capabilities: [...connector.capabilities],
          rowCount: resp.data.length,
          columns: connector.columns?.map(c => c.name),
          durationMs, error: resp.error,
          correlationId, connectorHash, steps: resp.steps,
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
          args: runArgs as Record<string, string>, durationMs, error,
          correlationId, connectorHash,
        }));
        return { ok: false, data: [], error, durationMs, requestId, requiresApproval };
      }
    };

    // Fan-out: expand "all" on enum args into sequential runs
    const fanOut = expandFanOut(body.args as Record<string, string>, connector.args ?? []);

    if (fanOut.isFanOut && requiresApproval) {
      reply.code(400).send({
        ok: false,
        error: 'Fan-out (--region all) is not supported with approval-required connectors. Specify a single region.',
      });
      return;
    }

    if (fanOut.isFanOut) {
      const { fanOutArgName } = fanOut;
      const allData: Record<string, unknown>[] = [];
      const errors: string[] = [];
      for (const argSet of fanOut.argSets) {
        const result = await runPipeline('', argSet);
        if (result.ok) {
          for (const row of result.data as Record<string, unknown>[]) {
            (row as Record<string, unknown>)[fanOutArgName] = argSet[fanOutArgName];
            allData.push(row);
          }
        } else if (result.error) {
          errors.push(`${argSet[fanOutArgName]}: ${result.error}`);
        }
      }
      const columns = connector.columns?.map(c => c.name) ?? [];
      if (!columns.includes(fanOutArgName)) {
        columns.unshift(fanOutArgName);
      }
      const durationMs = Date.now() - startTime;
      const hasErrors = errors.length > 0;
      return {
        ok: !hasErrors || allData.length > 0,
        connector: body.connector,
        rowCount: allData.length,
        columns,
        data: allData,
        error: hasErrors ? errors.join('; ') : undefined,
        durationMs,
        requestId: '',
        requiresApproval: false,
      };
    }

    if (requiresApproval) {
      const requestId = randomUUID();
      sse.waitForConnection(requestId, SSE_CONNECT_TIMEOUT_MS)
        .then(() => runPipeline(requestId))
        .then(result => {
          sse.send(requestId, 'result', result);
          sse.remove(requestId);
        })
        .catch((err) => {
          const durationMs = Date.now() - startTime;
          deps.auditStore.insert(createAuditEvent({
            type: 'command.error', connector: body.connector, user,
            args: body.args as Record<string, string>, durationMs,
            error: err instanceof Error ? err.message : 'SSE timeout',
          }));
        });
      reply.code(202).send({
        ok: true, requestId, requiresApproval: true,
        connector: body.connector,
      });
    } else {
      const result = await runPipeline('');
      if (!result.ok) {
        reply.code(500).send(result); return;
      }
      return result;
    }
  });

  app.post('/api/config', async (req, reply) => {
    const body = req.body as { key?: string; value?: string };
    if (!body.key || body.value === undefined) {
      reply.code(400).send({ ok: false, error: 'Missing key or value' }); return;
    }
    const parts = body.key.split('.');
    if (parts.length !== 2) {
      reply.code(400).send({ ok: false, error: 'Key must be section.property' }); return;
    }

    const { readFileSync, writeFileSync, mkdirSync, existsSync } = await import('node:fs');
    const { dirname } = await import('node:path');
    const { parse: parseYaml, stringify: stringifyYaml } = await import('yaml');

    let configObj: Record<string, Record<string, unknown>> = {};
    if (existsSync(deps.configPath)) {
      configObj = (parseYaml(readFileSync(deps.configPath, 'utf-8')) as Record<string, Record<string, unknown>>) ?? {};
    }

    const [section, prop] = parts;
    const previousValue = JSON.stringify(configObj[section]?.[prop] ?? null);

    if (!configObj[section]) configObj[section] = {};
    let parsed: unknown = body.value;
    try { parsed = JSON.parse(body.value); } catch {
      if (body.value === 'true') parsed = true;
      else if (body.value === 'false') parsed = false;
      else if (!isNaN(Number(body.value)) && body.value !== '') parsed = Number(body.value);
    }
    configObj[section][prop] = parsed;

    // Validate the entire config against the schema before writing
    const { configSchema } = await import('./config.js');
    const validation = configSchema.safeParse(configObj);
    if (!validation.success) {
      const issue = validation.error.issues[0];
      reply.code(400).send({ ok: false, error: `Invalid config value: ${issue.path.join('.')} — ${issue.message}` });
      return;
    }

    mkdirSync(dirname(deps.configPath), { recursive: true });
    writeFileSync(deps.configPath, stringifyYaml(configObj), 'utf-8');

    // Hot-reload: update in-memory config so changes take effect immediately
    deps.config = validation.data;

    deps.auditStore.insert(createAuditEvent({
      type: 'config.changed', connector: '_system/config', user,
      source: body.key, previousValue, newValue: JSON.stringify(parsed),
    }));

    return { ok: true, key: body.key, value: body.value };
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
