export type RunStatus = 'success' | 'auth_required' | 'empty' | 'error';

export interface TtGroup { projectId: string; category: string; totalHours: number; lineCount: number; }
export interface TtRow {
  month?: string; date?: string; weekday?: string; projectId?: string;
  category?: string; activity?: string; hours?: number | null; status?: string;
}
export interface Goal {
  id: number; month: string; projectId: string;
  targetDays: number; targetHours: number;
  createdAt: string; updatedAt: string;
}
export interface TtReportResponse {
  status: RunStatus; aggregated: TtGroup[]; grandTotalHours: number;
  totalLines: number; raw: TtRow[]; goals: Goal[]; errorMessage?: string;
}

export interface TimelineRow { room?: string; date?: string; state?: string; start?: string; end?: string; durationMin?: number; }
export interface RoomFreeBusyResponse { status: RunStatus; timeline: TimelineRow[]; errorMessage?: string; }

export interface AuditItem {
  id: number; timestamp: string; command: string; argsJson: string;
  status: RunStatus; exitCode: number | null; durationMs: number;
  rowCount: number; errorCode: string | null; errorMessage: string | null;
}
export interface AuditPage { items: AuditItem[]; total: number; }

// --- Journal types ---

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

// --- Saba training types ---

export interface SabaTrainingRow {
  title?: string;
  type?: string;
  status?: string;
  dueDate?: string;
  daysUntilDue?: number;
  isOverdue?: boolean;
}

export interface SabaPendingTrainingResponse {
  status: RunStatus;
  items: SabaTrainingRow[];
  overdueCount: number;
  dueSoonCount: number;
  errorMessage?: string;
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
}
