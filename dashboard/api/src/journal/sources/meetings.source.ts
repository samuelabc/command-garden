import { Injectable } from '@nestjs/common';
import { OpencliService } from '../../opencli/opencli.service';
import type { MeetingsData, MeetingsDaily, MeetingEntry } from '../journal.types';

/**
 * Fetches the user's own meeting schedule from Outlook via commandGarden.
 *
 * NOTE: This source depends on an adapter that returns the user's OWN calendar
 * events (not room availability). Options:
 *
 * 1. Use the existing `teams/roomfreebusy` approach but capture the organizer's
 *    own scheduleItems (they fire automatically before a room is added).
 *    Requires a new adapter: `outlook/mymeetings`.
 *
 * 2. If that adapter is not yet built, this source returns null and the journal
 *    renders without meeting data (graceful degradation).
 *
 * TODO: Implement `outlook/mymeetings` adapter in clis/ or commandGarden connectors.
 */

interface ScheduleRow {
  date?: string;
  subject?: string;
  start?: string;
  end?: string;
  durationMin?: number;
  isMeeting?: boolean;
}

@Injectable()
export class MeetingsSource {
  constructor(private readonly opencli: OpencliService) {}

  async fetch(weekStart: string, weekEnd: string): Promise<MeetingsData | null> {
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
  }

  private async fetchDay(date: string): Promise<MeetingEntry[]> {
    // TODO: Replace with actual adapter call once `outlook/mymeetings` is built.
    // For now, try calling `teams roomfreebusy` with the user's own email as --room.
    // This returns the user's own free/busy schedule (busy blocks = meetings).
    //
    // Alternative: use a new adapter that captures the organizer's scheduleItems
    // directly from the Scheduling Assistant (they fire on open, before adding a room).
    try {
      const result = await this.opencli.run<ScheduleRow>(
        ['teams', 'roomfreebusy', '--room', 'YOUR_EMAIL@mercedes-benz.com', '--date', date],
      );
      if (result.status !== 'success') return [];

      return result.data
        .filter((r) => r.start && r.end && r.durationMin && r.durationMin > 0)
        .filter((r) => r.start !== '00:00' || r.end !== '24:00') // exclude full-day "free" blocks
        .filter((r) => {
          // Only include busy/tentative blocks (these are meetings)
          const state = (r as Record<string, unknown>).state as string | undefined;
          return state === 'busy' || state === 'tentative';
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
