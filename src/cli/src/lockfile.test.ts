// commandGarden/cli/src/lockfile.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { acquireLock, releaseLock } from './lockfile.js';

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(),
  unlinkSync: vi.fn(),
}));

describe('acquireLock', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('acquires when no lock file exists', () => {
    vi.mocked(existsSync).mockReturnValue(false);
    const result = acquireLock('/fake/.cg/daemon.lock');
    expect(result).toEqual({ acquired: true });
    expect(writeFileSync).toHaveBeenCalledWith('/fake/.cg/daemon.lock', String(process.pid));
  });

  it('refuses when lock is held by a live process', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue('999');
    vi.spyOn(process, 'kill').mockImplementation(() => true);
    const result = acquireLock('/fake/.cg/daemon.lock');
    expect(result).toEqual({ acquired: false, holderPid: 999 });
  });

  it('steals a stale lock left by a dead process', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue('999');
    vi.spyOn(process, 'kill').mockImplementation(() => { throw new Error('ESRCH'); });
    const result = acquireLock('/fake/.cg/daemon.lock');
    expect(result).toEqual({ acquired: true });
    expect(writeFileSync).toHaveBeenCalledWith('/fake/.cg/daemon.lock', String(process.pid));
  });
});

describe('releaseLock', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('removes the lock file', () => {
    releaseLock('/fake/.cg/daemon.lock');
    expect(unlinkSync).toHaveBeenCalledWith('/fake/.cg/daemon.lock');
  });

  it('is a no-op if the file is already gone', () => {
    vi.mocked(unlinkSync).mockImplementation(() => { throw new Error('ENOENT'); });
    expect(() => releaseLock('/fake/.cg/daemon.lock')).not.toThrow();
  });
});
