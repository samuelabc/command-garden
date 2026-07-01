import type { FastifyInstance } from 'fastify';
import type { DaemonClient } from '../daemon-client.js';
import { HIGH_RISK_CAPABILITIES } from '@commandgarden/shared';

const APP_ROUTES: Record<string, string> = {
  'timetracking/report': '/apps/timetracking',
  'teams/room-availability': '/apps/rooms',
};

export function connectorRoutes(app: FastifyInstance, daemon: DaemonClient): void {
  app.get('/api/connectors', async () => {
    const [connectorData, configData] = await Promise.all([
      daemon.get<{ ok: boolean; connectors: Record<string, unknown>[] }>('/api/connectors'),
      daemon.get<{ ok: boolean; config: Record<string, Record<string, unknown>> }>('/api/config')
        .catch(() => ({ ok: false, config: {} }) as { ok: boolean; config: Record<string, Record<string, unknown>> }),
    ]);

    const security = (configData.config?.security ?? {}) as Record<string, unknown>;
    const highRiskCaps = new Set((security.highRiskCapabilities as string[] | undefined) ?? [...HIGH_RISK_CAPABILITIES]);
    const approvedHighRisk = new Set((security.approvedHighRisk as string[] | undefined) ?? []);
    const autoApproveConnectors = new Set((security.autoApproveConnectors as string[] | undefined) ?? []);

    const enriched = connectorData.connectors.map((c: Record<string, unknown>) => {
      const key = c.key as string;
      const capabilities = (c.capabilities as string[]) ?? [];
      return {
        ...c,
        hasAppPage: key in APP_ROUTES,
        appRoute: APP_ROUTES[key] ?? null,
        isHighRisk: capabilities.some(cap => highRiskCaps.has(cap)),
        isApproved: approvedHighRisk.has(key),
        isAutoApproved: autoApproveConnectors.has(key),
      };
    });
    return { ok: true, connectors: enriched };
  });

  app.get('/api/connectors/:site/:name', async (req) => {
    const { site, name } = req.params as { site: string; name: string };
    return daemon.get(`/api/connectors/${site}/${name}`);
  });
}
