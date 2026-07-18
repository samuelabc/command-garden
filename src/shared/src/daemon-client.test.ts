import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { DaemonClient, readToken } from './daemon-client.js';

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

  it('pipeRaw() returns raw response with auth headers', async () => {
    const mockResp = { ok: true, body: 'stream' };
    mockFetch.mockResolvedValue(mockResp);
    const result = await client.pipeRaw('/api/run/events/abc');
    expect(mockFetch).toHaveBeenCalledWith(
      'http://127.0.0.1:9091/api/run/events/abc',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token',
          'X-CommandGarden': '1',
          Accept: 'text/event-stream',
        }),
      }),
    );
    expect(result).toBe(mockResp);
  });

  it('pipeRaw() throws on non-ok response', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 502 });
    await expect(client.pipeRaw('/api/run/events/abc')).rejects.toThrow('SSE connection failed');
  });

  it('connectSSE() parses SSE stream and calls onEvent', async () => {
    const ssePayload = [
      'event: approval\n',
      'data: {"id":"a1"}\n',
      '\n',
      'event: result\n',
      'data: {"ok":true}\n',
      '\n',
    ].join('');
    const encoder = new TextEncoder();
    let readerDone = false;
    const mockBody = {
      getReader: () => ({
        read: () => {
          if (readerDone) return Promise.resolve({ done: true, value: undefined });
          readerDone = true;
          return Promise.resolve({ done: false, value: encoder.encode(ssePayload) });
        },
      }),
    };
    mockFetch.mockResolvedValue({ ok: true, body: mockBody });
    const events: { event: string; data: unknown }[] = [];
    await client.connectSSE('/api/run/events/abc', (event, data) => {
      events.push({ event, data });
    });
    expect(events).toEqual([
      { event: 'approval', data: { id: 'a1' } },
      { event: 'result', data: { ok: true } },
    ]);
  });

  it('connectSSE() throws on non-ok response', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 502, body: null });
    await expect(
      client.connectSSE('/api/run/events/abc', () => {}),
    ).rejects.toThrow('SSE connection failed');
  });

  it('connectSSE() swallows error when signal is aborted', async () => {
    const controller = new AbortController();
    const mockBody = {
      getReader: () => ({
        read: () => {
          controller.abort();
          return Promise.reject(new DOMException('Aborted', 'AbortError'));
        },
      }),
    };
    mockFetch.mockResolvedValue({ ok: true, body: mockBody });
    await expect(
      client.connectSSE('/api/run/events/abc', () => {}, controller.signal),
    ).resolves.toBeUndefined();
  });
});
