// src/commands/run.test.ts
import { describe, it, expect, vi } from 'vitest';
import { executeRun, parseConnectorArgs } from './run.js';
import type { DaemonClient } from '@commandgarden/shared';

function mockClient(response: Record<string, unknown>): DaemonClient {
  return {
    post: vi.fn().mockResolvedValue(response),
  } as unknown as DaemonClient;
}

describe('parseConnectorArgs', () => {
  it('parses --key value pairs', () => {
    const args = parseConnectorArgs(['--month', '2026-06', '--verbose']);
    expect(args).toEqual({ month: '2026-06', verbose: 'true' });
  });

  it('returns empty for no args', () => {
    expect(parseConnectorArgs([])).toEqual({});
  });

  it('handles --key=value syntax', () => {
    const args = parseConnectorArgs(['--month=2026-06']);
    expect(args).toEqual({ month: '2026-06' });
  });

  it('ignores non-flag tokens', () => {
    const args = parseConnectorArgs(['stray', '--month', '2026-06']);
    expect(args).toEqual({ month: '2026-06' });
  });
});

describe('executeRun', () => {
  it('calls client.post with connector and args', async () => {
    const client = mockClient({
      ok: true, connector: 'test/cmd', rowCount: 1,
      columns: ['id'], data: [{ id: '1' }], durationMs: 100,
    });
    const output = await executeRun(client, 'test/cmd', { month: '2026-06' }, 'json');
    expect(client.post).toHaveBeenCalledWith('/api/run', {
      connector: 'test/cmd', args: { month: '2026-06' }, format: 'json',
    });
    const parsed = JSON.parse(output);
    expect(parsed.ok).toBe(true);
    expect(parsed.data).toHaveLength(1);
  });

  it('formats output as table', async () => {
    const client = mockClient({
      ok: true, connector: 'test/cmd', rowCount: 1,
      columns: ['id', 'name'], data: [{ id: '1', name: 'Alice' }], durationMs: 50,
    });
    const output = await executeRun(client, 'test/cmd', {}, 'table');
    expect(output).toContain('Alice');
    expect(output).toContain('id');
  });

  it('formats output as csv', async () => {
    const client = mockClient({
      ok: true, connector: 'test/cmd', rowCount: 1,
      columns: ['id'], data: [{ id: '1' }], durationMs: 50,
    });
    const output = await executeRun(client, 'test/cmd', {}, 'csv');
    expect(output).toContain('id');
    expect(output).toContain('1');
  });

  it('returns error message on failure', async () => {
    const client = {
      post: vi.fn().mockRejectedValue(new Error('Extension not connected')),
    } as unknown as DaemonClient;
    const output = await executeRun(client, 'test/cmd', {}, 'table');
    expect(output).toContain('Error');
    expect(output).toContain('Extension not connected');
  });
});
