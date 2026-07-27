import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { registerRoutes } from './index.js';
import { DaemonClient, DaemonHttpError, HIGH_RISK_CAPABILITIES } from '@commandgarden/shared';
import { AppStore } from '../store.js';

function mockDaemon() {
  return {
    get: vi.fn(),
    post: vi.fn(),
    pipeRaw: vi.fn(),
  } as unknown as DaemonClient;
}

describe('routes', () => {
  let app: ReturnType<typeof Fastify>;
  let daemon: ReturnType<typeof mockDaemon>;
  let store: AppStore;

  beforeEach(async () => {
    app = Fastify();
    daemon = mockDaemon();
    store = await AppStore.create(':memory:');
    registerRoutes(app, daemon, store);
    await app.ready();
  });

  describe('GET /api/status', () => {
    it('proxies daemon status', async () => {
      (daemon.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true, extensionConnected: true, connectorCount: 2,
      });
      const resp = await app.inject({ method: 'GET', url: '/api/status' });
      expect(resp.statusCode).toBe(200);
      const body = JSON.parse(resp.payload);
      expect(body.ok).toBe(true);
      expect(body.extensionConnected).toBe(true);
    });
  });

  describe('GET /api/connectors', () => {
    it('proxies and enriches connector list', async () => {
      (daemon.get as ReturnType<typeof vi.fn>)
        .mockImplementation((path: string) => {
          if (path === '/api/connectors') {
            return Promise.resolve({
              ok: true,
              connectors: [
                { key: 'timetracking/report', description: 'test', access: 'read', domains: [], capabilities: [] },
              ],
            });
          }
          if (path === '/api/config') {
            return Promise.resolve({
              ok: true,
              config: { security: { highRiskCapabilities: [...HIGH_RISK_CAPABILITIES], approvedHighRisk: {}, autoApproveConnectors: [] } },
            });
          }
          return Promise.resolve({ ok: true });
        });
      const resp = await app.inject({ method: 'GET', url: '/api/connectors' });
      expect(resp.statusCode).toBe(200);
      const body = JSON.parse(resp.payload);
      expect(body.connectors).toHaveLength(1);
      expect(body.connectors[0].hasAppPage).toBe(true);
      expect(body.connectors[0].appRoute).toBe('/apps/timetracking');
    });

    it('enriches connectors with security flags from config', async () => {
      (daemon.get as ReturnType<typeof vi.fn>)
        .mockImplementation((path: string) => {
          if (path === '/api/connectors') {
            return Promise.resolve({
              ok: true,
              connectors: [
                { key: 'timetracking/report', description: 'test', access: 'read', domains: [], capabilities: ['navigate', 'js_evaluate'] },
                { key: 'safe/connector', description: 'safe', access: 'read', domains: [], capabilities: ['navigate'] },
              ],
            });
          }
          if (path === '/api/config') {
            return Promise.resolve({
              ok: true,
              config: {
                security: {
                  highRiskCapabilities: [...HIGH_RISK_CAPABILITIES],
                  approvedHighRisk: { 'timetracking/report': ['js_evaluate'] },
                  autoApproveConnectors: ['timetracking/report'],
                },
              },
            });
          }
          return Promise.resolve({ ok: true });
        });
      const resp = await app.inject({ method: 'GET', url: '/api/connectors' });
      const body = JSON.parse(resp.payload);
      expect(body.connectors[0].isHighRisk).toBe(true);
      expect(body.connectors[0].isApproved).toBe(true);
      expect(body.connectors[0].isAutoApproved).toBe(true);
      expect(body.connectors[1].isHighRisk).toBe(false);
      expect(body.connectors[1].isApproved).toBe(false);
      expect(body.connectors[1].isAutoApproved).toBe(false);
    });

    it('treats a partial approval record as unapproved', async () => {
      (daemon.get as ReturnType<typeof vi.fn>)
        .mockImplementation((path: string) => {
          if (path === '/api/connectors') {
            return Promise.resolve({
              ok: true,
              connectors: [
                { key: 'risky/two', description: 'two high-risk caps', access: 'read', domains: [], capabilities: ['js_evaluate', 'network_egress'] },
              ],
            });
          }
          if (path === '/api/config') {
            return Promise.resolve({
              ok: true,
              config: {
                security: {
                  highRiskCapabilities: [...HIGH_RISK_CAPABILITIES],
                  approvedHighRisk: { 'risky/two': ['js_evaluate'] },
                  autoApproveConnectors: [],
                },
              },
            });
          }
          return Promise.resolve({ ok: true });
        });
      const resp = await app.inject({ method: 'GET', url: '/api/connectors' });
      const body = JSON.parse(resp.payload);
      expect(body.connectors[0].isHighRisk).toBe(true);
      expect(body.connectors[0].isApproved).toBe(false);
      expect(body.connectors[0].requiredApprovals).toEqual(['js_evaluate', 'network_egress']);
    });
  });

  describe('POST /api/connectors/:site/:name/approve', () => {
    function mockApproveDaemon(opts: {
      capabilities?: string[];
      highRiskCapabilities?: string[];
      approvedHighRisk?: Record<string, string[]>;
      connectorFound?: boolean;
      lookupError?: Error;
    }) {
      (daemon.get as ReturnType<typeof vi.fn>).mockImplementation((path: string) => {
        if (path.startsWith('/api/connectors/')) {
          if (opts.lookupError) return Promise.reject(opts.lookupError);
          if (opts.connectorFound === false) {
            return Promise.reject(new DaemonHttpError('Connector "risky/two" not found', 404));
          }
          return Promise.resolve({ ok: true, connector: { capabilities: opts.capabilities ?? [] } });
        }
        if (path === '/api/config') {
          return Promise.resolve({
            ok: true,
            config: {
              security: {
                highRiskCapabilities: opts.highRiskCapabilities ?? [...HIGH_RISK_CAPABILITIES],
                approvedHighRisk: opts.approvedHighRisk ?? {},
                autoApproveConnectors: [],
              },
            },
          });
        }
        return Promise.resolve({ ok: true });
      });
      (daemon.post as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
    }

    it('approves every high-risk capability the connector declares', async () => {
      mockApproveDaemon({ capabilities: ['navigate', 'js_evaluate', 'network_egress'] });
      const resp = await app.inject({ method: 'POST', url: '/api/connectors/risky/two/approve' });
      expect(resp.statusCode).toBe(200);
      expect(JSON.parse(resp.payload)).toEqual({ ok: true, approved: ['js_evaluate', 'network_egress'] });
      expect(daemon.post).toHaveBeenCalledWith('/api/config', {
        key: 'security.approvedHighRisk',
        value: JSON.stringify({ 'risky/two': ['js_evaluate', 'network_egress'] }),
      });
    });

    it('preserves approvals for other connectors', async () => {
      mockApproveDaemon({
        capabilities: ['js_evaluate'],
        approvedHighRisk: { 'other/one': ['cdp_attach'] },
      });
      await app.inject({ method: 'POST', url: '/api/connectors/risky/two/approve' });
      expect(daemon.post).toHaveBeenCalledWith('/api/config', {
        key: 'security.approvedHighRisk',
        value: JSON.stringify({ 'other/one': ['cdp_attach'], 'risky/two': ['js_evaluate'] }),
      });
    });

    it('honours a custom highRiskCapabilities list', async () => {
      mockApproveDaemon({
        capabilities: ['navigate', 'js_evaluate'],
        highRiskCapabilities: ['navigate'],
      });
      const resp = await app.inject({ method: 'POST', url: '/api/connectors/risky/two/approve' });
      expect(JSON.parse(resp.payload).approved).toEqual(['navigate']);
    });

    it('overwrites a stale record rather than merging', async () => {
      mockApproveDaemon({
        capabilities: ['js_evaluate'],
        approvedHighRisk: { 'risky/two': ['cdp_attach', 'js_evaluate'] },
      });
      await app.inject({ method: 'POST', url: '/api/connectors/risky/two/approve' });
      expect(daemon.post).toHaveBeenCalledWith('/api/config', {
        key: 'security.approvedHighRisk',
        value: JSON.stringify({ 'risky/two': ['js_evaluate'] }),
      });
    });

    it('rejects a connector that declares no high-risk capabilities', async () => {
      mockApproveDaemon({ capabilities: ['navigate', 'dom_read'] });
      const resp = await app.inject({ method: 'POST', url: '/api/connectors/safe/one/approve' });
      expect(resp.statusCode).toBe(400);
      expect(JSON.parse(resp.payload).ok).toBe(false);
      expect(daemon.post).not.toHaveBeenCalled();
    });

    it('404s for an unknown connector', async () => {
      mockApproveDaemon({ connectorFound: false });
      const resp = await app.inject({ method: 'POST', url: '/api/connectors/no/such/approve' });
      expect(resp.statusCode).toBe(404);
      expect(daemon.post).not.toHaveBeenCalled();
    });

    // A daemon that is down must not be reported as a missing connector: the
    // user would go looking for a connector that is in fact fine.
    it('502s when the daemon is unreachable', async () => {
      mockApproveDaemon({ lookupError: new Error('Cannot connect to daemon. Is it running? Try: cg daemon start') });
      const resp = await app.inject({ method: 'POST', url: '/api/connectors/risky/two/approve' });
      expect(resp.statusCode).toBe(502);
      const body = JSON.parse(resp.payload);
      expect(body.ok).toBe(false);
      expect(body.error).toContain('Cannot connect to daemon');
      expect(daemon.post).not.toHaveBeenCalled();
    });

    it('502s when the daemon fails with a non-404 status', async () => {
      mockApproveDaemon({ lookupError: new DaemonHttpError('Internal error', 500) });
      const resp = await app.inject({ method: 'POST', url: '/api/connectors/risky/two/approve' });
      expect(resp.statusCode).toBe(502);
      expect(JSON.parse(resp.payload).error).toContain('Internal error');
      expect(daemon.post).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/preferences', () => {
    it('returns empty preferences', async () => {
      const resp = await app.inject({ method: 'GET', url: '/api/preferences' });
      expect(resp.statusCode).toBe(200);
      expect(JSON.parse(resp.payload)).toEqual({ ok: true, preferences: {} });
    });

    it('sets and gets a preference via PUT', async () => {
      await app.inject({
        method: 'PUT', url: '/api/preferences',
        payload: { key: 'theme', value: 'dark' },
      });
      const resp = await app.inject({ method: 'GET', url: '/api/preferences' });
      expect(JSON.parse(resp.payload).preferences).toEqual({ theme: 'dark' });
    });
  });

  describe('POST /api/run', () => {
    it('proxies run to daemon', async () => {
      (daemon.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true, data: [{ a: 1 }], rowCount: 1,
      });
      const resp = await app.inject({
        method: 'POST', url: '/api/run',
        payload: { connector: 'test/cmd', args: {} },
      });
      expect(resp.statusCode).toBe(200);
      expect(JSON.parse(resp.payload).ok).toBe(true);
    });

    it('returns 502 with error message when daemon throws', async () => {
      (daemon.post as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Extension not connected'));
      const resp = await app.inject({
        method: 'POST', url: '/api/run',
        payload: { connector: 'test/cmd', args: {} },
      });
      expect(resp.statusCode).toBe(502);
      const body = JSON.parse(resp.payload);
      expect(body.ok).toBe(false);
      expect(body.error).toBe('Extension not connected');
    });
  });

  describe('AI news cache', () => {
    it('GET returns null when empty', async () => {
      const resp = await app.inject({ method: 'GET', url: '/api/ai-news/cache' });
      expect(resp.statusCode).toBe(200);
      expect(JSON.parse(resp.payload)).toEqual({ ok: true, data: null, fetchedAt: null });
    });

    it('POST stores and GET retrieves data', async () => {
      const data = [{ title: 'Post 1', source: 'simon' }, { title: 'Post 2', source: 'every' }];
      const postResp = await app.inject({
        method: 'POST', url: '/api/ai-news/cache',
        payload: { data },
      });
      expect(postResp.statusCode).toBe(200);
      expect(JSON.parse(postResp.payload).ok).toBe(true);

      const getResp = await app.inject({ method: 'GET', url: '/api/ai-news/cache' });
      const body = JSON.parse(getResp.payload);
      expect(body.ok).toBe(true);
      expect(body.data).toEqual(data);
      expect(body.fetchedAt).toBeDefined();
    });

    it('POST returns 400 without data array', async () => {
      const resp = await app.inject({
        method: 'POST', url: '/api/ai-news/cache',
        payload: {},
      });
      expect(resp.statusCode).toBe(400);
      expect(JSON.parse(resp.payload).ok).toBe(false);
    });
  });

  describe('Roles cache', () => {
    it('GET returns null fields when empty', async () => {
      const resp = await app.inject({ method: 'GET', url: '/api/roles/cache' });
      expect(resp.statusCode).toBe(200);
      expect(JSON.parse(resp.payload)).toEqual({ ok: true, userId: null, uisData: null, aliceData: null, fetchedAt: null });
    });

    it('POST stores and GET retrieves roles data', async () => {
      const payload = {
        userId: 'SATHIEN',
        uisData: { uid: 'SATHIEN', givenName: 'Sam', department: 'IT' },
        aliceData: [{ roleId: 'R1', roleName: 'Admin' }],
      };
      const postResp = await app.inject({
        method: 'POST', url: '/api/roles/cache',
        payload,
      });
      expect(postResp.statusCode).toBe(200);
      expect(JSON.parse(postResp.payload).ok).toBe(true);

      const getResp = await app.inject({ method: 'GET', url: '/api/roles/cache' });
      const body = JSON.parse(getResp.payload);
      expect(body.ok).toBe(true);
      expect(body.userId).toBe('SATHIEN');
      expect(body.uisData).toEqual(payload.uisData);
      expect(body.aliceData).toEqual(payload.aliceData);
      expect(body.fetchedAt).toBeDefined();
    });

    it('POST stores with null uisData and aliceData', async () => {
      const postResp = await app.inject({
        method: 'POST', url: '/api/roles/cache',
        payload: { userId: 'TESTUSER', uisData: null, aliceData: null },
      });
      expect(postResp.statusCode).toBe(200);

      const getResp = await app.inject({ method: 'GET', url: '/api/roles/cache' });
      const body = JSON.parse(getResp.payload);
      expect(body.userId).toBe('TESTUSER');
      expect(body.uisData).toBeNull();
      expect(body.aliceData).toBeNull();
    });

    it('POST returns 400 without userId', async () => {
      const resp = await app.inject({
        method: 'POST', url: '/api/roles/cache',
        payload: { uisData: null, aliceData: null },
      });
      expect(resp.statusCode).toBe(400);
      expect(JSON.parse(resp.payload).ok).toBe(false);
    });
  });
});
