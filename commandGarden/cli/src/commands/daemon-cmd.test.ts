// src/commands/daemon-cmd.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { executeDaemonStatus, executeDaemonStart, executeDaemonStop } from './daemon-cmd.js';
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
}));

describe('executeDaemonStatus', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('shows running status', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true, extensionConnected: true, connectorCount: 3 }),
    });
    const output = await executeDaemonStatus('http://127.0.0.1:9091');
    expect(output).toContain('running');
    expect(output).toContain('Extension: connected');
    expect(output).toContain('3');
  });

  it('shows stopped status on connection error', async () => {
    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));
    const output = await executeDaemonStatus('http://127.0.0.1:9091');
    expect(output).toContain('not running');
  });
});

describe('executeDaemonStart', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it('spawns daemon process and waits for ready', async () => {
    const fakeChild = { pid: 12345, unref: vi.fn(), on: vi.fn(), stderr: { on: vi.fn() } } as unknown as ChildProcess;
    vi.mocked(spawn).mockReturnValue(fakeChild);
    vi.mocked(existsSync).mockReturnValue(false);

    let fetchCount = 0;
    vi.mocked(globalThis.fetch).mockImplementation(() => {
      fetchCount++;
      if (fetchCount <= 1) return Promise.reject(new Error('ECONNREFUSED'));
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) } as Response);
    });
    vi.spyOn(process, 'kill').mockImplementation(() => true);

    const result = await executeDaemonStart('http://127.0.0.1:9091', '/fake/home/.commandgarden', '/fake/daemon/main.js');
    expect(result.status).toBe('started');
    expect(result.pid).toBe(12345);
    expect(result.message).toContain('12345');
    expect(spawn).toHaveBeenCalled();
  });

  it('reports failure when daemon process crashes', async () => {
    const fakeChild = { pid: 12345, unref: vi.fn(), on: vi.fn(), stderr: { on: vi.fn() } } as unknown as ChildProcess;
    vi.mocked(spawn).mockReturnValue(fakeChild);
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue('EADDRINUSE: address already in use');
    vi.mocked(globalThis.fetch).mockRejectedValue(new Error('ECONNREFUSED'));
    vi.spyOn(process, 'kill').mockImplementation(() => { throw new Error('ESRCH'); });

    const result = await executeDaemonStart('http://127.0.0.1:9091', '/fake/home/.commandgarden', '/fake/daemon/main.js');
    expect(result.status).toBe('failed');
    expect(result.message).toContain('failed to start');
    expect(result.message).toContain('EADDRINUSE');
  });

  it('reports unresponsive on timeout without crash', async () => {
    vi.useFakeTimers();
    const fakeChild = { pid: 12345, unref: vi.fn(), on: vi.fn(), stderr: { on: vi.fn() } } as unknown as ChildProcess;
    vi.mocked(spawn).mockReturnValue(fakeChild);
    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(globalThis.fetch).mockRejectedValue(new Error('ECONNREFUSED'));
    vi.spyOn(process, 'kill').mockImplementation(() => true);

    const resultPromise = executeDaemonStart('http://127.0.0.1:9091', '/fake/home/.commandgarden', '/fake/daemon/main.js');
    await vi.runAllTimersAsync();
    const result = await resultPromise;
    expect(result.status).toBe('unresponsive');
    expect(result.message).toContain('not responding');
    vi.useRealTimers();
  });

  it('reports if already running', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({ ok: true, json: () => Promise.resolve({ ok: true }) } as Response);
    const result = await executeDaemonStart('http://127.0.0.1:9091', '/fake/home/.commandgarden', '/fake/daemon/main.js');
    expect(result.status).toBe('already-running');
  });

  it('returns locked status when another instance holds the lock', async () => {
    vi.mocked(globalThis.fetch).mockRejectedValue(new Error('ECONNREFUSED'));
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue('999');
    vi.spyOn(process, 'kill').mockImplementation(() => true);

    const result = await executeDaemonStart('http://127.0.0.1:9091', '/fake/home/.commandgarden', '/fake/daemon/main.js');
    expect(result.status).toBe('locked');
    expect(result.message).toContain('999');
    expect(spawn).not.toHaveBeenCalled();
  });
});

describe('executeDaemonStop', () => {
  it('stops daemon via PID', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue('12345');
    const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);

    const output = await executeDaemonStop('/fake/home/.commandgarden');
    expect(output).toContain('stopped');
    expect(killSpy).toHaveBeenCalledWith(12345, 'SIGTERM');
    killSpy.mockRestore();
  });

  it('reports if no PID file found', async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    const output = await executeDaemonStop('/fake/home/.commandgarden');
    expect(output).toContain('not running');
  });
});
