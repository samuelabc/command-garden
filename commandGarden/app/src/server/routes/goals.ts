import type { FastifyInstance } from 'fastify';
import type { AppStore } from '../store.js';

export function goalsRoutes(app: FastifyInstance, store: AppStore): void {
  app.get('/api/goals', async (req) => {
    const { month } = req.query as { month?: string };
    if (!month) return { ok: true, goals: [] };
    return { ok: true, goals: store.getGoalsByMonth(month) };
  });

  app.post('/api/goals', async (req, reply) => {
    const { month, projectId, activity, targetDays } = req.body as {
      month: string;
      projectId: string;
      activity: string;
      targetDays: number;
    };
    if (!month || !projectId || !activity || typeof targetDays !== 'number' || targetDays < 0.5 || targetDays > 31) {
      reply.code(400);
      return { ok: false, error: 'Invalid month, projectId, activity, or targetDays (0.5–31)' };
    }
    const goal = store.upsertGoal(month, projectId, activity, targetDays);
    return { ok: true, goal };
  });

  app.delete('/api/goals/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const numId = parseInt(id, 10);
    if (isNaN(numId)) {
      reply.code(400);
      return { ok: false, error: 'Invalid goal ID' };
    }
    const deleted = store.deleteGoal(numId);
    if (!deleted) {
      reply.code(404);
      return { ok: false, error: 'Goal not found' };
    }
    return { ok: true };
  });
}
