/**
 * Meetings data source — fetches calendar events via commandGarden daemon.
 * Ported from dashboard/api/src/journal/sources/meetings.source.ts.
 *
 * Replaces OpencliService (CLI spawn) with DaemonClient (HTTP to daemon).
 * Uses the teams/roomfreebusy connector with the user's own email as --room
 * to extract busy/tentative blocks as meetings.
 * Returns null gracefully when the connector isn't available (Phase 2 dependency).
 */

import type { DaemonClient } from '@commandgarden/shared';
import { journalConfig } from '../journal.config.js';
import type { MeetingsData, MeetingsDaily, MeetingEntry } from '../journal.types.js';

interface ScheduleRow {
  date?: string;
  subject?: string;
  start?: string;
  end?: string;
  durationMin?: number;
  isMeeting?: boolean;
  state?: string;
}

/** Response shape from daemon /api/run for connector execution. */
interface DaemonRunResponse {
  ok: boolean;
  data?: ScheduleRow[];
  error?: string;
}

export class MeetingsSource {
  constructor(private readonly daemon: DaemonClient) {}

  async fetch(weekStart: string, weekEnd: string): Promise<MeetingsData | null> {
    try {
      // Fetch each weekday's meetings
      const entries: MeetingEntry[] = [];
      const cursor = new Date(weekStart);
      const end = new Date(weekEnd);

      while (cursor <= end) {
        const day = cursor.getDay();
        if (day >= 1 && day <= 5) {
          const date = cursor.toISOString().slice(0, 10);
          const dayEntries = await this.fetchDay(date);
          entries.push(...dayEntries);
        }
        cursor.setDate(cursor.getDate() + 1);
      }

      if (entries.length === 0) return null;

      // Aggregate daily
      const dailyMap = new Map<string, MeetingsDaily>();
      for (const e of entries) {
        const d = dailyMap.get(e.date) ?? { date: e.date, count: 0, hours: 0 };
        d.count += 1;
        d.hours += e.durationMin / 60;
        dailyMap.set(e.date, d);
      }

      const daily = [...dailyMap.values()].sort((a, b) => a.date.localeCompare(b.date));
      daily.forEach((d) => (d.hours = Math.round(d.hours * 100) / 100));

      const totalCount = entries.length;
      const totalHours = Math.round(daily.reduce((sum, d) => sum + d.hours, 0) * 100) / 100;
      const avgDurationMin = totalCount > 0 ? Math.round(entries.reduce((sum, e) => sum + e.durationMin, 0) / totalCount) : 0;

      return { totalCount, totalHours, avgDurationMin, daily, entries };
    } catch {
      // Graceful degradation: connector not available yet (Phase 2 dependency)
      return null;
    }
  }

  /** Fetch a single day's meetings via the teams/roomfreebusy connector. */
  private async fetchDay(date: string): Promise<MeetingEntry[]> {
    try {
      const result = await this.daemon.post<DaemonRunResponse>('/api/run', {
        connector: 'teams/roomfreebusy',
        args: { room: journalConfig.author, date },
      });
      if (!result.ok || !result.data) return [];

      return result.data
        .filter((r) => r.start && r.end && r.durationMin && r.durationMin > 0)
        .filter((r) => r.start !== '00:00' || r.end !== '24:00') // exclude full-day "free" blocks
        .filter((r) => {
          // Only include busy/tentative blocks (these are meetings)
          return r.state === 'busy' || r.state === 'tentative';
        })
        .map((r) => ({
          date,
          subject: r.subject ?? '(meeting)',
          start: r.start!,
          end: r.end!,
          durationMin: r.durationMin!,
        }));
    } catch {
      return [];
    }
  }
}
