import type { TtReportResponse, RoomFreeBusyResponse, AuditPage, Goal, JournalResponse } from './types';

const BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:3001/api';

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Request failed (${res.status}): ${text}`);
  }
  return res.json() as Promise<T>;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Request failed (${res.status}): ${text}`);
  }
  return res.json() as Promise<T>;
}

async function del<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { method: 'DELETE' });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Request failed (${res.status}): ${text}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  timetrackingReport: (body: { month?: string; months?: number }) =>
    post<TtReportResponse>('/timetracking/report', body),
  roomFreeBusy: (body: { room: string; date?: string }) =>
    post<RoomFreeBusyResponse>('/teams/roomfreebusy', body),
  audit: async (params: { limit?: number; offset?: number; status?: string; command?: string }): Promise<AuditPage> => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== '') qs.set(k, String(v)); });
    const res = await fetch(`${BASE}/audit?${qs.toString()}`);
    if (!res.ok) throw new Error(`Audit request failed (${res.status})`);
    return res.json() as Promise<AuditPage>;
  },
  getGoals: (month: string) => get<Goal[]>(`/goals?month=${month}`),
  upsertGoal: (body: { month: string; projectId: string; targetDays: number }) => post<Goal>('/goals', body),
  deleteGoal: (id: number) => del<{ deleted: true }>(`/goals/${id}`),
  generateJournal: (body: { weekStart: string }) =>
    post<JournalResponse>('/journal/generate', body),
};
