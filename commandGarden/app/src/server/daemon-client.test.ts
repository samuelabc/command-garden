import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DaemonClient } from './daemon-client.js';

describe('DaemonClient', () => {
  let client: DaemonClient;
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
    client = new DaemonClient('http://127.0.0.1:9091', 'test-token');
    mockFetch.mockReset();
  });

  it('sends auth headers on GET', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ ok: true, data: 'test' }),
    });
    await client.get('/api/status');
    expect(mockFetch).toHaveBeenCalledWith(
      'http://127.0.0.1:9091/api/status',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token',
          'X-CommandGarden': '1',
        }),
      }),
    );
  });

  it('sends body on POST', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ ok: true }),
    });
    await client.post('/api/run', { connector: 'test/cmd', args: {} });
    const call = mockFetch.mock.calls[0];
    expect(call[1].method).toBe('POST');
    expect(JSON.parse(call[1].body)).toEqual({ connector: 'test/cmd', args: {} });
  });

  it('throws on non-ok response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ error: 'Unauthorized' }),
    });
    await expect(client.get('/api/status')).rejects.toThrow('Unauthorized');
  });

  it('throws on network error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('fetch failed'));
    await expect(client.get('/api/status')).rejects.toThrow('Cannot connect to daemon');
  });
});
