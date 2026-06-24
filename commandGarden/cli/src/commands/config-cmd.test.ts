// src/commands/config-cmd.test.ts
import { describe, it, expect, vi } from 'vitest';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { executeConfigShow, executeConfigSet } from './config-cmd.js';

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

const SAMPLE_CONFIG = `daemon:
  port: 19825
  host: "127.0.0.1"
security:
  extensionId: ""
output:
  defaultFormat: table
`;

describe('executeConfigShow', () => {
  it('displays config file contents', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(SAMPLE_CONFIG);
    const output = executeConfigShow('/fake/.commandgarden/config.yaml');
    expect(output).toContain('daemon');
    expect(output).toContain('19825');
    expect(output).toContain('table');
  });

  it('shows defaults when no config file exists', () => {
    vi.mocked(existsSync).mockReturnValue(false);
    const output = executeConfigShow('/fake/.commandgarden/config.yaml');
    expect(output).toContain('No config file');
  });
});

describe('executeConfigSet', () => {
  it('sets a top-level.nested key', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(SAMPLE_CONFIG);
    const output = executeConfigSet('/fake/.commandgarden/config.yaml', 'daemon.port', '9999');
    expect(output).toContain('daemon.port');
    expect(output).toContain('9999');
    expect(writeFileSync).toHaveBeenCalled();
  });

  it('creates config file if missing', () => {
    vi.mocked(existsSync).mockReturnValue(false);
    const output = executeConfigSet('/fake/.commandgarden/config.yaml', 'output.defaultFormat', 'json');
    expect(output).toContain('output.defaultFormat');
    expect(writeFileSync).toHaveBeenCalled();
  });

  it('rejects unknown top-level key', () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(SAMPLE_CONFIG);
    const output = executeConfigSet('/fake/.commandgarden/config.yaml', 'unknown.key', 'val');
    expect(output).toContain('Unknown config section');
  });
});
