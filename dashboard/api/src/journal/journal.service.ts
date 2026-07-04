import { Injectable, Logger } from '@nestjs/common';
import { GitSource } from './sources/git.source';
import { TimetrackingSource } from './sources/timetracking.source';
import { MeetingsSource } from './sources/meetings.source';
import { JiraSource } from './sources/jira.source';
import { AuditService } from '../audit/audit.service';
import type {
  JournalInput,
  JournalResponse,
  TimetrackingData,
  MeetingsData,
  GitData,
  JiraData,
  CrossRefData,
} from './journal.types';

@Injectable()
export class JournalService {
  private readonly logger = new Logger(JournalService.name);

  constructor(
    private readonly git: GitSource,
    private readonly timetracking: TimetrackingSource,
    private readonly meetings: MeetingsSource,
    private readonly jira: JiraSource,
    private readonly audit: AuditService,
  ) {}

  async generate(input: JournalInput): Promise<JournalResponse> {
    const start = Date.now();
    const weekStart = input.weekStart;
    const weekEnd = this.addDays(weekStart, 6); // Mon–Sun (full 7-day week)

    const errors: string[] = [];

    // Fetch all sources in parallel; each source handles its own errors gracefully
    const [ttResult, meetingsResult, jiraResult, gitResult] = await Promise.allSettled([
      this.timetracking.fetch(weekStart, weekEnd),
      this.meetings.fetch(weekStart, weekEnd),
      this.jira.fetch(weekStart, weekEnd),
      this.git.fetch(weekStart, weekEnd),
    ]);

    const tt = ttResult.status === 'fulfilled' ? ttResult.value : null;
    if (ttResult.status === 'rejected') errors.push(`TimeTracking: ${ttResult.reason}`);

    const mtg = meetingsResult.status === 'fulfilled' ? meetingsResult.value : null;
    if (meetingsResult.status === 'rejected') errors.push(`Meetings: ${meetingsResult.reason}`);

    const jira = jiraResult.status === 'fulfilled' ? jiraResult.value : null;
    if (jiraResult.status === 'rejected') errors.push(`Jira: ${jiraResult.reason}`);

    const git = gitResult.status === 'fulfilled' ? gitResult.value : null;
    if (gitResult.status === 'rejected') errors.push(`Git: ${gitResult.reason}`);

    // Cross-reference available data
    const crossRef = this.crossReference(tt, mtg, jira, git, weekStart, weekEnd);

    // Determine overall status
    const hasAnyData = tt || mtg || jira || git;
    const status = hasAnyData ? (errors.length > 0 ? 'partial' : 'success') : 'error';

    // AI insights (placeholder — add LLM call here later)
    const insights = this.generateBasicInsights(tt, mtg, jira, git, crossRef);

    // Audit log
    await this.audit.record({
      command: 'journal generate',
      args: { weekStart },
      status: status === 'error' ? 'error' : 'success',
      exitCode: 0,
      durationMs: Date.now() - start,
      rowCount: 0,
      errorMessage: errors.length > 0 ? errors.join('; ') : undefined,
    });

    return {
      status,
      week: `${weekStart} – ${weekEnd}`,
      timetracking: tt,
      meetings: mtg,
      jira,
      git,
      crossRef,
      insights,
      errors,
    };
  }

  private crossReference(
    tt: TimetrackingData | null,
    mtg: MeetingsData | null,
    _jira: JiraData | null,
    git: GitData | null,
    weekStart: string,
    weekEnd: string,
  ): CrossRefData | null {
    if (!tt && !mtg && !git) return null;

    // Days with activity but 0 hours logged in TimeTracking
    const forgottenDays: string[] = [];
    if (tt) {
      for (const gap of tt.gaps) {
        const hasMeetings = mtg?.daily.some((d) => d.date === gap && d.count > 0);
        const hasCommits = git?.daily.some((d) => d.date === gap && d.commits > 0);
        if (hasMeetings || hasCommits) forgottenDays.push(gap);
      }
    }

    // Heavy meeting days (4+ hours)
    const heavyMeetingDays = (mtg?.daily ?? [])
      .filter((d) => d.hours >= 4)
      .map((d) => ({ date: d.date, hours: d.hours }));

    // Days with 0 commits
    const allWeekdays = this.weekdaysInRange(weekStart, weekEnd);
    const zeroCodingDays = git
      ? allWeekdays.filter((date) => !git.daily.some((d) => d.date === date && d.commits > 0))
      : [];

    // Meeting ratio
    const totalWorkHours = tt?.totalHours ?? 40;
    const meetingHours = mtg?.totalHours ?? 0;
    const meetingRatio = totalWorkHours > 0 ? Math.round((meetingHours / totalWorkHours) * 100) / 100 : 0;
    const codingHours = Math.max(0, totalWorkHours - meetingHours);

    return { forgottenDays, heavyMeetingDays, zeroCodingDays, meetingRatio, codingHours };
  }

  /**
   * Generate basic insights without LLM.
   * TODO: Replace with an LLM call for richer, more contextual insights.
   */
  private generateBasicInsights(
    tt: TimetrackingData | null,
    mtg: MeetingsData | null,
    jira: JiraData | null,
    git: GitData | null,
    crossRef: CrossRefData | null,
  ): string[] {
    const insights: string[] = [];

    if (crossRef?.forgottenDays.length) {
      insights.push(
        `You have activity on ${crossRef.forgottenDays.join(', ')} but 0 hours logged in TimeTracking — you may have forgotten to fill it.`,
      );
    }

    if (crossRef?.heavyMeetingDays.length) {
      const days = crossRef.heavyMeetingDays.map((d) => `${d.date} (${d.hours}h)`).join(', ');
      insights.push(`Heavy meeting days: ${days}. Consider blocking focus time.`);
    }

    if (tt && tt.totalHours < tt.targetHours * 0.8) {
      const gap = tt.targetHours - tt.totalHours;
      insights.push(`You're ${gap}h below your ${tt.targetHours}h weekly target.`);
    }

    if (jira?.blockers.length) {
      const items = jira.blockers.map((b) => `${b.key} (${b.staleDays}d)`).join(', ');
      insights.push(`Stale tickets: ${items}. Consider unblocking or reassigning.`);
    }

    if (crossRef && crossRef.meetingRatio > 0.5 && mtg) {
      insights.push(
        `Meetings consumed ${Math.round(crossRef.meetingRatio * 100)}% of your logged hours this week.`,
      );
    }

    return insights;
  }

  private addDays(dateStr: string, days: number): string {
    const d = new Date(dateStr);
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  }

  private weekdaysInRange(start: string, end: string): string[] {
    const days: string[] = [];
    const cursor = new Date(start);
    const endDate = new Date(end);
    while (cursor <= endDate) {
      if (cursor.getDay() >= 1 && cursor.getDay() <= 5) {
        days.push(cursor.toISOString().slice(0, 10));
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    return days;
  }
}
