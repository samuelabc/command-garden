// src/commands/config-cmd.test.ts
import { describe, it, expect, vi } from 'vitest';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import type { DaemonClient } from '@commandgarden/shared';
import { executeConfigShow, executeConfigSet, executeConfigApprove } from './config-cmd.js';

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

const SAMPLE_CONFIG = `daemon:
  port: 9091
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
    expect(output).toContain('9091');
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
    } as unknown as DaemonClient;
    const output = await executeConfigSet(client, 'daemon.port', '9999');
    expect(output).toContain('daemon.port');
    expect(output).toContain('9999');
    expect(client.post).toHaveBeenCalledWith('/api/config', { key: 'daemon.port', value: '9999' });
  });

  it('returns error on API failure', async () => {
    const client = {
      post: vi.fn().mockRejectedValue(new Error('Cannot connect')),
    } as unknown as DaemonClient;
    const output = await executeConfigSet(client, 'daemon.port', '9999');
    expect(output).toContain('Error');
  });
});

describe('executeConfigApprove', () => {
  function mockClient(approvedHighRisk: Record<string, string[]>) {
    return {
      get: vi.fn().mockResolvedValue({ ok: true, config: { security: { approvedHighRisk } } }),
      post: vi.fn().mockResolvedValue({ ok: true }),
    } as unknown as DaemonClient;
  }

  it('grants exactly the listed capabilities', async () => {
    const client = mockClient({});
    const output = await executeConfigApprove(client, 'risky/two', ['js_evaluate', 'network_egress']);
    expect(client.post).toHaveBeenCalledWith('/api/config', {
      key: 'security.approvedHighRisk',
      value: JSON.stringify({ 'risky/two': ['js_evaluate', 'network_egress'] }),
    });
    expect(output).toContain('js_evaluate, network_egress');
  });

  it('overwrites rather than merges, and reports what was dropped', async () => {
    const client = mockClient({ 'risky/two': ['cdp_attach', 'js_evaluate'] });
    const output = await executeConfigApprove(client, 'risky/two', ['js_evaluate']);
    expect(client.post).toHaveBeenCalledWith('/api/config', {
      key: 'security.approvedHighRisk',
      value: JSON.stringify({ 'risky/two': ['js_evaluate'] }),
    });
    expect(output).toContain('No longer approved: cdp_attach');
  });

  it('leaves other connectors untouched', async () => {
    const client = mockClient({ 'other/one': ['cdp_attach'] });
    await executeConfigApprove(client, 'risky/two', ['js_evaluate']);
    expect(client.post).toHaveBeenCalledWith('/api/config', {
      key: 'security.approvedHighRisk',
      value: JSON.stringify({ 'other/one': ['cdp_attach'], 'risky/two': ['js_evaluate'] }),
    });
  });

  it('deduplicates repeated capabilities', async () => {
    const client = mockClient({});
    await executeConfigApprove(client, 'risky/two', ['js_evaluate', 'js_evaluate']);
    expect(client.post).toHaveBeenCalledWith('/api/config', {
      key: 'security.approvedHighRisk',
      value: JSON.stringify({ 'risky/two': ['js_evaluate'] }),
    });
  });

  it('requires at least one capability', async () => {
    const client = mockClient({});
    const output = await executeConfigApprove(client, 'risky/two', []);
    expect(output).toContain('Usage:');
    expect(client.post).not.toHaveBeenCalled();
  });
});
