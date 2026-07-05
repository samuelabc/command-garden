/**
 * TimeTracking data source — fetches hours via commandGarden daemon.
 * Ported from dashboard/api/src/journal/sources/timetracking.source.ts.
 *
 * Replaces OpencliService (CLI spawn) with DaemonClient (HTTP to daemon).
 * The daemon runs the timetracking/report connector via browser automation.
 * Returns null gracefully when the connector isn't available (Phase 2 dependency).
 */

import type { DaemonClient } from '@commandgarden/shared';
import type { TimetrackingData, TtDailyEntry } from '../journal.types.js';
import type { JournalConfig } from '../journal.config.js';

interface TtRow {
  month?: string;
  date?: string;
  projectId?: string;
  hours?: number | null;
}

/** Response shape from daemon /api/run for connector execution. */
interface DaemonRunResponse {
  ok: boolean;
  data?: TtRow[];
  error?: string;
}

export class TimetrackingSource {
  constructor(private readonly daemon: DaemonClient, private readonly config: JournalConfig) {}

  async fetch(weekStart: string, weekEnd: string): Promise<TimetrackingData | null> {
    try {
      // Determine which month(s) the week spans
      const startMonth = weekStart.slice(0, 7);
      const endMonth = weekEnd.slice(0, 7);
      const months = startMonth === endMonth ? [startMonth] : [startMonth, endMonth];

      // Fetch each month's report via daemon
      const allRows: TtRow[] = [];
      for (const month of months) {
        const result = await this.daemon.post<DaemonRunResponse>('/api/run', {
          connector: 'timetracking/report',
          args: { month },
        });
        if (result.ok && result.data) {
          allRows.push(...result.data);
        }
      }

      // Filter to rows within the week range
      const weekRows = allRows.filter((r) => {
        if (!r.date) return false;
        return r.date >= weekStart && r.date <= weekEnd;
      });

      // Group by date
      const dailyMap = new Map<string, TtDailyEntry>();
      for (const row of weekRows) {
        const date = row.date!;
        const entry = dailyMap.get(date) ?? { date, hours: 0, projects: [] };
        const hrs = typeof row.hours === 'number' ? row.hours : 0;
        entry.hours += hrs;

        if (row.projectId) {
          const proj = entry.projects.find((p) => p.projectId === row.projectId);
          if (proj) proj.hours += hrs;
          else entry.projects.push({ projectId: row.projectId!, hours: hrs });
        }

        dailyMap.set(date, entry);
      }

      const daily = [...dailyMap.values()].sort((a, b) => a.date.localeCompare(b.date));
      const totalHours = Math.round(daily.reduce((sum, d) => sum + d.hours, 0) * 100) / 100;

      // Find gaps: weekdays in range with 0 hours
      const gaps: string[] = [];
      const cursor = new Date(weekStart);
      const end = new Date(weekEnd);
      while (cursor <= end) {
        const day = cursor.getDay();
        if (day >= 1 && day <= 5) {
          const iso = cursor.toISOString().slice(0, 10);
          const entry = dailyMap.get(iso);
          if (!entry || entry.hours === 0) gaps.push(iso);
        }
        cursor.setDate(cursor.getDate() + 1);
      }

      return {
        totalHours,
        targetHours: this.config.targetHours,
        daily,
        gaps,
      };
    } catch {
      // Graceful degradation: connector not available yet (Phase 2 dependency)
      return null;
    }
  }
}
