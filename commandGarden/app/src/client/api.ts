import type { JournalResponse } from './types/journal';

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const init: RequestInit = { method };
  if (body) {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify(body);
  }
  const resp = await fetch(path, init);
  const data = await resp.json();
  if (!resp.ok) throw new Error((data as Record<string, string>).error ?? `HTTP ${resp.status}`);
  return data as T;
}

export const api = {
  getStatus: () => request<{ ok: boolean; extensionConnected: boolean; connectorCount: number }>('GET', '/api/status'),
  getConnectors: () => request<{ ok: boolean; connectors: Connector[] }>('GET', '/api/connectors'),
  getConnector: (site: string, name: string) => request<{ ok: boolean; connector: ConnectorDetail }>('GET', `/api/connectors/${site}/${name}`),
  run: (connector: string, args: Record<string, string>) => request<RunResponse>('POST', '/api/run', { connector, args }),
  approve: (approvalId: string, approved: boolean) => request('POST', '/api/approval', { approvalId, approved }),
  getAudit: (params: Record<string, string>) => {
    const qs = new URLSearchParams(params).toString();
    return request<{ ok: boolean; events: AuditEvent[]; count: number }>('GET', `/api/audit${qs ? `?${qs}` : ''}`);
  },
  getAuditEvent: (id: string) => request<{ ok: boolean; event: AuditEvent }>('GET', `/api/audit/${id}`),
  getConfig: () => request<{ ok: boolean; config: Record<string, Record<string, unknown>> }>('GET', '/api/config'),
  setConfig: (key: string, value: string) => request('POST', '/api/config', { key, value }),
  getPreferences: () => request<{ ok: boolean; preferences: Record<string, string> }>('GET', '/api/preferences'),
  setPreference: (key: string, value: string) => request('PUT', '/api/preferences', { key, value }),
  getGoals: (month: string) => request<{ ok: boolean; goals: Goal[] }>('GET', `/api/goals?month=${month}`),
  upsertGoal: (body: { month: string; projectId: string; activity: string; targetDays: number }) => request<{ ok: boolean; goal: Goal }>('POST', '/api/goals', body),
  deleteGoal: (id: number) => request<{ ok: boolean }>('DELETE', `/api/goals/${id}`),
  getCachedReport: (month: string) => request<{ ok: boolean; data: Record<string, unknown>[] | null; fetchedAt: string | null }>('GET', `/api/timetracking/cache?month=${month}`),
  cacheReport: (month: string, data: Record<string, unknown>[]) => request<{ ok: boolean }>('POST', '/api/timetracking/cache', { month, data }),
  getCachedProjects: () => request<{ ok: boolean; data: ProjectActivity[] | null; fetchedAt: string | null }>('GET', '/api/timetracking/projects'),
  cacheProjects: (data: ProjectActivity[]) => request<{ ok: boolean }>('POST', '/api/timetracking/projects', { data }),
  generateJournal: (body: { weekStart: string }) => request<JournalResponse>('POST', '/api/journal/generate', body),
  getCachedSecurityNews: () => request<{ ok: boolean; data: Record<string, unknown>[] | null; fetchedAt: string | null }>('GET', '/api/security-news/cache'),
  cacheSecurityNews: (data: Record<string, unknown>[]) => request<{ ok: boolean }>('POST', '/api/security-news/cache', { data }),
  getCachedTrustedPeers: () => request<{ ok: boolean; data: Record<string, unknown>[] | null; fetchedAt: string | null }>('GET', '/api/trusted-peers/cache'),
  cacheTrustedPeers: (data: Record<string, unknown>[]) => request<{ ok: boolean }>('POST', '/api/trusted-peers/cache', { data }),
  getCachedRoomAvailability: (date: string) => request<{ ok: boolean; data: Record<string, unknown>[] | null; fetchedAt: string | null }>('GET', `/api/room-availability/cache?date=${date}`),
  cacheRoomAvailability: (date: string, data: Record<string, unknown>[]) => request<{ ok: boolean }>('POST', '/api/room-availability/cache', { date, data }),
  getSkills: () => request<{ ok: boolean; skills: Skill[] }>('GET', '/api/skills'),
};

export interface Connector {
  key: string;
  description: string;
  access: string;
  domains: string[];
  capabilities: string[];
  hasAppPage: boolean;
  appRoute: string | null;
  isHighRisk: boolean;
  isApproved: boolean;
  isAutoApproved: boolean;
}

export function groupBySite(connectors: Connector[]): [string, Connector[]][] {
  const map = new Map<string, Connector[]>();
  for (const c of connectors) {
    const site = c.key.split('/')[0];
    const list = map.get(site) ?? [];
    list.push(c);
    map.set(site, list);
  }
  return [...map.entries()];
}

export interface ConnectorDetail {
  site: string;
  name: string;
  version: string;
  description: string;
  access: string;
  domains: string[];
  capabilities: string[];
  args: { name: string; type: string; required: boolean; help: string; pattern?: string }[];
  columns: { name: string; type: string }[];
}

export interface RunResponse {
  ok: boolean;
  data: Record<string, unknown>[];
  columns?: string[];
  rowCount?: number;
  durationMs?: number;
  error?: string;
  requestId?: string;
  requiresApproval?: boolean;
  connector?: string;
}

export interface Goal {
  id: number;
  month: string;
  projectId: string;
  activity: string;
  targetDays: number;
  targetHours: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectActivity {
  projectId: string;
  projectName: string;
  activityNumber: string;
  activityName: string;
  category: string;
  linePropertyId: string;
}

export type BadgeVariant = 'success' | 'error' | 'warning' | 'info' | 'secondary' | 'neutral';

export const EVENT_TYPE_BADGE: Record<string, BadgeVariant> = {
  'command.success': 'success',
  'command.error': 'error',
  'command.denied': 'error',
  'command.start': 'neutral',
  'auth.failed': 'warning',
  'approval.granted': 'success',
  'approval.rejected': 'error',
  'config.changed': 'neutral',
};

export interface SkillFile {
  name: string;
  content: string;
}

export interface Skill {
  name: string;
  description: string;
  files: SkillFile[];
}

export interface AuditEvent {
  id: string;
  type: string;
  connector: string;
  user: string;
  timestamp: string;
  durationMs?: number;
  error?: string;
  correlationId?: string;
  connectorHash?: string;
  args?: Record<string, string>;
  domains?: string[];
  capabilities?: string[];
  rowCount?: number;
  columns?: string[];
  steps?: { step: string; capability: string; durationMs: number; error?: string }[];
}
