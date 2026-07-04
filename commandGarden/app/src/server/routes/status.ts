import type { FastifyInstance } from 'fastify';
import type { DaemonClient } from '@commandgarden/shared';

export function statusRoutes(app: FastifyInstance, daemon: DaemonClient): void {
  app.get('/api/status', async (req, reply) => {
    try {
      const data = await daemon.get('/api/status');
      return data;
    } catch (err) {
      reply.code(503).send({ ok: false, error: err instanceof Error ? err.message : 'Daemon unreachable' });
    }
  });
}
