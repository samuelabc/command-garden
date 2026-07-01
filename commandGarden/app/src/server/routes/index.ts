import type { FastifyInstance } from 'fastify';
import type { DaemonClient } from '../daemon-client.js';
import type { AppStore } from '../store.js';
import { statusRoutes } from './status.js';
import { connectorRoutes } from './connectors.js';
import { runRoutes } from './run.js';
import { auditRoutes } from './audit.js';
import { configRoutes } from './config.js';
import { preferencesRoutes } from './preferences.js';

export function registerRoutes(app: FastifyInstance, daemon: DaemonClient, store: AppStore): void {
  statusRoutes(app, daemon);
  connectorRoutes(app, daemon);
  runRoutes(app, daemon);
  auditRoutes(app, daemon);
  configRoutes(app, daemon);
  preferencesRoutes(app, store);
}
