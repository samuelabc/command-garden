/**
 * Frontend type definitions for the Dev Work Journal.
 * Ported from dashboard/web/lib/types.ts (journal section).
 *
 * These are the client-side counterparts of the backend types in
 * server/journal/journal.types.ts — they mirror the JournalResponse shape
 * returned by POST /api/journal/generate.
 */

export type JournalStatus = 'success' | 'partial' | 'error';

export interface JournalTtDaily { date: string; hours: number; projects: { projectId: string; hours: number }[]; }
export interface JournalTimetracking { totalHours: number; targetHours: number; daily: JournalTtDaily[]; gaps: string[]; }

export interface JournalMeetingEntry { date: string; subject: string; start: string; end: string; durationMin: number; }
export interface JournalMeetingsDaily { date: string; count: number; hours: number; }
export interface JournalMeetings { totalCount: number; totalHours: number; avgDurationMin: number; daily: JournalMeetingsDaily[]; entries: JournalMeetingEntry[]; }

export interface JournalJiraTicket { key: string; summary: string; }
export interface JournalJira {
  resolved: (JournalJiraTicket & { resolvedDate: string })[];
  inProgress: JournalJiraTicket[];
  blockers: (JournalJiraTicket & { staleDays: number })[];
}

export interface JournalGitDaily { date: string; commits: number; filesChanged: number; }
export interface JournalGitRepo { project: string; repo: string; commits: number; }
export interface JournalGit { totalCommits: number; totalPRsMerged: number; totalPRsReviewed: number; daily: JournalGitDaily[]; repos: JournalGitRepo[]; }

export interface JournalCrossRef {
  forgottenDays: string[];
  heavyMeetingDays: { date: string; hours: number }[];
  zeroCodingDays: string[];
  meetingRatio: number;
  codingHours: number;
}

export interface MonthlyTimetrackingData {
  month: string;
  workingDaysTotal: number;
  workingDaysElapsed: number;
  releasedDates: string[];
  unreleasedDates: string[];
  hoursByProject: { projectId: string; hours: number }[];
}

/** Cache provenance — lets the UI show whether a result came from app.db
 *  (and when), instead of a fresh browser-driven fetch. */
export interface JournalCacheInfo {
  hit: boolean;
  fetchedAt: string; // ISO timestamp
}

export interface JournalResponse {
  status: JournalStatus;
  week: string;
  timetracking: JournalTimetracking | null;
  meetings: JournalMeetings | null;
  jira: JournalJira | null;
  git: JournalGit | null;
  crossRef: JournalCrossRef | null;
  insights: string[];
  errors: string[];
  monthlyTimetracking: MonthlyTimetrackingData | null;
  cache?: JournalCacheInfo;
}
