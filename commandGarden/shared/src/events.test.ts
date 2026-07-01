import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  AUDIT_EVENT_TYPES,
  type AuditEvent,
  type AuditEventType,
  createAuditEvent,
  redactArgs,
} from './events';

describe('AUDIT_EVENT_TYPES', () => {
  it('defines exactly 8 event types', () => {
    expect(AUDIT_EVENT_TYPES).toHaveLength(8);
  });

  it('includes all expected types', () => {
    expect(AUDIT_EVENT_TYPES).toContain('command.start');
    expect(AUDIT_EVENT_TYPES).toContain('command.success');
    expect(AUDIT_EVENT_TYPES).toContain('command.error');
    expect(AUDIT_EVENT_TYPES).toContain('command.denied');
  });

  it('includes new event types', () => {
    expect(AUDIT_EVENT_TYPES).toContain('auth.failed');
    expect(AUDIT_EVENT_TYPES).toContain('approval.granted');
    expect(AUDIT_EVENT_TYPES).toContain('approval.rejected');
    expect(AUDIT_EVENT_TYPES).toContain('config.changed');
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

describe('createAuditEvent — new fields', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-23T12:00:00Z'));
  });
  afterEach(() => { vi.useRealTimers(); });

  it('includes correlationId when provided', () => {
    const event = createAuditEvent({
      type: 'command.start', connector: 'a/b', correlationId: 'corr-1',
    });
    expect(event.correlationId).toBe('corr-1');
  });

  it('includes connectorHash when provided', () => {
    const event = createAuditEvent({
      type: 'command.start', connector: 'a/b', connectorHash: 'abc123',
    });
    expect(event.connectorHash).toBe('abc123');
  });

  it('includes steps when provided', () => {
    const steps = [{ step: 'navigate', index: 0, durationMs: 100 }];
    const event = createAuditEvent({
      type: 'command.success', connector: 'a/b', steps,
    });
    expect(event.steps).toEqual(steps);
  });

  it('includes source, previousValue, newValue for config.changed', () => {
    const event = createAuditEvent({
      type: 'config.changed', connector: '_system/config',
      source: 'security.approvedHighRisk', previousValue: '[]', newValue: '["a/b"]',
    });
    expect(event.source).toBe('security.approvedHighRisk');
    expect(event.previousValue).toBe('[]');
    expect(event.newValue).toBe('["a/b"]');
  });
});

describe('redactArgs', () => {
  it('redacts keys matching sensitive pattern', () => {
    const result = redactArgs({ token: 'abc', password: '123', month: '2026-06' });
    expect(result.token).toBe('[REDACTED]');
    expect(result.password).toBe('[REDACTED]');
    expect(result.month).toBe('2026-06');
  });

  it('is case-insensitive', () => {
    const result = redactArgs({ API_KEY: 'xyz', Secret: 'shhh' });
    expect(result.API_KEY).toBe('[REDACTED]');
    expect(result.Secret).toBe('[REDACTED]');
  });

  it('passes through non-matching keys', () => {
    const result = redactArgs({ month: '2026-06', room: 'Vista' });
    expect(result).toEqual({ month: '2026-06', room: 'Vista' });
  });

  it('handles empty args', () => {
    expect(redactArgs({})).toEqual({});
  });
});

describe('createAuditEvent — auto-redaction', () => {
  it('redacts sensitive args automatically', () => {
    const event = createAuditEvent({
      type: 'command.start', connector: 'a/b',
      args: { token: 'secret-value', month: '2026-06' },
    });
    expect(event.args.token).toBe('[REDACTED]');
    expect(event.args.month).toBe('2026-06');
  });
});
