// src/commands/up-down.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { spawn, type ChildProcess } from 'node:child_process';

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(),
  unlinkSync: vi.fn(),
  mkdirSync: vi.fn(),
  openSync: vi.fn().mockReturnValue(3),
  closeSync: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
  exec: vi.fn(),
}));

import { executeUp, executeDown } from './up-down.js';

function fakeChild(pid = 99999): ChildProcess {
  return {
    pid,
    unref: vi.fn(),
    on: vi.fn(),
    stderr: { on: vi.fn() },
  } as unknown as ChildProcess;
}

describe('executeUp', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
    vi.mocked(spawn).mockReturnValue(fakeChild());
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it('starts daemon then GUI', async () => {
    // Daemon start: first fetch fails (not running), subsequent succeed
    let fetchCount = 0;
    mockFetch.mockImplementation(() => {
      fetchCount++;
      if (fetchCount <= 1) return Promise.reject(new Error('ECONNREFUSED'));
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) });
    });

    const output = await executeUp(
      'http://127.0.0.1:19825', '/fake/.cg', '/fake/daemon.js', '/fake/app.js', '/fake/config.yaml',
    );
    expect(output).toContain('started');
    expect(spawn).toHaveBeenCalled();
  });

  it('reports daemon already running and still starts GUI', async () => {
    // Daemon is already running (fetch succeeds immediately)
    mockFetch.mockResolvedValue({
      ok: true, json: () => Promise.resolve({ ok: true }),
    } as Response);

    const output = await executeUp(
      'http://127.0.0.1:19825', '/fake/.cg', '/fake/daemon.js', '/fake/app.js', '/fake/config.yaml',
    );
    expect(output).toContain('already running');
  });
});

describe('executeDown', () => {
  it('stops GUI then daemon', async () => {
    // Both have PID files
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue('12345');
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);

    const output = await executeDown('/fake/.cg');
    expect(output).toContain('stopped');
    expect(output).toContain('All services stopped');
    expect(killSpy).toHaveBeenCalledTimes(2);
    killSpy.mockRestore();
  });

  it('handles no PID files gracefully', async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    const output = await executeDown('/fake/.cg');
    expect(output).toContain('not running');
    expect(output).toContain('All services stopped');
  });
});
