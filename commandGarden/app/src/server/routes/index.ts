import type { FastifyInstance } from 'fastify';
import type { DaemonClient } from '@commandgarden/shared';
import type { AppStore } from '../store.js';
import { statusRoutes } from './status.js';
import { connectorRoutes } from './connectors.js';
import { runRoutes } from './run.js';
import { auditRoutes } from './audit.js';
import { configRoutes } from './config.js';
import { preferencesRoutes } from './preferences.js';
import { goalsRoutes } from './goals.js';
import { timetrackingCacheRoutes } from './timetracking-cache.js';
import { journalRoutes } from './journal.js';

export function registerRoutes(app: FastifyInstance, daemon: DaemonClient, store: AppStore): void {
  statusRoutes(app, daemon);
  connectorRoutes(app, daemon);
  runRoutes(app, daemon);
  auditRoutes(app, daemon);
  configRoutes(app, daemon);
  preferencesRoutes(app, store);
  goalsRoutes(app, store);
  timetrackingCacheRoutes(app, store);
  journalRoutes(app, daemon);
}
