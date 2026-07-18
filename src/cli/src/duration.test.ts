// src/duration.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { parseDuration } from './duration.js';

describe('parseDuration', () => {
  afterEach(() => { vi.useRealTimers(); });

  it('parses days', () => {
    vi.useFakeTimers({ now: new Date('2026-06-24T12:00:00Z') });
    const d = parseDuration('7d');
    expect(d.toISOString()).toBe('2026-06-17T12:00:00.000Z');
  });

  it('parses weeks', () => {
    vi.useFakeTimers({ now: new Date('2026-06-24T12:00:00Z') });
    const d = parseDuration('2w');
    expect(d.toISOString()).toBe('2026-06-10T12:00:00.000Z');
  });

  it('parses hours', () => {
    vi.useFakeTimers({ now: new Date('2026-06-24T12:00:00Z') });
    const d = parseDuration('12h');
    expect(d.toISOString()).toBe('2026-06-24T00:00:00.000Z');
  });

  it('parses minutes', () => {
    vi.useFakeTimers({ now: new Date('2026-06-24T12:00:00Z') });
    const d = parseDuration('30m');
    expect(d.toISOString()).toBe('2026-06-24T11:30:00.000Z');
  });

  it('throws for invalid format', () => {
    expect(() => parseDuration('abc')).toThrow('Invalid duration');
  });

  it('throws for zero value', () => {
    expect(() => parseDuration('0d')).toThrow('Invalid duration');
  });
});
