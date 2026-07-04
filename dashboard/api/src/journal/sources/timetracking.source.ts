import { Injectable } from '@nestjs/common';
import { OpencliService } from '../../opencli/opencli.service';
import type { TimetrackingData, TtDailyEntry } from '../journal.types';
import { journalConfig } from '../journal.config';

interface TtRow {
  month?: string;
  date?: string;
  projectId?: string;
  hours?: number | null;
}

@Injectable()
export class TimetrackingSource {
  constructor(private readonly opencli: OpencliService) {}

  async fetch(weekStart: string, weekEnd: string): Promise<TimetrackingData> {
    // Determine which month(s) the week spans
    const startMonth = weekStart.slice(0, 7);
    const endMonth = weekEnd.slice(0, 7);
    const months = startMonth === endMonth ? [startMonth] : [startMonth, endMonth];

    // Fetch each month's report
    const allRows: TtRow[] = [];
    for (const month of months) {
      const result = await this.opencli.run<TtRow>(['timetracking', 'report', '--month', month]);
      if (result.status === 'success') {
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
        // Weekday
        const iso = cursor.toISOString().slice(0, 10);
        const entry = dailyMap.get(iso);
        if (!entry || entry.hours === 0) gaps.push(iso);
      }
      cursor.setDate(cursor.getDate() + 1);
    }

    return {
      totalHours,
      targetHours: journalConfig.targetHours,
      daily,
      gaps,
    };
  }
}
