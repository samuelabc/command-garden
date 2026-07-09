/**
 * Meetings data source — fetches the user's calendar via the
 * outlook/my-meetings connector through the daemon API.
 *
 * The connector uses CDP Scheduling Assistant + getSchedule interception
 * to bypass the MCAS proxy (see docs/ado-git-commits-fix.md for the
 * Runtime.evaluate CSP bypass that also applies here).
 *
 * Calls the connector once per weekday in the date range, then
 * aggregates into MeetingsData (totalCount, totalHours, daily, entries).
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
      // Fetch meetings for each weekday in the range.
      // The connector opens the Scheduling Assistant per call, so we
      // batch weekdays sequentially to avoid multiple browser tabs.
      const allEntries: MeetingEntry[] = [];
      const cursor = new Date(weekStart);
      const end = new Date(weekEnd);

      while (cursor <= end) {
        const day = cursor.getDay();
        // Only fetch weekdays (Mon–Fri) to avoid unnecessary calls
        if (day >= 1 && day <= 5) {
          const dateStr = cursor.toISOString().slice(0, 10);
          const rows = await this.fetchDay(dateStr);
          for (const r of rows) {
            allEntries.push({
              date: r.date,
              subject: r.subject,
              start: r.start,
              end: r.end,
              durationMin: r.durationMin,
            });
          }
        }
        cursor.setDate(cursor.getDate() + 1);
      }

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

  /** Fetch a single day's meetings via the daemon connector. */
  private async fetchDay(date: string): Promise<ConnectorRow[]> {
    try {
      const result = await this.daemon.post<DaemonRunResponse>('/api/run', {
        connector: 'outlook/my-meetings',
        args: { date },
      });
      return result.ok && result.data ? result.data : [];
    } catch {
      return [];
    }
  }
}
