import type { FastifyInstance } from 'fastify';
import type { AppStore } from '../store.js';

export function roomAvailabilityCacheRoutes(app: FastifyInstance, store: AppStore): void {
  app.get('/api/room-availability/cache', async (req) => {
    const { date } = req.query as { date?: string };
    if (!date) return { ok: true, data: null, fetchedAt: null };
    const cached = store.getCachedRoomAvailability(date);
    if (!cached) return { ok: true, data: null, fetchedAt: null };
    return { ok: true, data: cached.data, fetchedAt: cached.fetchedAt };
  });

  app.post('/api/room-availability/cache', async (req, reply) => {
    const { date, data } = req.body as { date: string; data: Record<string, unknown>[] };
    if (!date || !Array.isArray(data)) {
      reply.code(400);
      return { ok: false, error: 'Missing date or data array' };
    }
    store.cacheRoomAvailability(date, data);
    return { ok: true };
  });
}
