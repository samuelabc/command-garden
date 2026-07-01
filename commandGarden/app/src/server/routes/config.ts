import type { FastifyInstance } from 'fastify';
import type { DaemonClient } from '../daemon-client.js';

export function configRoutes(app: FastifyInstance, daemon: DaemonClient): void {
  app.get('/api/config', async () => {
    return daemon.get('/api/config');
  });

  app.post('/api/config', async (req) => {
    return daemon.post('/api/config', req.body);
  });
}
