import { useMemo } from 'react';
import { allDaysInMonth } from '../lib/goals';

interface MonthCalendarGridProps {
  month: string;
  today: string;
  dailyTotalHours: Map<string, number>;
}

const DAY_HEADERS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

interface CalendarWeek {
  cells: (CalendarDay | null)[];
}

interface CalendarDay {
  date: string;
  dayNum: number;
  isWeekday: boolean;
  hours: number;
  isPast: boolean;
  isToday: boolean;
}

function buildWeeks(month: string, today: string, dailyTotalHours: Map<string, number>): CalendarWeek[] {
  const days = allDaysInMonth(month);
  if (days.length === 0) return [];

  const firstDate = new Date(days[0].date + 'T00:00:00');
  let startDow = firstDate.getDay();
  // Convert Sunday=0 to Monday-start (Mon=0, Tue=1, ..., Sun=6)
  startDow = startDow === 0 ? 6 : startDow - 1;

  const calendarDays: (CalendarDay | null)[] = [];

  // Pad the beginning with nulls
  for (let i = 0; i < startDow; i++) {
    calendarDays.push(null);
  }

  for (const day of days) {
    const hours = dailyTotalHours.get(day.date) ?? 0;
    const dayNum = parseInt(day.date.slice(8), 10);
    calendarDays.push({
      date: day.date,
      dayNum,
      isWeekday: day.isWeekday,
      hours,
      isPast: day.date < today,
      isToday: day.date === today,
    });
  }

  // Pad the end to complete the last week
  while (calendarDays.length % 7 !== 0) {
    calendarDays.push(null);
  }

  const weeks: CalendarWeek[] = [];
  for (let i = 0; i < calendarDays.length; i += 7) {
    weeks.push({ cells: calendarDays.slice(i, i + 7) });
  }
  return weeks;
}

function intensityClass(hours: number, maxHours: number): string {
  if (hours <= 0 || maxHours <= 0) return '';
  const ratio = hours / maxHours;
  if (ratio >= 0.85) return 'bg-primary/25';
  if (ratio >= 0.6) return 'bg-primary/18';
  if (ratio >= 0.35) return 'bg-primary/12';
  return 'bg-primary/7';
}

export function MonthCalendarGrid({ month, today, dailyTotalHours }: MonthCalendarGridProps) {
  const weeks = useMemo(() => buildWeeks(month, today, dailyTotalHours), [month, today, dailyTotalHours]);

  const maxHours = useMemo(() => {
    let max = 0;
    for (const h of dailyTotalHours.values()) {
      if (h > max) max = h;
    }
    return max || 8;
  }, [dailyTotalHours]);

  return (
    <div className="mb-6">
      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 border-b border-base-300">
        {DAY_HEADERS.map((label, i) => (
          <div
            key={label}
            className={`py-1.5 text-center font-mono text-[0.6rem] font-medium uppercase tracking-[0.1em] ${
              i >= 5 ? 'opacity-30' : 'opacity-50'
            }`}
          >
            {label}
          </div>
        ))}
      </div>

      {/* Week rows */}
      <div className="border border-base-300 border-t-0">
        {weeks.map((week, wi) => (
          <div
            key={wi}
            className={`grid grid-cols-7 ${wi > 0 ? 'border-t border-base-300' : ''}`}
          >
            {week.cells.map((cell, ci) => {
              if (!cell) {
                return (
                  <div
                    key={`empty-${wi}-${ci}`}
                    className="h-12 border-r border-base-300 last:border-r-0"
                  />
                );
              }

              const isWeekend = ci >= 5;
              const hasHours = cell.hours > 0;
              const showGap = cell.isPast && !hasHours && cell.isWeekday;

              let cellBg = '';
              if (cell.isToday) {
                cellBg = hasHours ? intensityClass(cell.hours, maxHours) : '';
              } else if (hasHours) {
                cellBg = intensityClass(cell.hours, maxHours);
              } else if (showGap) {
                cellBg = 'bg-warning/5';
              }

              return (
                <div
                  key={cell.date}
                  className={`relative h-12 px-1.5 py-1 border-r border-base-300 last:border-r-0 flex flex-col justify-between ${cellBg} ${
                    isWeekend ? 'opacity-40' : ''
                  } ${cell.isToday ? 'ring-1 ring-inset ring-primary' : ''}`}
                >
                  <span
                    className={`font-mono text-[0.65rem] leading-none ${
                      cell.isToday ? 'font-bold text-primary' : 'opacity-60'
                    }`}
                  >
                    {cell.dayNum}
                  </span>
                  {hasHours && (
                    <span className="font-mono text-[0.7rem] font-semibold leading-none text-right">
                      {cell.hours % 1 === 0 ? cell.hours : (Math.round(cell.hours * 10) / 10)}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
