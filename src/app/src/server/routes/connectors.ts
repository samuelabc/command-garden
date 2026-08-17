import type { FastifyInstance } from 'fastify';
import type { DaemonClient } from '@commandgarden/shared';
import { HIGH_RISK_CAPABILITIES, DaemonHttpError, requiredApprovals, hasAllApprovals } from '@commandgarden/shared';

const APP_ROUTES: Record<string, string> = {
  'timetracking/report': '/apps/timetracking',
  'timetracking/projects': '/apps/timetracking',
  'teams/room-availability': '/apps/rooms',
  'teams/rooms-availability': '/apps/rooms',
  'saba/pending-training': '/apps/saba',
  'tokenmaster/clients-list': '/apps/trusted-peer-expiry',
  'tokenmaster/client-trustedby': '/apps/trusted-peer-expiry',
  'tokenmaster/client-details': '/apps/client-secret-rotation',
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
      const required = requiredApprovals(capabilities, [...highRiskCaps]);
      return {
        ...c,
        hasAppPage: key in APP_ROUTES,
        appRoute: APP_ROUTES[key] ?? null,
        isHighRisk: required.length > 0,
        // Only meaningful for high-risk connectors: the badge means "every
        // high-risk capability this connector declares is covered".  A partial
        // record (connector gained a capability after approval) reads as
        // unapproved so the user re-approves the full set.
        isApproved: required.length > 0 && hasAllApprovals(required, approvedHighRisk[key] ?? []),
        requiredApprovals: required,
        isAutoApproved: autoApproveConnectors.has(key),
      };
    });
    return { ok: true, connectors: enriched };
  });

  app.get('/api/connectors/:site/:name', async (req) => {
    const { site, name } = req.params as { site: string; name: string };
    return daemon.get(`/api/connectors/${site}/${name}`);
  });

  // Approve a connector for exactly the high-risk capabilities it declares.
  // This lives server-side so the browser never decides which capabilities to
  // grant: it has no access to security.highRiskCapabilities and previously
  // hardcoded the list, producing partial approvals the daemon then rejected.
  app.post('/api/connectors/:site/:name/approve', async (req, reply) => {
    const { site, name } = req.params as { site: string; name: string };
    const key = `${site}/${name}`;

    // DaemonClient throws on any non-2xx, so an unknown connector arrives as a
    // rejection rather than an ok:false body. Only a genuine 404 means "no such
    // connector"; anything else is the daemon failing and must not be reported
    // as a missing connector.
    let capabilities: string[] | undefined;
    try {
      const detail = await daemon.get<{ ok: boolean; connector?: { capabilities?: string[] } }>(
        `/api/connectors/${site}/${name}`,
      );
      capabilities = detail.connector?.capabilities;
    } catch (err) {
      if (err instanceof DaemonHttpError && err.status === 404) {
        reply.code(404);
        return { ok: false, error: `Connector "${key}" not found` };
      }
      reply.code(502);
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
    if (!capabilities) {
      reply.code(404);
      return { ok: false, error: `Connector "${key}" not found` };
    }

    const configData = await daemon.get<{ ok: boolean; config: Record<string, Record<string, unknown>> }>('/api/config');
    const security = (configData.config?.security ?? {}) as Record<string, unknown>;
    const highRiskCaps = (security.highRiskCapabilities as string[] | undefined) ?? [...HIGH_RISK_CAPABILITIES];
    const approvedHighRisk = (security.approvedHighRisk && typeof security.approvedHighRisk === 'object' && !Array.isArray(security.approvedHighRisk))
      ? { ...(security.approvedHighRisk as Record<string, string[]>) }
      : {};

    const required = requiredApprovals(capabilities, highRiskCaps);
    if (required.length === 0) {
      reply.code(400);
      return { ok: false, error: `Connector "${key}" declares no high-risk capabilities; nothing to approve` };
    }

    // Overwrite rather than merge: an approval grants exactly what the
    // connector declares today, so capabilities it has since dropped do not
    // linger in the record.
    approvedHighRisk[key] = required;
    await daemon.post('/api/config', {
      key: 'security.approvedHighRisk',
      value: JSON.stringify(approvedHighRisk),
    });
    return { ok: true, approved: required };
  });
}
