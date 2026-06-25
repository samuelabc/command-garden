// src/commands/audit.test.ts
import { describe, it, expect, vi } from 'vitest';
import { executeAuditList, executeAuditExport } from './audit.js';
import type { DaemonClient } from '../client.js';

const EVENTS = [
  {
    id: 'evt-1', timestamp: '2026-06-24T10:00:00Z', type: 'command.success',
    user: 'alice', connector: 'test/cmd', args: {}, domains: ['example.com'],
    capabilities: ['navigate'], rowCount: 5, durationMs: 120,
  },
  {
    id: 'evt-2', timestamp: '2026-06-24T09:00:00Z', type: 'command.denied',
    user: 'bob', connector: 'test/other', args: {}, domains: [],
    capabilities: [], durationMs: 0, denialReason: 'Not found',
  },
];

function mockClient(events = EVENTS): DaemonClient {
  return {
    get: vi.fn().mockResolvedValue({ ok: true, events, count: events.length }),
  } as unknown as DaemonClient;
}

describe('executeAuditList', () => {
  it('displays audit events in table', async () => {
    const client = mockClient();
    const output = await executeAuditList(client, {});
    expect(output).toContain('command.success');
    expect(output).toContain('test/cmd');
    expect(output).toContain('alice');
  });

  it('passes since parameter', async () => {
    const client = mockClient();
    await executeAuditList(client, { since: '2026-06-24T00:00:00.000Z' });
    expect(client.get).toHaveBeenCalledWith(
      expect.stringContaining('since=2026-06-24'),
    );
  });

  it('passes connector filter', async () => {
    const client = mockClient();
    await executeAuditList(client, { connector: 'test/*' });
    expect(client.get).toHaveBeenCalledWith(
      expect.stringContaining('connector=test'),
    );
  });

  it('shows message for no events', async () => {
    const client = mockClient([]);
    const output = await executeAuditList(client, {});
    expect(output).toContain('No audit events');
  });

  it('returns error on failure', async () => {
    const client = {
      get: vi.fn().mockRejectedValue(new Error('Cannot connect')),
    } as unknown as DaemonClient;
    const output = await executeAuditList(client, {});
    expect(output).toContain('Error');
  });
});

describe('executeAuditExport', () => {
  it('exports events as JSON', async () => {
    const client = mockClient();
    const output = await executeAuditExport(client, {}, 'json');
    const parsed = JSON.parse(output);
    expect(parsed.events).toHaveLength(2);
  });

  it('exports events as CSV', async () => {
    const client = mockClient();
    const output = await executeAuditExport(client, {}, 'csv');
    expect(output).toContain('timestamp');
    expect(output).toContain('command.success');
  });
});
