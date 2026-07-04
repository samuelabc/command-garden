import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync, existsSync, writeFileSync, unlinkSync, mkdirSync, openSync, closeSync } from 'node:fs';
import { spawn, type ChildProcess } from 'node:child_process';
import { executeGuiStart, executeGuiStop, executeGuiStatus } from './gui-cmd.js';

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
}));

function fakeChild(pid = 88888): ChildProcess {
  const listeners: Record<string, ((...args: unknown[]) => void)[]> = {};
  return {
    pid,
    unref: vi.fn(),
    on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
      (listeners[event] ??= []).push(cb);
    }),
    stderr: { on: vi.fn() },
  } as unknown as ChildProcess;
}

describe('executeGuiStatus', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('reports not running when no PID file', () => {
    vi.mocked(existsSync).mockReturnValue(false);
    expect(executeGuiStatus('/fake/.cg')).toBe('GUI: not running (no PID file found).');
  });

  it('reports running when process is alive', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue('12345');
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);
    expect(executeGuiStatus('/fake/.cg')).toContain('running (PID: 12345)');
    killSpy.mockRestore();
  });

  it('reports stale PID when process is dead', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue('12345');
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => { throw new Error('ESRCH'); });
    expect(executeGuiStatus('/fake/.cg')).toContain('stale PID');
    killSpy.mockRestore();
  });
});

describe('executeGuiStop', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('reports not running when no PID file', () => {
    vi.mocked(existsSync).mockReturnValue(false);
    expect(executeGuiStop('/fake/.cg')).toBe('GUI is not running (no PID file found).');
  });

  it('stops process via PID', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue('12345');
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);
    const output = executeGuiStop('/fake/.cg');
    expect(output).toContain('stopped');
    expect(killSpy).toHaveBeenCalledWith(12345, 'SIGTERM');
    killSpy.mockRestore();
  });

  it('cleans up stale PID file', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue('12345');
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => { throw new Error('ESRCH'); });
    const output = executeGuiStop('/fake/.cg');
    expect(output).toContain('stale PID');
    expect(unlinkSync).toHaveBeenCalled();
    killSpy.mockRestore();
  });
});

describe('executeGuiStart', () => {
  let mockFetch: ReturnType<typeof vi.fn>;
  let child: ReturnType<typeof fakeChild>;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
    vi.mocked(existsSync).mockReturnValue(false);
    child = fakeChild();
    vi.mocked(spawn).mockReturnValue(child);
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it('returns failed status when daemon is not running', async () => {
    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));
    const result = await executeGuiStart(
      'http://127.0.0.1:9091', '/fake/.cg', '/fake/app.js', { background: true },
    ) as import('./lifecycle-types.js').LifecycleStartResult;
    expect(result.status).toBe('failed');
    expect(result.message).toContain('Daemon is not running');
  });

  it('reports already running when PID is alive', async () => {
    mockFetch.mockResolvedValue({ ok: true } as Response);
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue('12345');
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);

    const result = await executeGuiStart(
      'http://127.0.0.1:9091', '/fake/.cg', '/fake/app.js', { background: true, noOpen: true },
    ) as import('./lifecycle-types.js').LifecycleStartResult;
    expect(result.status).toBe('already-running');
    killSpy.mockRestore();
  });

  it('opens browser when already running and noOpen is not set', async () => {
    mockFetch.mockResolvedValue({ ok: true } as Response);
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue('12345');
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);

    const result = await executeGuiStart(
      'http://127.0.0.1:9091', '/fake/.cg', '/fake/app.js', { background: true },
    ) as import('./lifecycle-types.js').LifecycleStartResult;
    expect(result.status).toBe('already-running');
    expect(spawn).toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining([expect.stringContaining('9092')]),
      expect.anything(),
    );
    killSpy.mockRestore();
  });

  it('does not throw when the browser-opener process errors', async () => {
    mockFetch.mockResolvedValue({ ok: true } as Response);
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue('12345');
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);

    await executeGuiStart('http://127.0.0.1:9091', '/fake/.cg', '/fake/app.js', { background: true });

    const onMock = child.on as unknown as ReturnType<typeof vi.fn>;
    const errorHandler = onMock.mock.calls.find(([event]: [string]) => event === 'error')?.[1];
    expect(errorHandler).toBeDefined();
    expect(() => errorHandler(new Error('ENOENT'))).not.toThrow();
    killSpy.mockRestore();
  });

  it('opens browser after a fresh start becomes ready', async () => {
    mockFetch.mockResolvedValue({ ok: true } as Response);
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);

    const result = await executeGuiStart(
      'http://127.0.0.1:9091', '/fake/.cg', '/fake/app.js', { background: true },
    ) as import('./lifecycle-types.js').LifecycleStartResult;
    expect(result.status).toBe('started');
    expect(spawn).toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining([expect.stringContaining('9092')]),
      expect.anything(),
    );
    killSpy.mockRestore();
  });

  it('starts in background and writes PID', async () => {
    mockFetch.mockResolvedValue({ ok: true } as Response);

    const result = await executeGuiStart(
      'http://127.0.0.1:9091', '/fake/.cg', '/fake/app.js', { background: true, noOpen: true },
    ) as import('./lifecycle-types.js').LifecycleStartResult;
    expect(result.status).toBe('started');
    expect(spawn).toHaveBeenCalledWith('node', ['/fake/app.js'], expect.anything());
    expect(writeFileSync).toHaveBeenCalled();
  });

  it('returns locked status when another instance holds the lock', async () => {
    mockFetch.mockResolvedValue({ ok: true } as Response);
    vi.mocked(existsSync).mockImplementation((p) => String(p).endsWith('app.lock'));
    vi.mocked(readFileSync).mockReturnValue('999');
    vi.spyOn(process, 'kill').mockImplementation(() => true);

    const result = await executeGuiStart(
      'http://127.0.0.1:9091', '/fake/.cg', '/fake/app.js', { background: true, noOpen: true },
    ) as import('./lifecycle-types.js').LifecycleStartResult;
    expect(result.status).toBe('locked');
    expect(spawn).not.toHaveBeenCalled();
  });
});
