export type PaceStatus = 'reached' | 'on_track' | 'behind' | 'at_risk';

export interface GoalProgress {
  status: PaceStatus;
  percentage: number;
  daysRemaining: number;
  hoursPerDayNeeded: number;
  workingDaysTotal: number;
  workingDaysElapsed: number;
  workingDaysRemaining: number;
}

function isWeekday(date: Date): boolean {
  const day = date.getDay();
  return day !== 0 && day !== 6;
}

export function workingDaysInMonth(month: string): number {
  const [y, m] = month.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  let count = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    if (isWeekday(new Date(y, m - 1, d))) count++;
  }
  return count;
}

export function workingDaysElapsed(month: string, todayStr: string): number {
  const [y, m] = month.split('-').map(Number);
  const today = new Date(todayStr + 'T00:00:00');
  const lastDay = new Date(y, m, 0);
  const end = today > lastDay ? lastDay : today;

  let count = 0;
  for (let d = 1; d <= end.getDate(); d++) {
    const date = new Date(y, m - 1, d);
    if (date > end) break;
    if (isWeekday(date)) count++;
  }
  return count;
}

export function computeGoalProgress(input: {
  targetHours: number;
  actualHours: number;
  month: string;
  today: string;
}): GoalProgress {
  const { targetHours, actualHours, month, today } = input;
  const wdTotal = workingDaysInMonth(month);
  const wdElapsed = workingDaysElapsed(month, today);
  const wdRemaining = wdTotal - wdElapsed;

  const percentage = targetHours > 0 ? (actualHours / targetHours) * 100 : 0;
  const daysRemaining = Math.max(0, (targetHours - actualHours) / 8);

  if (actualHours >= targetHours) {
    return { status: 'reached', percentage, daysRemaining: 0, hoursPerDayNeeded: 0, workingDaysTotal: wdTotal, workingDaysElapsed: wdElapsed, workingDaysRemaining: wdRemaining };
  }

  const expectedHours = wdTotal > 0 ? (targetHours / wdTotal) * wdElapsed : 0;
  const hoursPerDayNeeded = wdRemaining > 0 ? Math.max(0, (targetHours - actualHours) / wdRemaining) : 0;

  let status: PaceStatus;
  if (actualHours >= expectedHours) {
    status = 'on_track';
  } else if (wdTotal > 0 && wdElapsed / wdTotal < 0.8) {
    status = 'behind';
  } else {
    status = 'at_risk';
  }

  return { status, percentage, daysRemaining, hoursPerDayNeeded, workingDaysTotal: wdTotal, workingDaysElapsed: wdElapsed, workingDaysRemaining: wdRemaining };
}
