import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resolveScript } from '../resolve-script.js';
import { executeExtensionSetup } from './extension-cmd.js';

vi.mock('../resolve-script.js', () => ({
  resolveScript: vi.fn(),
}));

describe('executeExtensionSetup', () => {
  beforeEach(() => {
    vi.mocked(resolveScript).mockReturnValue('/fake/chrome/dist/manifest.json');
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it('returns output containing the resolved extension path', () => {
    const output = executeExtensionSetup('/fake/cli/dist');
    expect(output).toContain('/fake/chrome/dist');
  });

  it('returns install instructions with browser URLs', () => {
    const output = executeExtensionSetup('/fake/cli/dist');
    expect(output).toContain('Developer mode');
    expect(output).toContain('Load unpacked');
    expect(output).toContain('chrome://extensions');
    expect(output).toContain('edge://extensions');
  });
});
