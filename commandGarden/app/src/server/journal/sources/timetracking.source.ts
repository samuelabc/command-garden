/**
 * TimeTracking data source — fetches hours via commandGarden daemon.
 * Ported from dashboard/api/src/journal/sources/timetracking.source.ts.
 *
 * Replaces OpencliService (CLI spawn) with DaemonClient (HTTP to daemon).
 * The daemon runs the timetracking/report connector via browser automation.
 * Returns null gracefully when the connector isn't available (Phase 2 dependency).
 */

import type { DaemonClient } from '@commandgarden/shared';
import type { TimetrackingData, TtDailyEntry, MonthlyTimetrackingData } from '../journal.types.js';
import type { JournalConfig } from '../journal.config.js';

interface TtRow {
  month?: string;
  date?: string;
  status?: string;
  projectId?: string;
  activity?: string;
  hours?: number | null;
}

/** Response shape from daemon /api/run for connector execution. */
interface DaemonRunResponse {
  ok: boolean;
  data?: TtRow[];
  error?: string;
}

export class TimetrackingSource {
  // Per-instance cache so a single journal-generate request only ever drives
  // the browser-based timetracking connector once per calendar month, even
  // if both the weekly report and the monthly status need the same month.
  private readonly rawCache = new Map<string, Promise<TtRow[]>>();

  constructor(private readonly daemon: DaemonClient, private readonly config: JournalConfig) {}

  private fetchMonthRaw(month: string): Promise<TtRow[]> {
    if (!this.rawCache.has(month)) {
      this.rawCache.set(
        month,
        this.daemon
          .post<DaemonRunResponse>('/api/run', { connector: 'timetracking/report', args: { month } })
          .then((result) => (result.ok && result.data ? result.data : []))
          .catch(() => []),
      );
    }
    return this.rawCache.get(month)!;
  }

  async fetch(weekStart: string, weekEnd: string): Promise<TimetrackingData | null> {
    try {
      // Determine which month(s) the week spans
      const startMonth = weekStart.slice(0, 7);
      const endMonth = weekEnd.slice(0, 7);
      const months = startMonth === endMonth ? [startMonth] : [startMonth, endMonth];

      // Fetch each month's report via daemon (cached per month within this request)
      const allRows: TtRow[] = [];
      for (const month of months) {
        allRows.push(...(await this.fetchMonthRaw(month)));
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

  /**
   * Compute month-to-date release status (working days released/unreleased)
   * and per-project logged hours. Reuses the cached raw month fetch so this
   * never triggers a second browser-driven connector run for a month that
   * was already fetched by `fetch()` in the same request.
   */
  async fetchMonthlyStatus(month: string): Promise<MonthlyTimetrackingData> {
    const raw = await this.fetchMonthRaw(month);

    const [y, m] = month.split('-').map(Number);
    const today = new Date();
    const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const daysInMonth = new Date(y, m, 0).getDate();

    let workingDaysTotal = 0;
    const workingDatesElapsed: string[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(y, m - 1, d);
      const day = date.getDay();
      if (day === 0 || day === 6) continue;
      workingDaysTotal += 1;
      const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      if (iso <= todayIso) workingDatesElapsed.push(iso);
    }

    const releasedDateSet = new Set(
      raw.filter((r) => r.date && r.status && /released/i.test(String(r.status))).map((r) => r.date as string),
    );
    const releasedDates = workingDatesElapsed.filter((d) => releasedDateSet.has(d));
    const unreleasedDates = workingDatesElapsed.filter((d) => !releasedDateSet.has(d));

    const hoursMap = new Map<string, number>();
    const hoursByPAMap = new Map<string, { projectId: string; activity: string; hours: number }>();
    for (const row of raw) {
      if (!row.projectId) continue;
      const hrs = typeof row.hours === 'number' ? row.hours : 0;
      hoursMap.set(row.projectId, (hoursMap.get(row.projectId) ?? 0) + hrs);

      if (row.activity) {
        const paKey = `${row.projectId}\0${row.activity}`;
        const existing = hoursByPAMap.get(paKey);
        if (existing) {
          existing.hours += hrs;
        } else {
          hoursByPAMap.set(paKey, { projectId: row.projectId, activity: row.activity, hours: hrs });
        }
      }
    }
    const hoursByProject = [...hoursMap.entries()].map(([projectId, hours]) => ({
      projectId,
      hours: Math.round(hours * 100) / 100,
    }));
    const hoursByProjectActivity = [...hoursByPAMap.values()].map((e) => ({
      ...e,
      hours: Math.round(e.hours * 100) / 100,
    }));

    return {
      month,
      workingDaysTotal,
      workingDaysElapsed: workingDatesElapsed.length,
      releasedDates,
      unreleasedDates,
      hoursByProject,
      hoursByProjectActivity,
    };
  }
}
