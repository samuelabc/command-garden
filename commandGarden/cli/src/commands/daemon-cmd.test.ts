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
    const output = await executeDaemonStatus('http://127.0.0.1:19825');
    expect(output).toContain('running');
    expect(output).toContain('Extension: connected');
    expect(output).toContain('3');
  });

  it('shows stopped status on connection error', async () => {
    mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));
    const output = await executeDaemonStatus('http://127.0.0.1:19825');
    expect(output).toContain('not running');
  });
});

describe('executeDaemonStart', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('spawns daemon process', async () => {
    const fakeChild = {
      pid: 12345,
      unref: vi.fn(),
      on: vi.fn(),
      stderr: { on: vi.fn() },
    } as unknown as ChildProcess;
    vi.mocked(spawn).mockReturnValue(fakeChild);
    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(globalThis.fetch).mockRejectedValue(new Error('ECONNREFUSED'));

    const output = await executeDaemonStart('http://127.0.0.1:19825', '/fake/home/.commandgarden', '/fake/daemon/main.js');
    expect(output).toContain('started');
    expect(spawn).toHaveBeenCalled();
  });

  it('reports if already running', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true, json: () => Promise.resolve({ ok: true }),
    } as Response);

    const output = await executeDaemonStart('http://127.0.0.1:19825', '/fake/home/.commandgarden', '/fake/daemon/main.js');
    expect(output).toContain('already running');
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
