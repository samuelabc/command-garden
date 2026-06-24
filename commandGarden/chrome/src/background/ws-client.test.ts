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
