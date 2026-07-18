import type { FastifyInstance } from 'fastify';
import type { AppStore } from '../store.js';

export function trustedPeersCacheRoutes(app: FastifyInstance, store: AppStore): void {
  app.get('/api/trusted-peers/cache', async () => {
    const cached = store.getCachedTrustedPeers();
    if (!cached) return { ok: true, data: null, fetchedAt: null };
    return { ok: true, data: cached.data, fetchedAt: cached.fetchedAt };
  });

  app.post('/api/trusted-peers/cache', async (req, reply) => {
    const { data } = req.body as { data: Record<string, unknown>[] };
    if (!Array.isArray(data)) {
      reply.code(400);
      return { ok: false, error: 'Missing data array' };
    }
    store.cacheTrustedPeers(data);
    return { ok: true };
  });
}
