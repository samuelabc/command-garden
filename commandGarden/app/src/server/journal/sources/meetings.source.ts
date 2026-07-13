/**
 * Meetings data source — fetches the user's calendar via the
 * outlook/my-meetings connector through the daemon API.
 *
 * The connector uses CDP Scheduling Assistant + getSchedule interception
 * to bypass the MCAS proxy (see docs/ado-git-commits-fix.md for the
 * Runtime.evaluate CSP bypass that also applies here).
 *
 * The Scheduling Assistant grid renders the whole work week around
 * whichever date it's pointed at, so a single connector call (using any
 * weekday in the target range as an anchor) already returns every day's
 * meetings for that week — no need to call once per weekday. Rows outside
 * [weekStart, weekEnd] (if the connector's week grid doesn't align exactly
 * with our range) are filtered out before aggregating into MeetingsData.
 */

import type { DaemonClient } from '@commandgarden/shared';
import type { MeetingsData, MeetingEntry, MeetingsDaily } from '../journal.types.js';

/** Row shape returned by the outlook/my-meetings connector. */
interface ConnectorRow {
  date: string;
  subject: string;
  start: string;
  end: string;
  durationMin: number;
  state: string;
}

/** Response shape from daemon /api/run. */
interface DaemonRunResponse {
  ok: boolean;
  data?: ConnectorRow[];
  error?: string;
}

export class MeetingsSource {
  constructor(private readonly daemon: DaemonClient) {}

  async fetch(weekStart: string, weekEnd: string): Promise<MeetingsData | null> {
    try {
      // Anchor on the first weekday in range — the connector's single call
      // returns the whole work week's meetings for whichever date it's given.
      const anchorDate = this.firstWeekday(weekStart, weekEnd);
      if (!anchorDate) return null;

      const rows = await this.fetchWeek(anchorDate);
      const allEntries: MeetingEntry[] = rows
        .filter((r) => r.date >= weekStart && r.date <= weekEnd)
        .map((r) => ({
          date: r.date,
          subject: r.subject,
          start: r.start,
          end: r.end,
          durationMin: r.durationMin,
        }));

      if (allEntries.length === 0) return null;

      // Aggregate daily stats
      const dailyMap = new Map<string, MeetingsDaily>();
      for (const e of allEntries) {
        const d = dailyMap.get(e.date) ?? { date: e.date, count: 0, hours: 0 };
        d.count += 1;
        d.hours += e.durationMin / 60;
        dailyMap.set(e.date, d);
      }
      const daily = [...dailyMap.values()].sort((a, b) => a.date.localeCompare(b.date));

      const totalCount = allEntries.length;
      const totalMin = allEntries.reduce((s, e) => s + e.durationMin, 0);
      const totalHours = Math.round((totalMin / 60) * 100) / 100;
      const avgDurationMin = Math.round(totalMin / totalCount);

      return { totalCount, totalHours, avgDurationMin, daily, entries: allEntries };
    } catch (e) {
      console.error('[meetings] fetch error:', e);
      return null;
    }
  }

  /** Fetch the whole work week's meetings via the daemon connector, anchored on one date. */
  private async fetchWeek(anchorDate: string): Promise<ConnectorRow[]> {
    try {
      const result = await this.daemon.post<DaemonRunResponse>('/api/run', {
        connector: 'outlook/my-meetings',
        args: { date: anchorDate },
      });
      return result.ok && result.data ? result.data : [];
    } catch {
      return [];
    }
  }

  /** First weekday (Mon–Fri) in [start, end], or null if the range has none. */
  private firstWeekday(start: string, end: string): string | null {
    const cursor = new Date(start);
    const endDate = new Date(end);
    while (cursor <= endDate) {
      const day = cursor.getDay();
      if (day >= 1 && day <= 5) return cursor.toISOString().slice(0, 10);
      cursor.setDate(cursor.getDate() + 1);
    }
    return null;
  }
}
