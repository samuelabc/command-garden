import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { registerRoutes } from './index.js';
import { DaemonClient } from '../daemon-client.js';
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
    store = new AppStore(':memory:');
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
      (daemon.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        connectors: [
          { key: 'timetracking/report', description: 'test', access: 'read', domains: [], capabilities: [] },
        ],
      });
      const resp = await app.inject({ method: 'GET', url: '/api/connectors' });
      expect(resp.statusCode).toBe(200);
      const body = JSON.parse(resp.payload);
      expect(body.connectors).toHaveLength(1);
      expect(body.connectors[0].hasAppPage).toBe(true);
      expect(body.connectors[0].appRoute).toBe('/apps/timetracking');
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
  });
});
