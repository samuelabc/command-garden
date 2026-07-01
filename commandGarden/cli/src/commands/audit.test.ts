// src/commands/audit.test.ts
import { describe, it, expect, vi } from 'vitest';
import { executeAuditList, executeAuditExport, executeAuditShow } from './audit.js';
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

describe('executeAuditList — type filter', () => {
  it('passes type parameter', async () => {
    const client = mockClient();
    await executeAuditList(client, { type: 'auth.failed' });
    expect(client.get).toHaveBeenCalledWith(expect.stringContaining('type=auth.failed'));
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

  it('includes correlationId and connectorHash in CSV', async () => {
    const eventsWithSteps = [
      {
        id: 'evt-1', timestamp: '2026-06-24T10:00:00Z', type: 'command.success',
        user: 'alice', connector: 'test/cmd', args: {}, domains: ['example.com'],
        capabilities: ['navigate'], rowCount: 5, durationMs: 120,
        correlationId: 'corr-1', connectorHash: 'abc123',
        steps: [
          { step: 'navigate', index: 0, capability: 'navigate', durationMs: 80 },
          { step: 'extract', index: 1, capability: 'dom_read', durationMs: 40 },
        ],
      },
    ];
    const client = {
      get: vi.fn().mockResolvedValue({ ok: true, events: eventsWithSteps, count: 1 }),
    } as unknown as DaemonClient;
    const output = await executeAuditExport(client, {}, 'csv');
    expect(output).toContain('correlationId');
    expect(output).toContain('connectorHash');
    expect(output).toContain('corr-1');
  });
});

describe('executeAuditShow', () => {
  it('displays full event detail with steps', async () => {
    const event = {
      id: 'evt-1', timestamp: '2026-06-24T10:00:00Z', type: 'command.success',
      user: 'alice', connector: 'test/cmd', args: {}, domains: ['example.com'],
      capabilities: ['navigate'], rowCount: 5, durationMs: 120,
      correlationId: 'corr-1', connectorHash: 'abc123',
      steps: [
        { step: 'navigate', index: 0, capability: 'navigate', durationMs: 80 },
        { step: 'extract', index: 1, capability: 'dom_read', durationMs: 40 },
      ],
    };
    const client = {
      get: vi.fn().mockResolvedValue({ ok: true, event }),
    } as unknown as DaemonClient;
    const output = await executeAuditShow(client, 'evt-1');
    expect(output).toContain('evt-1');
    expect(output).toContain('command.success');
    expect(output).toContain('navigate');
    expect(output).toContain('extract');
    expect(output).toContain('abc123');
  });

  it('returns error for unknown event', async () => {
    const client = {
      get: vi.fn().mockRejectedValue(new Error('Event not found')),
    } as unknown as DaemonClient;
    const output = await executeAuditShow(client, 'no-such');
    expect(output).toContain('Error');
  });
});
