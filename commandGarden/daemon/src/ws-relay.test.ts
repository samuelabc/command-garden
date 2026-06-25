// src/ws-relay.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WsRelay } from './ws-relay.js';
import { EventEmitter } from 'node:events';

class MockSocket extends EventEmitter {
  sent: string[] = [];
  closed = false;
  send(data: string) { this.sent.push(data); }
  close() { this.closed = true; this.emit('close'); }
}

describe('WsRelay', () => {
  let relay: WsRelay;
  let socket: MockSocket;

  beforeEach(() => {
    relay = new WsRelay();
    socket = new MockSocket();
  });

  it('reports not connected initially', () => {
    expect(relay.connected).toBe(false);
  });

  it('reports connected after attach', () => {
    relay.attach(socket as any);
    expect(relay.connected).toBe(true);
  });

  it('reports disconnected after socket close', () => {
    relay.attach(socket as any);
    socket.emit('close');
    expect(relay.connected).toBe(false);
  });

  it('throws when sending without connection', async () => {
    await expect(relay.send({} as any, {})).rejects.toThrow('not connected');
  });

  it('sends ExtensionRequest and receives response', async () => {
    relay.attach(socket as any);
    const connector = { site: 'test', name: 'cmd' } as any;
    const promise = relay.send(connector, { key: 'val' }, 5000);

    // Parse sent message to get ID
    const sent = JSON.parse(socket.sent[0]);
    expect(sent.connector).toBeDefined();

    // Simulate extension response
    socket.emit('message', JSON.stringify({ id: sent.id, ok: true, data: [{ a: 1 }] }));

    const resp = await promise;
    expect(resp.ok).toBe(true);
    expect(resp.data).toEqual([{ a: 1 }]);
  });

  it('closes previous socket when a new one attaches', () => {
    relay.attach(socket as any);
    const socket2 = new MockSocket();
    relay.attach(socket2 as any);
    expect(socket.closed).toBe(true);
    expect(relay.connected).toBe(true);
  });

  it('times out if no response', async () => {
    vi.useFakeTimers();
    relay.attach(socket as any);
    const promise = relay.send({} as any, {}, 100);
    vi.advanceTimersByTime(200);
    await expect(promise).rejects.toThrow('timed out');
    vi.useRealTimers();
  });
});
