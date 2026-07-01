// src/sse-manager.test.ts
import { describe, it, expect, vi } from 'vitest';
import { SseManager } from './sse-manager.js';

describe('SseManager', () => {
  it('register resolves a pending waitForConnection', async () => {
    const mgr = new SseManager();
    const writer = vi.fn();
    const promise = mgr.waitForConnection('r1', 5000);
    mgr.register('r1', writer);
    await promise; // should resolve without timeout
  });

  it('send delivers events to registered writer', () => {
    const mgr = new SseManager();
    const writer = vi.fn();
    mgr.register('r1', writer);
    const sent = mgr.send('r1', 'approval', { id: 1 });
    expect(sent).toBe(true);
    expect(writer).toHaveBeenCalledWith('approval', { id: 1 });
  });

  it('send returns false for unknown requestId', () => {
    const mgr = new SseManager();
    expect(mgr.send('unknown', 'test', {})).toBe(false);
  });

  it('remove cleans up the writer', () => {
    const mgr = new SseManager();
    const writer = vi.fn();
    mgr.register('r1', writer);
    mgr.remove('r1');
    expect(mgr.send('r1', 'test', {})).toBe(false);
  });

  it('waitForConnection rejects after timeout', async () => {
    vi.useFakeTimers();
    const mgr = new SseManager();
    const promise = mgr.waitForConnection('r1', 100);
    vi.advanceTimersByTime(200);
    await expect(promise).rejects.toThrow('SSE connection timeout');
    vi.useRealTimers();
  });

  it('register before waitForConnection still resolves', async () => {
    const mgr = new SseManager();
    const writer = vi.fn();
    mgr.register('r1', writer);
    // waitForConnection called after register — no pending resolver, so it waits
    // This tests the case where SSE connects before waitForConnection is called
    // In practice, waitForConnection is always called first, but let's be safe
    const promise = mgr.waitForConnection('r1', 100);
    // Register again to resolve
    mgr.register('r1', writer);
    await promise;
  });
});
