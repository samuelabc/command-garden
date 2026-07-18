/**
 * Daily breakdown table — shows per-day hours, meetings, commits, tickets.
 * Ported from dashboard/web/components/journal/DailyBreakdown.tsx.
 * Removed 'use client' directive (not needed in Vite React).
 * Highlights gap days (activity but 0 hours logged) with a warning background.
 */

import type { JournalResponse } from '../../types/journal';

interface Props {
  data: JournalResponse;
  /** Monday of the selected week (YYYY-MM-DD) — used to always render the
   *  full Mon-Fri range, even for days with zero activity across every source. */
  weekStart: string;
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

function weekdayLabel(dateStr: string): string {
  const day = new Date(dateStr).getDay();
  return WEEKDAYS[day - 1] ?? dateStr;
}

export function DailyBreakdown({ data, weekStart }: Props) {
  const { timetracking, meetings, git, jira } = data;

  // Always include every weekday (Mon-Fri) of the selected week so days with
  // zero activity across all sources still show up as empty rows, instead of
  // silently disappearing (they'd otherwise never be added to the set below).
  const dates = new Set<string>();
  const cursor = new Date(weekStart + 'T00:00:00');
  for (let i = 0; i < 5; i++) {
    const y = cursor.getFullYear();
    const m = String(cursor.getMonth() + 1).padStart(2, '0');
    const d = String(cursor.getDate()).padStart(2, '0');
    dates.add(`${y}-${m}-${d}`);
    cursor.setDate(cursor.getDate() + 1);
  }

  // Also fold in any dates with actual data (weekends included).
  timetracking?.daily.forEach((d) => dates.add(d.date));
  meetings?.daily.forEach((d) => dates.add(d.date));
  git?.daily.forEach((d) => dates.add(d.date));

  // Bound everything to the selected week — guards against a stale `data`
  // prop (e.g. from a week that was generated before the picker moved)
  // leaking dates from a different week into this table.
  const weekEndDate = new Date(weekStart + 'T00:00:00');
  weekEndDate.setDate(weekEndDate.getDate() + 6);
  const weekEnd = weekEndDate.toISOString().slice(0, 10);

  const sortedDates = [...dates]
    .filter((date) => date >= weekStart && date <= weekEnd)
    .sort()
    .filter((date) => {
      const day = new Date(date + 'T00:00:00').getDay();
      if (day === 0 || day === 6) {
        // Weekend: only show if there's actual data for this day
        const hasData =
          timetracking?.daily.some((d) => d.date === date && d.hours > 0) ||
          meetings?.daily.some((d) => d.date === date && d.count > 0) ||
          git?.daily.some((d) => d.date === date && d.commits > 0);
        return hasData;
      }
      return true;
    });

  // Compute totals for the footer row
  const totalHours = timetracking?.totalHours ?? 0;
  const totalMeetings = meetings?.totalCount ?? 0;
  const totalMeetingHours = meetings?.totalHours ?? 0;
  const totalCommits = git?.totalCommits ?? 0;
  const totalTickets = jira?.resolved.length ?? 0;

  if (sortedDates.length === 0) {
    return <div className="text-base-content/60">No daily data available.</div>;
  }

  return (
    <div className="overflow-x-auto border border-base-300">
      <table className="table table-sm w-full">
        <thead>
          <tr className="font-mono text-[0.6rem] uppercase tracking-[0.1em] opacity-50">
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
        {/* Totals row */}
        <tfoot>
          <tr className="font-semibold border-t border-base-300">
            <td colSpan={2}>Total</td>
            <td>{totalHours > 0 ? `${totalHours}h` : '—'}</td>
            <td>{totalMeetings > 0 ? `${totalMeetings} (${totalMeetingHours}h)` : '—'}</td>
            <td>{totalCommits}</td>
            <td className="text-xs">{totalTickets > 0 ? `${totalTickets} done` : '—'}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
