export type OpencliStatus = 'success' | 'auth_required' | 'empty' | 'error';

export interface OpencliResult<T = Record<string, unknown>> {
  status: OpencliStatus;
  data: T[];
  rowCount: number;
  durationMs: number;
  exitCode: number | null;
  errorCode?: string;
  errorMessage?: string;
}

export interface OpencliRunOptions {
  timeoutMs?: number; // default 120000
}
