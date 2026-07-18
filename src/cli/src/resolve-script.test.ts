// src/resolve-script.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { join, dirname } from 'node:path';

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}));

vi.mock('node:module', () => ({
  createRequire: vi.fn(),
}));

import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolveScript, findMonorepoRoot } from './resolve-script.js';

describe('resolveScript', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit');
    }) as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns relative path when it exists', () => {
    const baseDir = join('/fake', 'cli', 'dist');
    const expectedPath = join(baseDir, '../../daemon/dist/main.js');

    vi.mocked(existsSync).mockImplementation((p) => String(p) === expectedPath);

    const result = resolveScript(baseDir, '../../daemon/dist/main.js', '@commandgarden/daemon', 'dist/main.js');
    expect(result).toBe(expectedPath);
    expect(createRequire).not.toHaveBeenCalled();
  });

  it('returns package-resolved path when relative is missing but package exists', () => {
    const baseDir = join('/fake', 'cli', 'dist');
    const pkgDir = join('/global', 'node_modules', '@commandgarden', 'daemon');
    const pkgJsonPath = join(pkgDir, 'package.json');
    const resolvedEntry = join(pkgDir, 'dist', 'main.js');

    const mockResolve = vi.fn().mockReturnValue(pkgJsonPath);
    vi.mocked(createRequire).mockReturnValue({ resolve: mockResolve } as ReturnType<typeof createRequire>);

    vi.mocked(existsSync).mockImplementation((p) => {
      const s = String(p);
      if (s === resolvedEntry) return true;
      return false;
    });

    const result = resolveScript(baseDir, '../../daemon/dist/main.js', '@commandgarden/daemon', 'dist/main.js');
    expect(result).toBe(resolvedEntry);
  });

  it('shows both paths when package is found but entry point is not built', () => {
    const baseDir = join('/fake', 'cli', 'dist');
    const pkgDir = join('/global', 'node_modules', '@commandgarden', 'daemon');
    const pkgJsonPath = join(pkgDir, 'package.json');

    const mockResolve = vi.fn().mockReturnValue(pkgJsonPath);
    vi.mocked(createRequire).mockReturnValue({ resolve: mockResolve } as ReturnType<typeof createRequire>);
    vi.mocked(existsSync).mockReturnValue(false);

    expect(() => {
      resolveScript(baseDir, '../../daemon/dist/main.js', '@commandgarden/daemon', 'dist/main.js');
    }).toThrow('process.exit');

    const allErrors = errorSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(allErrors).toContain('relative — not found');
    expect(allErrors).toContain('entry point not built');
    expect(allErrors).toContain('@commandgarden/daemon');
  });

  it('shows "not resolvable" when package cannot be resolved', () => {
    const baseDir = join('/fake', 'cli', 'dist');

    vi.mocked(createRequire).mockReturnValue({
      resolve: vi.fn().mockImplementation(() => { throw new Error('MODULE_NOT_FOUND'); }),
    } as unknown as ReturnType<typeof createRequire>);
    vi.mocked(existsSync).mockReturnValue(false);

    expect(() => {
      resolveScript(baseDir, '../../daemon/dist/main.js', '@commandgarden/daemon', 'dist/main.js');
    }).toThrow('process.exit');

    const allErrors = errorSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(allErrors).toContain('not resolvable via require');
  });

  it('shows real monorepo path when detectable', () => {
    const root = join('/fake', 'monorepo');
    const baseDir = join(root, 'cli', 'dist');

    vi.mocked(createRequire).mockReturnValue({
      resolve: vi.fn().mockImplementation(() => { throw new Error('MODULE_NOT_FOUND'); }),
    } as unknown as ReturnType<typeof createRequire>);

    vi.mocked(existsSync).mockImplementation((p) => {
      return String(p) === join(root, 'package.json');
    });
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify({ workspaces: ['shared', 'daemon', 'cli'] }),
    );

    expect(() => {
      resolveScript(baseDir, '../../daemon/dist/main.js', '@commandgarden/daemon', 'dist/main.js');
    }).toThrow('process.exit');

    const allErrors = errorSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(allErrors).toContain(root);
    expect(allErrors).not.toContain('<monorepo>');
  });

  it('shows generic instructions when monorepo root is not detectable', () => {
    const baseDir = join('/some', 'global', 'path');

    vi.mocked(createRequire).mockReturnValue({
      resolve: vi.fn().mockImplementation(() => { throw new Error('MODULE_NOT_FOUND'); }),
    } as unknown as ReturnType<typeof createRequire>);
    vi.mocked(existsSync).mockReturnValue(false);

    expect(() => {
      resolveScript(baseDir, '../../daemon/dist/main.js', '@commandgarden/daemon', 'dist/main.js');
    }).toThrow('process.exit');

    const allErrors = errorSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(allErrors).toContain('<monorepo>');
  });
});

describe('findMonorepoRoot', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('finds root with workspaces field', () => {
    const root = join('/fake', 'monorepo');
    const startDir = join(root, 'cli', 'dist');

    vi.mocked(existsSync).mockImplementation((p) => {
      return String(p) === join(root, 'package.json');
    });
    vi.mocked(readFileSync).mockReturnValue(
      JSON.stringify({ workspaces: ['shared', 'daemon', 'cli'] }),
    );

    expect(findMonorepoRoot(startDir)).toBe(root);
  });

  it('returns null when no package.json found', () => {
    vi.mocked(existsSync).mockReturnValue(false);
    expect(findMonorepoRoot(join('/some', 'random', 'path'))).toBeNull();
  });

  it('skips package.json without workspaces field', () => {
    const root = join('/fake', 'monorepo');
    const cliDir = join(root, 'cli');

    vi.mocked(existsSync).mockImplementation((p) => {
      const s = String(p);
      return s === join(cliDir, 'package.json') || s === join(root, 'package.json');
    });
    vi.mocked(readFileSync).mockImplementation(((p: string) => {
      const s = String(p);
      if (s === join(cliDir, 'package.json')) return JSON.stringify({ name: '@commandgarden/cli' });
      if (s === join(root, 'package.json')) return JSON.stringify({ workspaces: ['cli', 'daemon'] });
      throw new Error('File not found');
    }) as typeof readFileSync);

    expect(findMonorepoRoot(join(cliDir, 'dist'))).toBe(root);
  });

  it('handles malformed package.json gracefully', () => {
    const dir = join('/fake', 'project');

    vi.mocked(existsSync).mockImplementation((p) => {
      return String(p) === join(dir, 'package.json');
    });
    vi.mocked(readFileSync).mockReturnValue('{ invalid json');

    expect(findMonorepoRoot(dir)).toBeNull();
  });
});
