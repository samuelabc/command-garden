import { describe, it, expect } from 'vitest';
import { timeAgo } from './time-ago.js';

describe('timeAgo', () => {
  const now = 1_700_000_000_000;

  it('returns "just now" for < 60 seconds', () => {
    expect(timeAgo(now - 5_000, now)).toBe('just now');
    expect(timeAgo(now - 59_000, now)).toBe('just now');
  });

  it('returns minutes for 1–59 min', () => {
    expect(timeAgo(now - 60_000, now)).toBe('1m ago');
    expect(timeAgo(now - 120_000, now)).toBe('2m ago');
    expect(timeAgo(now - 59 * 60_000, now)).toBe('59m ago');
  });

  it('returns hours for 1–23 h', () => {
    expect(timeAgo(now - 3_600_000, now)).toBe('1h ago');
    expect(timeAgo(now - 7_200_000, now)).toBe('2h ago');
    expect(timeAgo(now - 23 * 3_600_000, now)).toBe('23h ago');
  });

  it('returns days for >= 24 h', () => {
    expect(timeAgo(now - 86_400_000, now)).toBe('1d ago');
    expect(timeAgo(now - 7 * 86_400_000, now)).toBe('7d ago');
  });
});
