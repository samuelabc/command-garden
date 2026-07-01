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
  it('calls daemon API and returns success', async () => {
    const client = {
      post: vi.fn().mockResolvedValue({ ok: true }),
    } as unknown as import('../client.js').DaemonClient;
    const output = await executeConfigSet(client, 'daemon.port', '9999');
    expect(output).toContain('daemon.port');
    expect(output).toContain('9999');
    expect(client.post).toHaveBeenCalledWith('/api/config', { key: 'daemon.port', value: '9999' });
  });

  it('returns error on API failure', async () => {
    const client = {
      post: vi.fn().mockRejectedValue(new Error('Cannot connect')),
    } as unknown as import('../client.js').DaemonClient;
    const output = await executeConfigSet(client, 'daemon.port', '9999');
    expect(output).toContain('Error');
  });
});
