import { workingDaysInMonth, workingDaysElapsed, computeGoalProgress } from './goals';

describe('workingDaysInMonth', () => {
  it('TC-PACE-1: June 2026 has 22 weekdays', () => {
    expect(workingDaysInMonth('2026-06')).toBe(22);
  });

  it('February 2026 has 20 weekdays', () => {
    expect(workingDaysInMonth('2026-02')).toBe(20);
  });
});

describe('workingDaysElapsed', () => {
  it('TC-PACE-2: June 1-16 2026 (Mon-Tue) = 12 weekdays', () => {
    expect(workingDaysElapsed('2026-06', '2026-06-16')).toBe(12);
  });

  it('TC-PACE-3: past month → all working days elapsed', () => {
    expect(workingDaysElapsed('2026-05', '2026-06-16')).toBe(21);
  });

  it('first day of month = 1 if weekday, 0 if weekend', () => {
    expect(workingDaysElapsed('2026-06', '2026-06-01')).toBe(1);
  });
});

describe('computeGoalProgress', () => {
  it('TC-PACE-4: returns reached when actual >= target', () => {
    const result = computeGoalProgress({ targetHours: 100, actualHours: 100, month: '2026-06', today: '2026-06-16' });
    expect(result.status).toBe('reached');
    expect(result.daysRemaining).toBe(0);
  });

  it('TC-PACE-5: returns on_track when actual >= expected pace', () => {
    // expected = (176/22)*12 = 96, so 100 >= 96 → on_track
    const result = computeGoalProgress({ targetHours: 176, actualHours: 100, month: '2026-06', today: '2026-06-16' });
    expect(result.status).toBe('on_track');
  });

  it('returns behind when behind pace but < 80% elapsed', () => {
    const result = computeGoalProgress({ targetHours: 176, actualHours: 20, month: '2026-06', today: '2026-06-05' });
    expect(result.status).toBe('behind');
  });

  it('returns at_risk when behind pace and >= 80% elapsed', () => {
    const result = computeGoalProgress({ targetHours: 176, actualHours: 80, month: '2026-06', today: '2026-06-26' });
    expect(result.status).toBe('at_risk');
  });

  it('TC-PACE-6: hoursPerDayNeeded is 0 when goal reached', () => {
    const result = computeGoalProgress({ targetHours: 100, actualHours: 120, month: '2026-06', today: '2026-06-16' });
    expect(result.hoursPerDayNeeded).toBe(0);
    expect(result.daysRemaining).toBe(0);
  });

  it('computes correct hoursPerDayNeeded', () => {
    // 22 working days, 12 elapsed, 10 remaining, target 132h, actual 80h → need 52h / 10d = 5.2
    const result = computeGoalProgress({ targetHours: 132, actualHours: 80, month: '2026-06', today: '2026-06-16' });
    expect(result.hoursPerDayNeeded).toBeCloseTo(5.2, 2);
    expect(result.daysRemaining).toBeCloseTo(6.5, 1);
    expect(result.percentage).toBeCloseTo(60.6, 0);
  });
});
