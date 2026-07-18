import type { FastifyInstance } from 'fastify';
import type { DaemonClient } from '@commandgarden/shared';

export function configRoutes(app: FastifyInstance, daemon: DaemonClient): void {
  app.get('/api/config', async () => {
    try {
      return await daemon.get('/api/config');
    } catch {
      return { ok: false, config: {} };
    }
  });

  app.post('/api/config', async (req) => {
    return daemon.post('/api/config', req.body);
  });
}
