// src/audit-store.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AuditStore } from './audit-store.js';
import { createAuditEvent } from '@commandgarden/shared';

describe('AuditStore', () => {
  let store: AuditStore;

  beforeEach(() => {
    store = new AuditStore(':memory:');
  });
  afterEach(() => { store.close(); });

  it('initializes without error', () => {
    expect(store).toBeDefined();
  });

  it('inserts and retrieves an event', () => {
    const evt = createAuditEvent({ type: 'command.start', connector: 'test/cmd', user: 'alice' });
    store.insert(evt);
    const all = store.list();
    expect(all).toHaveLength(1);
    expect(all[0].connector).toBe('test/cmd');
    expect(all[0].user).toBe('alice');
  });

  it('preserves JSON fields (args, domains, capabilities)', () => {
    const evt = createAuditEvent({
      type: 'command.success', connector: 'a/b', user: 'bob',
      args: { month: '2026-06' }, domains: ['example.com'], capabilities: ['navigate'],
      rowCount: 5, columns: ['date'], durationMs: 100,
    });
    store.insert(evt);
    const [row] = store.list();
    expect(row.args).toEqual({ month: '2026-06' });
    expect(row.domains).toEqual(['example.com']);
    expect(row.capabilities).toEqual(['navigate']);
    expect(row.rowCount).toBe(5);
    expect(row.columns).toEqual(['date']);
  });

  it('filters by connector pattern', () => {
    store.insert(createAuditEvent({ type: 'command.start', connector: 'site/a', user: 'u' }));
    store.insert(createAuditEvent({ type: 'command.start', connector: 'site/b', user: 'u' }));
    store.insert(createAuditEvent({ type: 'command.start', connector: 'other/c', user: 'u' }));
    const results = store.list({ connector: 'site/*' });
    expect(results).toHaveLength(2);
  });

  it('filters by since date', () => {
    const old = createAuditEvent({ type: 'command.start', connector: 'a/b', user: 'u' });
    old.timestamp = '2020-01-01T00:00:00.000Z';
    store.insert(old);
    store.insert(createAuditEvent({ type: 'command.start', connector: 'a/b', user: 'u' }));
    const results = store.list({ since: new Date('2025-01-01') });
    expect(results).toHaveLength(1);
  });

  it('prunes old events', () => {
    const old = createAuditEvent({ type: 'command.start', connector: 'a/b', user: 'u' });
    old.timestamp = '2020-01-01T00:00:00.000Z';
    store.insert(old);
    store.insert(createAuditEvent({ type: 'command.start', connector: 'a/b', user: 'u' }));
    const pruned = store.prune(90);
    expect(pruned).toBe(1);
    expect(store.list()).toHaveLength(1);
  });

  it('respects limit option', () => {
    for (let i = 0; i < 5; i++) {
      store.insert(createAuditEvent({ type: 'command.start', connector: `a/${i}`, user: 'u' }));
    }
    expect(store.list({ limit: 3 })).toHaveLength(3);
  });
});
