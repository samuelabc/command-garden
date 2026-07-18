// commandGarden/cli/src/poll.test.ts
import { describe, it, expect, vi } from 'vitest';
import { pollUntilReady } from './poll.js';

describe('pollUntilReady', () => {
  it('returns "ready" as soon as checkReady succeeds', async () => {
    const checkReady = vi.fn().mockResolvedValue(true);
    const isAlive = vi.fn().mockReturnValue(true);
    const result = await pollUntilReady({ checkReady, isAlive, maxAttempts: 5, intervalMs: 0 });
    expect(result).toBe('ready');
    expect(checkReady).toHaveBeenCalledTimes(1);
  });

  it('returns "died" as soon as isAlive goes false', async () => {
    const checkReady = vi.fn().mockResolvedValue(false);
    const isAlive = vi.fn().mockReturnValue(false);
    const result = await pollUntilReady({ checkReady, isAlive, maxAttempts: 5, intervalMs: 0 });
    expect(result).toBe('died');
    expect(checkReady).not.toHaveBeenCalled();
  });

  it('returns "timeout" when neither happens within maxAttempts', async () => {
    const checkReady = vi.fn().mockResolvedValue(false);
    const isAlive = vi.fn().mockReturnValue(true);
    const result = await pollUntilReady({ checkReady, isAlive, maxAttempts: 3, intervalMs: 0 });
    expect(result).toBe('timeout');
    expect(checkReady).toHaveBeenCalledTimes(3);
  });
});
