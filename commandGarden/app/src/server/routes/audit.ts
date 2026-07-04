import type { FastifyInstance } from 'fastify';
import type { DaemonClient } from '@commandgarden/shared';

export function auditRoutes(app: FastifyInstance, daemon: DaemonClient): void {
  app.get('/api/audit', async (req) => {
    const query = req.query as Record<string, string>;
    const params = new URLSearchParams();
    if (query.since) params.set('since', query.since);
    if (query.connector) params.set('connector', query.connector);
    if (query.type) params.set('type', query.type);
    if (query.limit) params.set('limit', query.limit);
    const qs = params.toString();
    return daemon.get(`/api/audit${qs ? `?${qs}` : ''}`);
  });

  app.get('/api/audit/:id', async (req) => {
    const { id } = req.params as { id: string };
    return daemon.get(`/api/audit/${id}`);
  });
}
