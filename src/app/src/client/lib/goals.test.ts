import { describe, it, expect } from 'vitest';
import { workingDaysInMonth, workingDayDates, workingDaysElapsed, computeGoalProgress } from './goals.js';

describe('workingDaysInMonth', () => {
  it('counts weekdays in a standard month', () => {
    // July 2026: 31 days, starts Wednesday → 23 working days
    expect(workingDaysInMonth('2026-07')).toBe(23);
  });

  it('handles February in a non-leap year', () => {
    // Feb 2025: 28 days, starts Saturday → 20 working days
    expect(workingDaysInMonth('2025-02')).toBe(20);
  });

  it('handles February in a leap year', () => {
    // Feb 2024: 29 days, starts Thursday → 21 working days
    expect(workingDaysInMonth('2024-02')).toBe(21);
  });

  it('handles a month starting on Saturday', () => {
    // June 2025: 30 days, starts Sunday → 21 working days
    expect(workingDaysInMonth('2025-06')).toBe(21);
  });
});

describe('workingDayDates', () => {
  it('returns ISO date strings for weekdays only', () => {
    const dates = workingDayDates('2026-07');
    expect(dates.length).toBe(23);
    expect(dates[0]).toBe('2026-07-01');
    expect(dates[dates.length - 1]).toBe('2026-07-31');
    for (const d of dates) {
      const dow = new Date(d + 'T00:00:00').getDay();
      expect(dow).not.toBe(0);
      expect(dow).not.toBe(6);
    }
  });

  it('matches workingDaysInMonth count', () => {
    for (const m of ['2026-01', '2026-02', '2026-06', '2026-12']) {
      expect(workingDayDates(m).length).toBe(workingDaysInMonth(m));
    }
  });
});

describe('workingDaysElapsed', () => {
  it('counts weekdays up to today mid-month', () => {
    // 2026-07-10 is a Friday; working days 1–10 excluding weekends = 8
    expect(workingDaysElapsed('2026-07', '2026-07-10')).toBe(8);
  });

  it('caps at end of month when today is past it', () => {
    expect(workingDaysElapsed('2026-07', '2026-08-15')).toBe(23);
  });

  it('returns 0 when today is before the month starts', () => {
    expect(workingDaysElapsed('2026-07', '2026-06-30')).toBe(0);
  });

  it('counts correctly when today falls on a weekend', () => {
    // 2026-07-11 is Saturday → same as Friday the 10th
    expect(workingDaysElapsed('2026-07', '2026-07-11')).toBe(8);
  });
});

describe('computeGoalProgress', () => {
  const baseInput = {
    targetHours: 80,
    month: '2026-07',
  };

  it('returns "reached" when actual >= target', () => {
    const result = computeGoalProgress({
      ...baseInput,
      actualHours: 80,
      today: '2026-07-15',
    });
    expect(result.status).toBe('reached');
    expect(result.percentage).toBe(100);
    expect(result.daysRemaining).toBe(0);
    expect(result.hoursPerDayNeeded).toBe(0);
    expect(result.surplusHours).toBeGreaterThan(0);
  });

  it('returns "on_track" when actual >= expected pace', () => {
    // At day 10 (8 working days elapsed) of 23 total, expected = 80 * 8/23 ≈ 27.8h
    const result = computeGoalProgress({
      ...baseInput,
      actualHours: 30,
      today: '2026-07-10',
    });
    expect(result.status).toBe('on_track');
    expect(result.surplusHours).toBeGreaterThan(0);
  });

  it('returns "behind" when below pace but < 80% through month', () => {
    // At day 10, expected ≈ 27.8h, actual = 20 → behind but only 8/23 ≈ 35% through
    const result = computeGoalProgress({
      ...baseInput,
      actualHours: 20,
      today: '2026-07-10',
    });
    expect(result.status).toBe('behind');
    expect(result.surplusHours).toBeLessThan(0);
  });

  it('returns "at_risk" when below pace and >= 80% through month', () => {
    // At day 28 (20 working days elapsed), expected = 80 * 20/23 ≈ 69.6h, actual = 50
    // 20/23 ≈ 87% through → at_risk
    const result = computeGoalProgress({
      ...baseInput,
      actualHours: 50,
      today: '2026-07-28',
    });
    expect(result.status).toBe('at_risk');
    expect(result.surplusHours).toBeLessThan(0);
  });

  it('computes expectedHours proportionally', () => {
    const result = computeGoalProgress({
      ...baseInput,
      actualHours: 0,
      today: '2026-07-10',
    });
    const wdElapsed = workingDaysElapsed('2026-07', '2026-07-10');
    const wdTotal = workingDaysInMonth('2026-07');
    expect(result.expectedHours).toBeCloseTo((80 / wdTotal) * wdElapsed);
  });

  it('computes surplusHours as actual minus expected', () => {
    const result = computeGoalProgress({
      ...baseInput,
      actualHours: 40,
      today: '2026-07-15',
    });
    expect(result.surplusHours).toBeCloseTo(40 - result.expectedHours);
  });

  it('computes hoursPerDayNeeded from remaining', () => {
    const result = computeGoalProgress({
      ...baseInput,
      actualHours: 40,
      today: '2026-07-15',
    });
    expect(result.hoursPerDayNeeded).toBeCloseTo(
      (80 - 40) / result.workingDaysRemaining,
    );
  });

  it('handles zero target hours gracefully', () => {
    const result = computeGoalProgress({
      targetHours: 0,
      actualHours: 0,
      month: '2026-07',
      today: '2026-07-10',
    });
    expect(result.percentage).toBe(0);
    expect(result.expectedHours).toBe(0);
  });
});
