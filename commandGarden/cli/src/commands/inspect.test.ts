// src/commands/inspect.test.ts
import { describe, it, expect, vi } from 'vitest';
import { executeInspect } from './inspect.js';
import type { DaemonClient } from '../client.js';

describe('executeInspect', () => {
  it('displays full connector details', async () => {
    const connector = {
      site: 'test', name: 'cmd', version: '1.0', description: 'A test connector',
      access: 'read', domains: ['example.com'], capabilities: ['navigate', 'dom_read'],
      args: [{ name: 'month', type: 'string', required: false, help: 'Month in YYYY-MM' }],
      columns: [{ name: 'date', type: 'string' }, { name: 'hours', type: 'number' }],
      pipeline: [{ step: 'navigate', url: 'https://example.com' }],
    };
    const client = {
      get: vi.fn().mockResolvedValue({ ok: true, connector }),
    } as unknown as DaemonClient;

    const output = await executeInspect(client, 'test/cmd');
    expect(output).toContain('test/cmd');
    expect(output).toContain('A test connector');
    expect(output).toContain('navigate');
    expect(output).toContain('dom_read');
    expect(output).toContain('month');
    expect(output).toContain('YYYY-MM');
    expect(output).toContain('date');
    expect(output).toContain('hours');
  });

  it('returns error for unknown connector', async () => {
    const client = {
      get: vi.fn().mockRejectedValue(new Error('Connector "no/such" not found')),
    } as unknown as DaemonClient;
    const output = await executeInspect(client, 'no/such');
    expect(output).toContain('Error');
    expect(output).toContain('not found');
  });

  it('validates connector key format', async () => {
    const client = { get: vi.fn() } as unknown as DaemonClient;
    const output = await executeInspect(client, 'invalid');
    expect(output).toContain('Invalid connector key');
  });
});
