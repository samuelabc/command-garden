import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { resolveScript } from '../resolve-script.js';
import { executeExtensionSetup } from './extension-cmd.js';

vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}));

vi.mock('../resolve-script.js', () => ({
  resolveScript: vi.fn(),
}));

function fakeChild(): ChildProcess {
  const listeners: Record<string, ((...args: unknown[]) => void)[]> = {};
  return {
    pid: 99999,
    unref: vi.fn(),
    on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
      (listeners[event] ??= []).push(cb);
    }),
  } as unknown as ChildProcess;
}

describe('executeExtensionSetup', () => {
  beforeEach(() => {
    vi.mocked(spawn).mockReturnValue(fakeChild());
    vi.mocked(resolveScript).mockReturnValue('/fake/chrome/dist/manifest.json');
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it('returns output containing the resolved extension path', () => {
    const output = executeExtensionSetup('/fake/cli/dist');
    expect(output).toContain('/fake/chrome/dist');
  });

  it('returns install instructions', () => {
    const output = executeExtensionSetup('/fake/cli/dist');
    expect(output).toContain('Developer mode');
    expect(output).toContain('Load unpacked');
    expect(output).toContain('Opening chrome://extensions...');
  });

  it('spawns the platform open command', () => {
    executeExtensionSetup('/fake/cli/dist');
    expect(spawn).toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining([expect.stringContaining('chrome://extensions')]),
      expect.objectContaining({ detached: true }),
    );
  });

  it('does not throw when spawn emits an error', () => {
    const child = fakeChild();
    vi.mocked(spawn).mockReturnValue(child);
    executeExtensionSetup('/fake/cli/dist');

    const onMock = child.on as unknown as ReturnType<typeof vi.fn>;
    const errorHandler = onMock.mock.calls.find(([event]: [string]) => event === 'error')?.[1];
    expect(errorHandler).toBeDefined();
    expect(() => errorHandler(new Error('ENOENT'))).not.toThrow();
  });
});
