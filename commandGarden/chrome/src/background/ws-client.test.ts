// src/background/ws-client.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WsClient } from './ws-client.js';
import { EventEmitter } from 'node:events';

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
    client = new WsClient('ws://127.0.0.1:19825/ws/extension', MockWebSocket as any);
  });

  afterEach(() => {
    client.disconnect();
    vi.useRealTimers();
  });

  it('connects to daemon URL', () => {
    client.connect();
    expect(client.isConnected()).toBe(true);
  });

  it('sends ExtensionResponse', () => {
    client.connect();
    client.sendResponse({ id: '1', ok: true, data: [] });
    const ws = client.getSocket() as unknown as MockWebSocket;
    expect(ws.sent).toHaveLength(1);
    expect(JSON.parse(ws.sent[0]).id).toBe('1');
  });

  it('invokes onRequest handler for incoming messages', () => {
    const handler = vi.fn();
    client.onRequest(handler);
    client.connect();
    const ws = client.getSocket() as unknown as MockWebSocket;
    ws.emit('message', { data: JSON.stringify({ id: '1', connector: {}, args: {} }) });
    expect(handler).toHaveBeenCalled();
  });

  it('handles disconnect', () => {
    client.connect();
    client.disconnect();
    expect(client.isConnected()).toBe(false);
  });

  it('reconnects after unexpected close', () => {
    client.connect();
    const ws1 = client.getSocket() as unknown as MockWebSocket;
    ws1.emit('close');
    expect(client.isConnected()).toBe(false);
    vi.advanceTimersByTime(1000);
    expect(client.isConnected()).toBe(true);
  });
});

describe('WsClient.waitConnected', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves true immediately when already connected', async () => {
    const c = new WsClient('ws://localhost', MockWebSocket as any);
    c.connect();
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
    const ws = c.getSocket() as unknown as SlowMockWebSocket;
    const promise = c.waitConnected();
    ws.close();
    await expect(promise).resolves.toBe(false);
  });

  it('resolves false on timeout', async () => {
    vi.useFakeTimers();
    const c = new WsClient('ws://localhost', SlowMockWebSocket as any);
    c.connect();
    const promise = c.waitConnected(500);
    vi.advanceTimersByTime(500);
    await expect(promise).resolves.toBe(false);
    c.disconnect();
  });
});
