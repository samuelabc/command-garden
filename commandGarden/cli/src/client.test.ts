// src/client.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { DaemonClient, readToken } from './client.js';

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
}));

describe('readToken', () => {
  it('reads and trims token from file', () => {
    vi.mocked(readFileSync).mockReturnValue('  abc123  \n');
    expect(readToken('/fake/path')).toBe('abc123');
  });

  it('returns null if file missing', () => {
    vi.mocked(readFileSync).mockImplementation(() => { throw new Error('ENOENT'); });
    expect(readToken('/fake/path')).toBeNull();
  });
});

describe('DaemonClient', () => {
  let client: DaemonClient;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
    client = new DaemonClient('http://127.0.0.1:9091', 'test-token');
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('get() sends authenticated GET request', async () => {
    mockFetch.mockResolvedValue({
      ok: true, json: () => Promise.resolve({ ok: true, connectors: [] }),
    });
    const result = await client.get('/api/connectors');
    expect(mockFetch).toHaveBeenCalledWith(
      'http://127.0.0.1:9091/api/connectors',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          'Authorization': 'Bearer test-token',
          'X-CommandGarden': '1',
        }),
      }),
    );
    expect(result.ok).toBe(true);
  });

  it('post() sends authenticated POST with JSON body', async () => {
    mockFetch.mockResolvedValue({
      ok: true, json: () => Promise.resolve({ ok: true, data: [] }),
    });
    await client.post('/api/run', { connector: 'test/cmd', args: {} });
    expect(mockFetch).toHaveBeenCalledWith(
      'http://127.0.0.1:9091/api/run',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ connector: 'test/cmd', args: {} }),
      }),
    );
  });

  it('get() throws on HTTP error', async () => {
    mockFetch.mockResolvedValue({
      ok: false, status: 503,
      json: () => Promise.resolve({ ok: false, error: 'Extension not connected' }),
    });
    await expect(client.get('/api/status')).rejects.toThrow('Extension not connected');
  });

  it('get() throws on network error', async () => {
    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(client.get('/api/status')).rejects.toThrow(
      'Cannot connect to daemon',
    );
  });

  it('status() calls /api/status without auth', async () => {
    mockFetch.mockResolvedValue({
      ok: true, json: () => Promise.resolve({ ok: true, extensionConnected: false }),
    });
    const result = await client.status();
    expect(mockFetch).toHaveBeenCalledWith(
      'http://127.0.0.1:9091/api/status',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(result.ok).toBe(true);
  });

  it('status() throws on network error', async () => {
    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(client.status()).rejects.toThrow('Cannot connect to daemon');
  });

  it('status() throws on HTTP error', async () => {
    mockFetch.mockResolvedValue({
      ok: false, status: 500,
      json: () => Promise.resolve({ error: 'Internal error' }),
    });
    await expect(client.status()).rejects.toThrow('Internal error');
  });
});
