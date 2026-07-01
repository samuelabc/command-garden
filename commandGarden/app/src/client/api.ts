async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const init: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body) init.body = JSON.stringify(body);
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
