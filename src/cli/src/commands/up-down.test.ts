// src/commands/up-down.test.ts
//
// Exercises executeUp against the real daemon/GUI sub-commands. The
// LifecycleStatus -> ok mapping lives in up-down-exit-code.test.ts, which mocks
// them out to drive each status directly.
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

// openBrowser awaits either 'spawn' or 'error', so the fake has to report one
// of them or every browser-opening test stalls until the spawn timeout.
function fakeChild(pid = 99999): ChildProcess {
  return {
    pid,
    unref: vi.fn(),
    on: vi.fn((event: string, cb: () => void) => { if (event === 'spawn') cb(); }),
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
    let fetchCount = 0;
    mockFetch.mockImplementation(() => {
      fetchCount++;
      if (fetchCount <= 1) return Promise.reject(new Error('ECONNREFUSED'));
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) });
    });
    vi.spyOn(process, 'kill').mockImplementation(() => true);
    vi.mocked(existsSync).mockReturnValue(false);

    const result = await executeUp(
      'http://127.0.0.1:9091', '/fake/.cg', '/fake/daemon.js', '/fake/app.js', 'node', '/fake/config.yaml',
    );
    expect(result.message).toContain('started');
    expect(result.ok).toBe(true);
    expect(spawn).toHaveBeenCalled();
  });

  it('reports daemon already running and still starts GUI', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ ok: true }) } as Response);
    vi.mocked(existsSync).mockReturnValue(false);
    // Without this the spawned GUI's PID looks dead and the stage reports 'failed'.
    vi.spyOn(process, 'kill').mockImplementation(() => true);

    const result = await executeUp(
      'http://127.0.0.1:9091', '/fake/.cg', '/fake/daemon.js', '/fake/app.js', 'node', '/fake/config.yaml',
    );
    expect(result.message).toContain('already running');
    expect(result.ok).toBe(true);
  });

  it('opens browser by default when GUI is already running', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ ok: true }) } as Response);
    vi.mocked(existsSync).mockImplementation((p) => String(p).endsWith('app.pid'));
    vi.mocked(readFileSync).mockReturnValue('12345');
    vi.spyOn(process, 'kill').mockImplementation(() => true);

    await executeUp(
      'http://127.0.0.1:9091', '/fake/.cg', '/fake/daemon.js', '/fake/app.js', 'node', '/fake/config.yaml',
    );
    expect(spawn).toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining([expect.stringContaining('9092')]),
      expect.anything(),
    );
  });

  it('skips opening browser when noOpen is set, even when GUI is already running', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({ ok: true }) } as Response);
    vi.mocked(existsSync).mockImplementation((p) => String(p).endsWith('app.pid'));
    vi.mocked(readFileSync).mockReturnValue('12345');
    vi.spyOn(process, 'kill').mockImplementation(() => true);

    await executeUp(
      'http://127.0.0.1:9091', '/fake/.cg', '/fake/daemon.js', '/fake/app.js', 'node', '/fake/config.yaml',
      { noOpen: true },
    );
    expect(spawn).not.toHaveBeenCalled();
  });

  it('skips opening browser on fresh start when noOpen is set', async () => {
    let fetchCount = 0;
    mockFetch.mockImplementation(() => {
      fetchCount++;
      if (fetchCount <= 1) return Promise.reject(new Error('ECONNREFUSED'));
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) });
    });
    vi.spyOn(process, 'kill').mockImplementation(() => true);
    vi.mocked(existsSync).mockReturnValue(false);

    await executeUp(
      'http://127.0.0.1:9091', '/fake/.cg', '/fake/daemon.js', '/fake/app.js', 'node', '/fake/config.yaml',
      { noOpen: true },
    );
    // spawn called for daemon + app process, but never with a browser-open command containing the app URL
    expect(spawn).not.toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining([expect.stringContaining('9092')]),
      expect.anything(),
    );
  });

  it('does not start GUI when daemon fails to start', async () => {
    // Pre-check fails (not running); process dies immediately during poll
    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));
    vi.mocked(existsSync).mockReturnValue(false);
    vi.spyOn(process, 'kill').mockImplementation(() => { throw new Error('ESRCH'); });

    const result = await executeUp(
      'http://127.0.0.1:9091', '/fake/.cg', '/fake/daemon.js', '/fake/app.js', 'node', '/fake/config.yaml',
    );
    expect(result.message).toContain('failed to start');
    expect(result.ok).toBe(false);
    // spawn was called once for the daemon attempt, never a second time for GUI
    expect(spawn).toHaveBeenCalledTimes(1);
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
