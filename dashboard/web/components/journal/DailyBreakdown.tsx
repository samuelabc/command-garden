'use client';
import type { JournalResponse } from '@/lib/types';

interface Props {
  data: JournalResponse;
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

function weekdayLabel(dateStr: string): string {
  const day = new Date(dateStr).getDay();
  return WEEKDAYS[day - 1] ?? dateStr;
}

export function DailyBreakdown({ data }: Props) {
  const { timetracking, meetings, git, jira } = data;

  // Build a list of dates from whichever source has data
  const dates = new Set<string>();
  timetracking?.daily.forEach((d) => dates.add(d.date));
  meetings?.daily.forEach((d) => dates.add(d.date));
  git?.daily.forEach((d) => dates.add(d.date));
  const sortedDates = [...dates].sort();

  if (sortedDates.length === 0) {
    return <div className="text-base-content/60">No daily data available.</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="table table-sm">
        <thead>
          <tr>
            <th>Day</th>
            <th>Date</th>
            <th>Hours Logged</th>
            <th>Meetings</th>
            <th>Commits</th>
            <th>Tickets</th>
          </tr>
        </thead>
        <tbody>
          {sortedDates.map((date) => {
            const ttDay = timetracking?.daily.find((d) => d.date === date);
            const mtgDay = meetings?.daily.find((d) => d.date === date);
            const gitDay = git?.daily.find((d) => d.date === date);
            const isGap = timetracking?.gaps.includes(date);

            // Tickets resolved on this date
            const ticketsDone = jira?.resolved.filter((t) => t.resolvedDate === date) ?? [];

            return (
              <tr key={date} className={isGap ? 'bg-warning/10' : ''}>
                <td className="font-medium">{weekdayLabel(date)}</td>
                <td className="text-xs text-base-content/60">{date}</td>
                <td>
                  <span className={isGap ? 'text-warning font-semibold' : ''}>
                    {ttDay ? `${ttDay.hours}h` : '—'}
                  </span>
                  {isGap && <span className="ml-1 text-warning text-xs">⚠</span>}
                </td>
                <td>
                  {mtgDay ? `${mtgDay.count} (${mtgDay.hours}h)` : '—'}
                </td>
                <td>{gitDay ? `${gitDay.commits}` : '0'}</td>
                <td className="text-xs">
                  {ticketsDone.length > 0
                    ? ticketsDone.map((t) => t.key).join(', ')
                    : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
