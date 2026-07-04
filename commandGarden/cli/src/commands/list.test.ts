// src/commands/list.test.ts
import { describe, it, expect, vi } from 'vitest';
import { executeList } from './list.js';
import type { DaemonClient } from '@commandgarden/shared';

function mockClient(connectors: Record<string, unknown>[]): DaemonClient {
  return {
    get: vi.fn().mockResolvedValue({ ok: true, connectors }),
  } as unknown as DaemonClient;
}

describe('executeList', () => {
  it('returns formatted table of connectors', async () => {
    const client = mockClient([
      { key: 'test/cmd', description: 'Test command', access: 'read',
        domains: ['example.com'], capabilities: ['navigate'] },
    ]);
    const output = await executeList(client);
    expect(output).toContain('test/cmd');
    expect(output).toContain('Test command');
    expect(output).toContain('read');
  });

  it('returns message when no connectors', async () => {
    const client = mockClient([]);
    const output = await executeList(client);
    expect(output).toContain('No connectors');
  });

  it('returns error on failure', async () => {
    const client = {
      get: vi.fn().mockRejectedValue(new Error('Cannot connect to daemon')),
    } as unknown as DaemonClient;
    const output = await executeList(client);
    expect(output).toContain('Error');
  });
});
