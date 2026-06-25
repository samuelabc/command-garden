import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  AUDIT_EVENT_TYPES,
  type AuditEvent,
  type AuditEventType,
  createAuditEvent,
} from './events';

describe('AUDIT_EVENT_TYPES', () => {
  it('defines exactly 4 event types', () => {
    expect(AUDIT_EVENT_TYPES).toHaveLength(4);
  });

  it('includes all expected types', () => {
    expect(AUDIT_EVENT_TYPES).toContain('command.start');
    expect(AUDIT_EVENT_TYPES).toContain('command.success');
    expect(AUDIT_EVENT_TYPES).toContain('command.error');
    expect(AUDIT_EVENT_TYPES).toContain('command.denied');
  });
});

describe('createAuditEvent', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-23T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('creates an event with required fields', () => {
    const event = createAuditEvent({
      type: 'command.start',
      connector: 'timetracking/report',
    });
    expect(event.type).toBe('command.start');
    expect(event.connector).toBe('timetracking/report');
    expect(event.id).toBeTruthy();
    expect(event.timestamp).toBe('2026-06-23T12:00:00.000Z');
  });

  it('sets default empty values for optional fields', () => {
    const event = createAuditEvent({
      type: 'command.success',
      connector: 'test/cmd',
    });
    expect(event.args).toEqual({});
    expect(event.domains).toEqual([]);
    expect(event.capabilities).toEqual([]);
    expect(event.durationMs).toBe(0);
  });

  it('allows overriding all fields', () => {
    const event = createAuditEvent({
      type: 'command.success',
      connector: 'test/cmd',
      args: { month: '2026-06' },
      domains: ['example.com'],
      capabilities: ['navigate'],
      rowCount: 42,
      columns: ['date', 'hours'],
      durationMs: 1500,
    });
    expect(event.args).toEqual({ month: '2026-06' });
    expect(event.domains).toEqual(['example.com']);
    expect(event.rowCount).toBe(42);
    expect(event.durationMs).toBe(1500);
  });

  it('includes error and denialReason when provided', () => {
    const event = createAuditEvent({
      type: 'command.denied',
      connector: 'test/cmd',
      denialReason: 'Domain not approved',
    });
    expect(event.denialReason).toBe('Domain not approved');
  });

  it('generates unique IDs', () => {
    const e1 = createAuditEvent({ type: 'command.start', connector: 'a/b' });
    const e2 = createAuditEvent({ type: 'command.start', connector: 'a/b' });
    expect(e1.id).not.toBe(e2.id);
  });
});
