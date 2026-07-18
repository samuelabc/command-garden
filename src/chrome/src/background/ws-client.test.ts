// src/background/ws-client.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WsClient } from './ws-client.js';
import { EventEmitter } from 'node:events';

// Flush microtasks so async fetch → doConnect → MockWebSocket open all resolve
const flush = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };

// Mock fetch globally — probe succeeds by default
vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true })));

class MockWebSocket extends EventEmitter {
  static OPEN = 1;
  readyState = 1;
  sent: string[] = [];
  url: string;
  constructor(url: string) {
    super();
    this.url = url;
    queueMicrotask(() => this.emit('open'));
  }
  send(data: string) { this.sent.push(data); }
  close() { this.readyState = 3; this.emit('close'); }
  addEventListener(event: string, cb: (...args: unknown[]) => void) { this.on(event, cb); }
  removeEventListener(event: string, cb: (...args: unknown[]) => void) { this.off(event, cb); }
}

class SlowMockWebSocket extends EventEmitter {
  static OPEN = 1;
  readyState = 0;
  sent: string[] = [];
  url: string;
  constructor(url: string) {
    super();
    this.url = url;
  }
  send(data: string) { this.sent.push(data); }
  close() { this.readyState = 3; this.emit('close'); }
  addEventListener(event: string, cb: (...args: unknown[]) => void) { this.on(event, cb); }
  removeEventListener(event: string, cb: (...args: unknown[]) => void) { this.off(event, cb); }
  simulateOpen() { this.readyState = 1; this.emit('open'); }
}

describe('WsClient', () => {
  let client: WsClient;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(globalThis.fetch).mockClear();
    vi.mocked(globalThis.fetch).mockResolvedValue({ ok: true } as Response);
    client = new WsClient('ws://127.0.0.1:9091/ws/extension', MockWebSocket as any);
  });

  afterEach(() => {
    client.disconnect();
    vi.useRealTimers();
  });

  it('connects to daemon URL', async () => {
    client.connect();
    await flush();
    expect(client.isConnected()).toBe(true);
  });

  it('sends ExtensionResponse', async () => {
    client.connect();
    await flush();
    client.sendResponse({ id: '1', ok: true, data: [] });
    const ws = client.getSocket() as unknown as MockWebSocket;
    expect(ws.sent).toHaveLength(1);
    expect(JSON.parse(ws.sent[0]).id).toBe('1');
  });

  it('invokes onRequest handler for incoming messages', async () => {
    const handler = vi.fn();
    client.onRequest(handler);
    client.connect();
    await flush();
    const ws = client.getSocket() as unknown as MockWebSocket;
    ws.emit('message', { data: JSON.stringify({ id: '1', connector: {}, args: {} }) });
    expect(handler).toHaveBeenCalled();
  });

  it('handles disconnect', async () => {
    client.connect();
    await flush();
    client.disconnect();
    expect(client.isConnected()).toBe(false);
  });

  it('reconnects after unexpected close', async () => {
    client.connect();
    await flush();
    const ws1 = client.getSocket() as unknown as MockWebSocket;
    ws1.emit('close');
    expect(client.isConnected()).toBe(false);
    vi.advanceTimersByTime(1000);
    await flush();
    expect(client.isConnected()).toBe(true);
  });

  it('is idempotent — second connect() while connected is a no-op', async () => {
    client.connect();
    await flush();
    const ws1 = client.getSocket();
    client.connect();
    await flush();
    expect(client.getSocket()).toBe(ws1);
  });

  it('sends keepalive ping after interval', async () => {
    client.connect();
    await flush();
    const ws = client.getSocket() as unknown as MockWebSocket;
    ws.sent.length = 0;
    vi.advanceTimersByTime(20_000);
    expect(ws.sent).toHaveLength(1);
    expect(JSON.parse(ws.sent[0])).toEqual({ type: 'ping' });
  });

  it('stops keepalive on close', async () => {
    client.connect();
    await flush();
    const ws = client.getSocket() as unknown as MockWebSocket;
    ws.sent.length = 0;
    ws.emit('close');
    vi.advanceTimersByTime(20_000);
    expect(ws.sent).toHaveLength(0);
  });

  it('skips WebSocket when probe fails', async () => {
    vi.mocked(globalThis.fetch).mockRejectedValueOnce(new Error('ECONNREFUSED'));
    client.connect();
    await flush();
    expect(client.isConnected()).toBe(false);
    expect(client.getSocket()).toBeNull();
  });
});

describe('WsClient.waitConnected', () => {
  beforeEach(() => {
    vi.mocked(globalThis.fetch).mockClear();
    vi.mocked(globalThis.fetch).mockResolvedValue({ ok: true } as Response);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves true immediately when already connected', async () => {
    const c = new WsClient('ws://localhost', MockWebSocket as any);
    c.connect();
    await flush();
    await expect(c.waitConnected()).resolves.toBe(true);
    c.disconnect();
  });

  it('resolves false immediately when no socket', async () => {
    const c = new WsClient('ws://localhost', MockWebSocket as any);
    await expect(c.waitConnected()).resolves.toBe(false);
  });

  it('waits for open event then resolves true', async () => {
    const c = new WsClient('ws://localhost', SlowMockWebSocket as any);
    c.connect();
    await flush();
    const ws = c.getSocket() as unknown as SlowMockWebSocket;
    expect(c.isConnected()).toBe(false);
    const promise = c.waitConnected();
    ws.simulateOpen();
    await expect(promise).resolves.toBe(true);
    c.disconnect();
  });

  it('resolves false if socket closes before opening', async () => {
    const c = new WsClient('ws://localhost', SlowMockWebSocket as any);
    c.connect();
    await flush();
    const ws = c.getSocket() as unknown as SlowMockWebSocket;
    const promise = c.waitConnected();
    ws.close();
    await expect(promise).resolves.toBe(false);
  });

  it('resolves false on timeout', async () => {
    vi.useFakeTimers();
    const c = new WsClient('ws://localhost', SlowMockWebSocket as any);
    c.connect();
    await flush();
    const promise = c.waitConnected(500);
    vi.advanceTimersByTime(500);
    await expect(promise).resolves.toBe(false);
    c.disconnect();
  });
});
