import type { FastifyInstance } from 'fastify';
import type { AppStore } from '../store.js';

export function rolesCacheRoutes(app: FastifyInstance, store: AppStore): void {
  app.get('/api/roles/cache', async () => {
    const cached = store.getCachedRoles();
    if (!cached) return { ok: true, userId: null, uisData: null, aliceData: null, fetchedAt: null };
    return { ok: true, userId: cached.userId, uisData: cached.uisData, aliceData: cached.aliceData, fetchedAt: cached.fetchedAt };
  });

  app.post('/api/roles/cache', async (req, reply) => {
    const { userId, uisData, aliceData } = req.body as {
      userId: string;
      uisData: Record<string, unknown> | null;
      aliceData: Record<string, unknown>[] | null;
    };
    if (!userId || typeof userId !== 'string') {
      reply.code(400);
      return { ok: false, error: 'Missing userId' };
    }
    store.cacheRoles(userId, uisData ?? null, aliceData ?? null);
    return { ok: true };
  });
}
