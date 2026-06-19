import { Injectable } from '@nestjs/common';
import { OpencliService } from '../opencli/opencli.service';
import { AuditService } from '../audit/audit.service';
import { GoalsService } from '../goals/goals.service';
import { OpencliStatus } from '../opencli/opencli.types';
import { Goal } from '../goals/goal.entity';

export interface TtRow {
  month?: string; date?: string; weekday?: string; projectId?: string;
  category?: string; activity?: string; hours?: number | null; status?: string;
  journalId?: string; lineNumber?: number;
}
export interface TtGroup { projectId: string; category: string; totalHours: number; lineCount: number; }
export interface TtReportResponse {
  status: OpencliStatus;
  aggregated: TtGroup[];
  grandTotalHours: number;
  totalLines: number;
  raw: TtRow[];
  goals: Goal[];
  errorMessage?: string;
}
export interface TtReportInput { month?: string; months?: number; }

@Injectable()
export class TimetrackingService {
  constructor(private readonly opencli: OpencliService, private readonly audit: AuditService, private readonly goalsService: GoalsService) {}

  private buildArgs(input: TtReportInput): string[] {
    const args = ['timetracking', 'report'];
    if (input.month) args.push('--month', input.month);
    else if (input.months) args.push('--months', String(input.months));
    return args;
  }

  private aggregate(rows: TtRow[]): { aggregated: TtGroup[]; grandTotalHours: number } {
    const map = new Map<string, TtGroup>();
    let grand = 0;
    for (const r of rows) {
      const pid = r.projectId ?? '(none)';
      const cat = r.category ?? '(none)';
      const hrs = typeof r.hours === 'number' ? r.hours : 0;
      grand += hrs;
      const key = pid + '\u0000' + cat;
      const g = map.get(key) ?? { projectId: pid, category: cat, totalHours: 0, lineCount: 0 };
      g.totalHours += hrs;
      g.lineCount += 1;
      map.set(key, g);
    }
    const aggregated = [...map.values()].sort((a, b) => b.totalHours - a.totalHours);
    return { aggregated, grandTotalHours: Math.round(grand * 100) / 100 };
  }

  async report(input: TtReportInput): Promise<TtReportResponse> {
    const args = this.buildArgs(input);
    const result = await this.opencli.run<TtRow>(args);
    const { aggregated, grandTotalHours } = this.aggregate(result.data);

    await this.audit.record({
      command: 'timetracking report',
      args: input as Record<string, unknown>,
      status: result.status,
      exitCode: result.exitCode,
      durationMs: result.durationMs,
      rowCount: result.rowCount,
      errorCode: result.errorCode,
      errorMessage: result.errorMessage,
    });

    const month = input.month || new Date().toISOString().slice(0, 7);
    const goals = await this.goalsService.findByMonth(month);

    return {
      status: result.status,
      aggregated,
      grandTotalHours,
      totalLines: result.rowCount,
      raw: result.data,
      goals,
      errorMessage: result.errorMessage,
    };
  }
}
