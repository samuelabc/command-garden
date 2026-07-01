import { randomUUID } from 'node:crypto';

export const AUDIT_EVENT_TYPES = [
  'command.start',
  'command.success',
  'command.error',
  'command.denied',
  'auth.failed',
  'approval.granted',
  'approval.rejected',
  'config.changed',
] as const;

export type AuditEventType = (typeof AUDIT_EVENT_TYPES)[number];

export interface StepSummary {
  step: string;
  index: number;
  capability?: string;
  durationMs: number;
  error?: string;
}

export interface AuditEvent {
  id: string;
  timestamp: string;
  type: AuditEventType;
  user: string;
  connector: string;
  args: Record<string, string>;
  domains: string[];
  capabilities: string[];
  rowCount?: number;
  columns?: string[];
  durationMs: number;
  error?: string;
  denialReason?: string;
  correlationId?: string;
  connectorHash?: string;
  steps?: StepSummary[];
  source?: string;
  previousValue?: string;
  newValue?: string;
}

const SENSITIVE_PATTERN = /token|password|secret|api_key|credential|auth/i;

export function redactArgs(args: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [k, v] of Object.entries(args)) {
    result[k] = SENSITIVE_PATTERN.test(k) ? '[REDACTED]' : v;
  }
  return result;
}

export function createAuditEvent(
  overrides: Partial<AuditEvent> & Pick<AuditEvent, 'type' | 'connector'>,
): AuditEvent {
  const base: AuditEvent = {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    user: '',
    args: {},
    domains: [],
    capabilities: [],
    durationMs: 0,
    ...overrides,
  };
  base.args = redactArgs(base.args);
  return base;
}
