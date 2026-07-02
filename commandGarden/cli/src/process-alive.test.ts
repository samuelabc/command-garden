// commandGarden/cli/src/process-alive.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { isProcessAlive } from './process-alive.js';

describe('isProcessAlive', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('returns true when process.kill does not throw', () => {
    vi.spyOn(process, 'kill').mockImplementation(() => true);
    expect(isProcessAlive(12345)).toBe(true);
  });

  it('returns false when process.kill throws', () => {
    vi.spyOn(process, 'kill').mockImplementation(() => { throw new Error('ESRCH'); });
    expect(isProcessAlive(12345)).toBe(false);
  });
});
