import type { FastifyInstance } from 'fastify';
import type { AppStore } from '../store.js';

export function securityNewsCacheRoutes(app: FastifyInstance, store: AppStore): void {
  app.get('/api/security-news/cache', async () => {
    const cached = store.getCachedSecurityNews();
    if (!cached) return { ok: true, data: null, fetchedAt: null };
    return { ok: true, data: cached.data, fetchedAt: cached.fetchedAt };
  });

  app.post('/api/security-news/cache', async (req, reply) => {
    const { data } = req.body as { data: Record<string, unknown>[] };
    if (!Array.isArray(data)) {
      reply.code(400);
      return { ok: false, error: 'Missing data array' };
    }
    store.cacheSecurityNews(data);
    return { ok: true };
  });
}
