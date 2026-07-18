import type { FastifyInstance } from 'fastify';
import type { AppStore } from '../store.js';

export function preferencesRoutes(app: FastifyInstance, store: AppStore): void {
  app.get('/api/preferences', async () => {
    return { ok: true, preferences: store.getAllPreferences() };
  });

  app.put('/api/preferences', async (req) => {
    const { key, value } = req.body as { key: string; value: string };
    if (!key || value === undefined) {
      return { ok: false, error: 'Missing key or value' };
    }
    store.setPreference(key, value);
    return { ok: true };
  });

  app.get('/api/views', async (req) => {
    const { app: appName } = req.query as { app: string };
    if (!appName) return { ok: true, views: [] };
    return { ok: true, views: store.listViews(appName) };
  });

  app.post('/api/views', async (req) => {
    const { app: appName, name, config } = req.body as { app: string; name: string; config: string };
    if (!appName || !name || !config) {
      return { ok: false, error: 'Missing app, name, or config' };
    }
    const view = store.createView(appName, name, config);
    return { ok: true, view };
  });

  app.delete('/api/views/:id', async (req) => {
    const { id } = req.params as { id: string };
    const deleted = store.deleteView(id);
    return { ok: deleted, error: deleted ? undefined : 'View not found' };
  });
}
