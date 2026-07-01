import type { FastifyInstance } from 'fastify';
import type { DaemonClient } from '../daemon-client.js';

const APP_ROUTES: Record<string, string> = {
  'timetracking/report': '/apps/timetracking',
  'teams/room-availability': '/apps/rooms',
};

export function connectorRoutes(app: FastifyInstance, daemon: DaemonClient): void {
  app.get('/api/connectors', async () => {
    const data = await daemon.get<{ ok: boolean; connectors: Record<string, unknown>[] }>('/api/connectors');
    const enriched = data.connectors.map((c: Record<string, unknown>) => ({
      ...c,
      hasAppPage: (c.key as string) in APP_ROUTES,
      appRoute: APP_ROUTES[c.key as string] ?? null,
    }));
    return { ok: true, connectors: enriched };
  });

  app.get('/api/connectors/:site/:name', async (req) => {
    const { site, name } = req.params as { site: string; name: string };
    return daemon.get(`/api/connectors/${site}/${name}`);
  });
}
