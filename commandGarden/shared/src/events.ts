import { randomUUID } from 'node:crypto';

export const AUDIT_EVENT_TYPES = [
  'command.start',
  'command.success',
  'command.error',
  'command.denied',
] as const;

export type AuditEventType = (typeof AUDIT_EVENT_TYPES)[number];

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
}

export function createAuditEvent(
  overrides: Partial<AuditEvent> & Pick<AuditEvent, 'type' | 'connector'>,
): AuditEvent {
  return {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    user: '',
    args: {},
    domains: [],
    capabilities: [],
    durationMs: 0,
    ...overrides,
  };
}
