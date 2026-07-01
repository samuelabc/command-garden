// src/main.ts
import { join } from 'node:path';
import { homedir, userInfo } from 'node:os';
import { createAuditEvent } from '@commandgarden/shared';
import { loadConfig, expandHome } from './config.js';
import { generateSessionToken, writeSessionToken } from './auth.js';
import { AuditStore } from './audit-store.js';
import { ConnectorRegistry } from './registry.js';
import { WsRelay } from './ws-relay.js';
import { createServer } from './server.js';

async function main() {
  const cgHome = join(homedir(), '.commandgarden');
  const config = loadConfig();

  // Auth token
  const sessionToken = generateSessionToken();
  const tokenPath = join(cgHome, 'session-token');
  writeSessionToken(sessionToken, tokenPath);
  console.log(`Session token written to ${tokenPath}`);

  // Audit store
  const dbPath = expandHome(config.audit.dbPath);
  const auditStore = new AuditStore(dbPath);
  const pruned = auditStore.prune(config.audit.retentionDays);
  if (pruned > 0) {
    console.log(`Pruned ${pruned} old audit events`);
    auditStore.insert(createAuditEvent({
      type: 'config.changed', connector: '_system/prune', user: userInfo().username,
      source: 'audit.prune',
      previousValue: String(pruned), newValue: '0',
      args: { retentionDays: String(config.audit.retentionDays) },
    }));
  }

  // Connector registry
  const connectorPaths = config.connectors.paths.map(expandHome);
  const registry = new ConnectorRegistry(connectorPaths);
  const { loaded, errors } = registry.load();
  console.log(`Loaded ${loaded} connectors`);
  if (errors.length > 0) console.warn('Connector errors:', errors);

  // WebSocket relay
  const wsRelay = new WsRelay();

  // Server
  const app = await createServer({ config, sessionToken, registry, auditStore, wsRelay });
  const address = await app.listen({ port: config.daemon.port, host: config.daemon.host });
  console.log(`Daemon listening on ${address}`);

  // Graceful shutdown
  const shutdown = async () => {
    console.log('Shutting down...');
    wsRelay.detach();
    await app.close();
    auditStore.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => { console.error('Failed to start daemon:', err); process.exit(1); });
