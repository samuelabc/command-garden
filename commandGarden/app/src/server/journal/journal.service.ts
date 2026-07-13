/**
 * Journal orchestrator — fetches all sources in parallel, cross-references,
 * and generates basic insights.
 * Ported from dashboard/api/src/journal/journal.service.ts.
 *
 * Removed NestJS DI: takes source instances via constructor params.
 * Removed AuditService dependency: audit logging deferred to route level / Phase 3.
 */

import { GitSource } from './sources/git.source.js';
import { TimetrackingSource } from './sources/timetracking.source.js';
import { MeetingsSource } from './sources/meetings.source.js';
import { JiraSource } from './sources/jira.source.js';
import type {
  JournalInput,
  JournalResponse,
  TimetrackingData,
  MeetingsData,
  GitData,
  JiraData,
  CrossRefData,
  MonthlyTimetrackingData,
  Insight,
} from './journal.types.js';

export class JournalService {
  constructor(
    private readonly git: GitSource,
    private readonly timetracking: TimetrackingSource,
    private readonly meetings: MeetingsSource,
    private readonly jira: JiraSource,
  ) {}

  async generate(input: JournalInput): Promise<JournalResponse> {
    const weekStart = input.weekStart;
    const weekEnd = this.addDays(weekStart, 6); // Mon–Sun (full 7-day week)

    const sources = {
      timetracking: input.sources?.timetracking ?? true,
      meetings: input.sources?.meetings ?? true,
      jira: input.sources?.jira ?? true,
      git: input.sources?.git ?? true,
    };

    const errors: string[] = [];
    const currentMonth = this.currentMonth();

    // Fetch only the enabled sources in parallel; each source handles its own errors gracefully.
    // Disabled sources resolve to null immediately without calling the connector.
    // The monthly timetracking status reuses TimetrackingSource's per-request cache, so if
    // the selected week falls in the current month, it never drives the browser connector twice.
    const [ttResult, meetingsResult, jiraResult, gitResult, monthlyTtResult] = await Promise.allSettled([
      sources.timetracking ? this.timetracking.fetch(weekStart, weekEnd) : Promise.resolve(null),
      sources.meetings ? this.meetings.fetch(weekStart, weekEnd) : Promise.resolve(null),
      sources.jira ? this.jira.fetch(weekStart, weekEnd) : Promise.resolve(null),
      sources.git ? this.git.fetch(weekStart, weekEnd) : Promise.resolve(null),
      sources.timetracking ? this.timetracking.fetchMonthlyStatus(currentMonth) : Promise.resolve(null),
    ]);

    const tt = ttResult.status === 'fulfilled' ? ttResult.value : null;
    if (ttResult.status === 'rejected') errors.push(`TimeTracking: ${ttResult.reason}`);

    const mtg = meetingsResult.status === 'fulfilled' ? meetingsResult.value : null;
    if (meetingsResult.status === 'rejected') errors.push(`Meetings: ${meetingsResult.reason}`);

    const jira = jiraResult.status === 'fulfilled' ? jiraResult.value : null;
    if (jiraResult.status === 'rejected') errors.push(`Jira: ${jiraResult.reason}`);

    const git = gitResult.status === 'fulfilled' ? gitResult.value : null;
    if (gitResult.status === 'rejected') errors.push(`Git: ${gitResult.reason}`);

    const monthlyTimetracking: MonthlyTimetrackingData | null =
      monthlyTtResult.status === 'fulfilled' ? monthlyTtResult.value : null;
    if (monthlyTtResult.status === 'rejected') errors.push(`Monthly TimeTracking: ${monthlyTtResult.reason}`);

    // Cross-reference available data
    const crossRef = this.crossReference(tt, mtg, jira, git, weekStart, weekEnd);

    // Determine overall status
    const hasAnyData = tt || mtg || jira || git;
    const status = hasAnyData ? (errors.length > 0 ? 'partial' : 'success') : 'error';

    // Rule-based insights (LLM replacement in Phase 4)
    const insights = this.generateBasicInsights(tt, mtg, jira, git, crossRef);

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
      monthlyTimetracking,
    };
  }

  private currentMonth(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  /**
   * Cross-reference data across sources to identify patterns:
   * - forgottenDays: days with activity but 0 hours logged
   * - heavyMeetingDays: days with 4+ hours in meetings
   * - zeroCodingDays: weekdays with 0 commits
   * - meetingRatio: fraction of work hours spent in meetings
   * - codingHours: estimated non-meeting hours
   */
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
   * Phase 4 replaces this with an LLM call for richer, more contextual insights.
   */
  private generateBasicInsights(
    tt: TimetrackingData | null,
    mtg: MeetingsData | null,
    jira: JiraData | null,
    git: GitData | null,
    crossRef: CrossRefData | null,
  ): Insight[] {
    const insights: Insight[] = [];

    if (crossRef?.forgottenDays.length) {
      insights.push({
        id: 'forgotten-days',
        severity: 'action',
        category: 'time',
        title: 'Unreleased hours',
        detail: `Activity on ${crossRef.forgottenDays.join(', ')} but 0 hours logged — you may have forgotten to fill TimeTracking.`,
      });
    }

    if (tt && tt.totalHours < tt.targetHours * 0.8) {
      const gap = Math.round((tt.targetHours - tt.totalHours) * 100) / 100;
      insights.push({
        id: 'below-target',
        severity: 'warning',
        category: 'time',
        title: 'Below weekly target',
        detail: `${gap}h short of your ${tt.targetHours}h target.`,
      });
    }

    if (crossRef?.heavyMeetingDays.length) {
      const days = crossRef.heavyMeetingDays.map((d) => `${d.date} (${d.hours}h)`).join(', ');
      insights.push({
        id: 'heavy-meetings',
        severity: 'warning',
        category: 'meetings',
        title: 'Heavy meeting days',
        detail: `${days}. Consider blocking focus time.`,
      });
    }

    if (crossRef && crossRef.meetingRatio > 0.5 && mtg) {
      insights.push({
        id: 'high-meeting-ratio',
        severity: 'info',
        category: 'meetings',
        title: 'High meeting ratio',
        detail: `Meetings consumed ${Math.round(crossRef.meetingRatio * 100)}% of your logged hours this week.`,
      });
    }

    if (jira?.blockers.length) {
      const items = jira.blockers.map((b) => `${b.key} (${b.staleDays}d)`).join(', ');
      insights.push({
        id: 'stale-tickets',
        severity: 'warning',
        category: 'tickets',
        title: 'Stale tickets',
        detail: `${items}. Consider unblocking or reassigning.`,
      });
    }

    if (crossRef && crossRef.zeroCodingDays.length > 0 && git && git.totalCommits > 0) {
      insights.push({
        id: 'zero-coding-days',
        severity: 'info',
        category: 'code',
        title: 'Zero-commit days',
        detail: `No commits on ${crossRef.zeroCodingDays.join(', ')}.`,
      });
    }

    if (git && git.totalCommits > 0 && git.totalPRsReviewed === 0) {
      insights.push({
        id: 'low-pr-reviews',
        severity: 'info',
        category: 'code',
        title: 'No PR reviews',
        detail: 'You made commits this week but reviewed 0 PRs.',
      });
    }

    if (insights.length === 0) {
      insights.push({
        id: 'all-clear',
        severity: 'positive',
        category: 'time',
        title: 'All clear',
        detail: 'No issues detected this week.',
      });
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
