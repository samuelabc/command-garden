/** Shared types for the Dev Work Journal module.
 *  Ported from dashboard/api/src/journal/journal.types.ts — identical interfaces,
 *  no NestJS dependencies. */

export interface JournalInput {
  weekStart: string; // YYYY-MM-DD (Monday)
}

// --- Source data shapes ---

export interface TtDailyEntry {
  date: string;
  hours: number;
  projects: { projectId: string; hours: number }[];
}

export interface TimetrackingData {
  totalHours: number;
  targetHours: number;
  daily: TtDailyEntry[];
  gaps: string[];
}

export interface MeetingEntry {
  date: string;
  subject: string;
  start: string;
  end: string;
  durationMin: number;
}

export interface MeetingsDaily {
  date: string;
  count: number;
  hours: number;
}

export interface MeetingsData {
  totalCount: number;
  totalHours: number;
  avgDurationMin: number;
  daily: MeetingsDaily[];
  entries: MeetingEntry[];
}

export interface JiraTicket {
  key: string;
  summary: string;
}

export interface JiraData {
  resolved: (JiraTicket & { resolvedDate: string })[];
  inProgress: JiraTicket[];
  blockers: (JiraTicket & { staleDays: number })[];
}

export interface GitDaily {
  date: string;
  commits: number;
  filesChanged: number;
}

export interface GitRepoActivity {
  project: string;
  repo: string;
  commits: number;
}

export interface GitData {
  totalCommits: number;
  totalPRsMerged: number;
  totalPRsReviewed: number;
  daily: GitDaily[];
  repos: GitRepoActivity[];
}

// --- Cross-reference ---

export interface CrossRefData {
  forgottenDays: string[];
  heavyMeetingDays: { date: string; hours: number }[];
  zeroCodingDays: string[];
  meetingRatio: number;
  codingHours: number;
}

// --- Response ---

export type JournalStatus = 'success' | 'partial' | 'error';

export interface JournalResponse {
  status: JournalStatus;
  week: string;
  timetracking: TimetrackingData | null;
  meetings: MeetingsData | null;
  jira: JiraData | null;
  git: GitData | null;
  crossRef: CrossRefData | null;
  insights: string[];
  errors: string[];
}
