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
