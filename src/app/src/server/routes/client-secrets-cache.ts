import type { FastifyInstance } from 'fastify';
import type { AppStore } from '../store.js';

export function clientSecretsCacheRoutes(app: FastifyInstance, store: AppStore): void {
  app.get('/api/client-secrets/cache', async () => {
    const cached = store.getCachedClientSecrets();
    if (!cached) return { ok: true, data: null, fetchedAt: null };
    return { ok: true, data: cached.data, fetchedAt: cached.fetchedAt };
  });

  app.post('/api/client-secrets/cache', async (req, reply) => {
    const { data } = (req.body ?? {}) as { data?: Record<string, unknown>[] };
    if (!Array.isArray(data)) {
      reply.code(400);
      return { ok: false, error: 'Missing data array' };
    }
    store.cacheClientSecrets(data);
    return { ok: true };
  });
}
