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
    const promise = relay.send(connector, { key: 'val' }, undefined, 5000);

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
    const promise = relay.send({} as any, {}, undefined, 100);
    vi.advanceTimersByTime(200);
    await expect(promise).rejects.toThrow('timed out');
    vi.useRealTimers();
  });

  it('includes approvalConfig in sent request when provided', async () => {
    relay.attach(socket as any);
    const connector = { site: 'test', name: 'cmd' } as any;
    const approvalConfig = { approvalRequired: ['js_evaluate'], autoApproveConnectors: [], approvalTimeoutMs: 120_000 };
    const promise = relay.send(connector, {}, approvalConfig, 5000);
    const sent = JSON.parse(socket.sent[0]);
    expect(sent.approvalConfig).toEqual(approvalConfig);
    socket.emit('message', JSON.stringify({ id: sent.id, ok: true, data: [] }));
    await promise;
  });

  it('calls approval handler on incoming approval.request', () => {
    relay.attach(socket as any);
    const handler = vi.fn();
    relay.onApprovalRequest(handler);
    socket.emit('message', JSON.stringify({
      type: 'approval.request', approvalId: 'a1', requestId: 'r1',
      connectorKey: 'test/cmd', stepIndex: 0, stepType: 'js_evaluate',
      capability: 'js_evaluate', description: 'test step',
    }));
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ approvalId: 'a1' }));
  });

  it('registerApproval + resolveApproval resolves the promise', async () => {
    relay.attach(socket as any);
    const request = {
      type: 'approval.request' as const, approvalId: 'a1', requestId: 'r1',
      connectorKey: 'test/cmd', stepIndex: 0, stepType: 'js_evaluate' as const,
      capability: 'js_evaluate' as const, description: 'test',
    };
    const promise = relay.registerApproval(request, 5000);
    const resolved = relay.resolveApproval('a1', true);
    expect(resolved).toBe(true);
    expect(await promise).toBe(true);
    // Should also send approval.response to extension via WS
    const sent = JSON.parse(socket.sent[0]);
    expect(sent.type).toBe('approval.response');
    expect(sent.approved).toBe(true);
  });

  it('resolveApproval returns false for unknown approvalId', () => {
    relay.attach(socket as any);
    expect(relay.resolveApproval('unknown', true)).toBe(false);
  });

  it('handles approval.response from extension (resolves pending)', async () => {
    relay.attach(socket as any);
    const request = {
      type: 'approval.request' as const, approvalId: 'a2', requestId: 'r1',
      connectorKey: 'test/cmd', stepIndex: 1, stepType: 'click' as const,
      capability: 'dom_write' as const, description: 'click step',
    };
    const promise = relay.registerApproval(request, 5000);
    // Simulate extension sending approval.response via WS
    socket.emit('message', JSON.stringify({
      type: 'approval.response', approvalId: 'a2', approved: false,
    }));
    expect(await promise).toBe(false);
  });

  it('silently ignores ping messages', () => {
    relay.attach(socket as any);
    const handler = vi.fn();
    relay.onApprovalRequest(handler);
    socket.emit('message', JSON.stringify({ type: 'ping' }));
    expect(handler).not.toHaveBeenCalled();
    expect(socket.sent).toHaveLength(0);
  });

  it('rejects pending approvals on socket close', async () => {
    relay.attach(socket as any);
    const request = {
      type: 'approval.request' as const, approvalId: 'a3', requestId: 'r1',
      connectorKey: 'test/cmd', stepIndex: 0, stepType: 'navigate' as const,
      capability: 'navigate' as const, description: 'navigate step',
    };
    const promise = relay.registerApproval(request, 5000);
    socket.emit('close');
    expect(await promise).toBe(false);
  });
});
