import { useMemo } from 'react';
import { workingDayDates } from '../lib/goals';

interface MonthCalendarStripProps {
  month: string;
  today: string;
  dailyTotalHours: Map<string, number>;
}

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

interface WeekGroup {
  label: string;
  days: string[];
}

function groupByWeek(dates: string[]): WeekGroup[] {
  if (dates.length === 0) return [];

  const weeks: WeekGroup[] = [];
  let current: WeekGroup | null = null;

  for (const dateStr of dates) {
    const d = new Date(dateStr + 'T00:00:00');
    const dow = d.getDay();

    if (dow === 1 || !current) {
      const monday = new Date(d);
      monday.setDate(monday.getDate() - (dow === 0 ? 6 : dow - 1));
      current = {
        label: `${monday.getDate()} ${MONTH_ABBR[monday.getMonth()]}`,
        days: [],
      };
      weeks.push(current);
    }

    current.days.push(dateStr);
  }

  return weeks;
}

export function MonthCalendarStrip({ month, today, dailyTotalHours }: MonthCalendarStripProps) {
  const workingDays = useMemo(() => workingDayDates(month), [month]);
  const weeks = useMemo(() => groupByWeek(workingDays), [workingDays]);

  return (
    <div className="mb-6">
      <div className="flex gap-3">
        {weeks.map((week) => (
          <div key={week.label} className="flex-1 min-w-0">
            <div className="flex gap-px h-5">
              {week.days.map((date) => {
                const hours = dailyTotalHours.get(date) ?? 0;
                const isPast = date < today;
                const isToday = date === today;
                const hasHours = hours > 0;

                let blockClass: string;
                if (isToday) {
                  blockClass = 'bg-primary';
                } else if (isPast && hasHours) {
                  blockClass = 'bg-base-content/60';
                } else if (isPast) {
                  blockClass = 'bg-base-content/15';
                } else {
                  blockClass = 'border border-base-300';
                }

                return (
                  <div
                    key={date}
                    className={`flex-1 ${blockClass}`}
                    title={`${date}: ${hasHours ? `${Math.round(hours * 10) / 10}h` : 'no hours'}`}
                  />
                );
              })}
            </div>
            <div className="font-mono text-[0.55rem] opacity-40 mt-1 truncate">
              {week.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
