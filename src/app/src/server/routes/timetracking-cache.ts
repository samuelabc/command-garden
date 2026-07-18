import type { FastifyInstance } from 'fastify';
import type { AppStore } from '../store.js';

export function timetrackingCacheRoutes(app: FastifyInstance, store: AppStore): void {
  app.get('/api/timetracking/cache', async (req) => {
    const { month } = req.query as { month?: string };
    if (!month) return { ok: true, data: null, fetchedAt: null };
    const cached = store.getCachedReport(month);
    if (!cached) return { ok: true, data: null, fetchedAt: null };
    return { ok: true, data: cached.data, fetchedAt: cached.fetchedAt };
  });

  app.post('/api/timetracking/cache', async (req, reply) => {
    const { month, data } = req.body as { month: string; data: Record<string, unknown>[] };
    if (!month || !Array.isArray(data)) {
      reply.code(400);
      return { ok: false, error: 'Missing month or data array' };
    }
    store.cacheReport(month, data);
    return { ok: true };
  });

  app.get('/api/timetracking/projects', async () => {
    const cached = store.getCachedProjects();
    if (!cached) return { ok: true, data: null, fetchedAt: null };
    return { ok: true, data: cached.data, fetchedAt: cached.fetchedAt };
  });

  app.post('/api/timetracking/projects', async (req, reply) => {
    const { data } = req.body as { data: Record<string, unknown>[] };
    if (!Array.isArray(data)) {
      reply.code(400);
      return { ok: false, error: 'Missing data array' };
    }
    store.cacheProjects(data);
    return { ok: true };
  });
}
