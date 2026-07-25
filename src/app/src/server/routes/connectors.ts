import type { FastifyInstance } from 'fastify';
import type { DaemonClient } from '@commandgarden/shared';
import { HIGH_RISK_CAPABILITIES } from '@commandgarden/shared';

const APP_ROUTES: Record<string, string> = {
  'timetracking/report': '/apps/timetracking',
  'timetracking/projects': '/apps/timetracking',
  'teams/room-availability': '/apps/rooms',
  'teams/rooms-availability': '/apps/rooms',
  'saba/pending-training': '/apps/saba',
  'tokenmaster/clients-list': '/apps/trusted-peer-expiry',
  'tokenmaster/client-trustedby': '/apps/trusted-peer-expiry',
  'alice/role-list': '/apps/roles',
  'uis/mic-user-information': '/apps/roles',
  'ado/git-commits': '/apps/journal',
  'jira/my-tickets': '/apps/journal',
  'outlook/my-meetings': '/apps/journal',
  'simonwillison/blog': '/apps/ai-news',
  'every/newsletter': '/apps/ai-news',
  'mtslive/archive': '/apps/ai-news',
  'socket/security-news': '/apps/security-news',
  'wiz/blog-security': '/apps/security-news',
  'tldrsec/newsletter': '/apps/security-news',
  'trailofbits/blog': '/apps/security-news',
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
    const approvedHighRisk = (security.approvedHighRisk && typeof security.approvedHighRisk === 'object' && !Array.isArray(security.approvedHighRisk))
      ? security.approvedHighRisk as Record<string, string[]>
      : {};
    const autoApproveConnectors = new Set((security.autoApproveConnectors as string[] | undefined) ?? []);

    const enriched = connectorData.connectors.map((c: Record<string, unknown>) => {
      const key = c.key as string;
      const capabilities = (c.capabilities as string[]) ?? [];
      return {
        ...c,
        hasAppPage: key in APP_ROUTES,
        appRoute: APP_ROUTES[key] ?? null,
        isHighRisk: capabilities.some(cap => highRiskCaps.has(cap)),
        isApproved: key in approvedHighRisk,
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
