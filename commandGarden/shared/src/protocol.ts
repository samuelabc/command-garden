import type { ConnectorDef } from './connector.js';
import type { PipelineStepType } from './pipeline.js';
import type { Capability } from './capabilities.js';
import type { StepSummary } from './events.js';

// ---------- CLI → Daemon ----------

export interface RunCommandRequest {
  connector: string;
  args: Record<string, string | number | boolean>;
  format?: 'table' | 'json' | 'csv';
}

export interface RunCommandResponse {
  ok: boolean;
  connector: string;
  rowCount: number;
  columns: string[];
  data: Record<string, unknown>[];
  error?: string;
  durationMs: number;
  requestId?: string;
  requiresApproval?: boolean;
}

// ---------- Daemon → Extension ----------

export interface ApprovalConfig {
  approvalRequired: string[];
  autoApproveConnectors: string[];
  approvalTimeoutMs: number;
}

export interface ExtensionRequest {
  id: string;
  connector: ConnectorDef;
  args: Record<string, string | number | boolean>;
  approvalConfig?: ApprovalConfig;
}

export interface ExtensionResponse {
  id: string;
  ok: boolean;
  data: Record<string, unknown>[];
  error?: string;
  steps?: StepSummary[];
}

// ---------- Approval protocol ----------

export interface ApprovalRequest {
  type: 'approval.request';
  approvalId: string;
  requestId: string;
  connectorKey: string;
  stepIndex: number;
  stepType: PipelineStepType;
  capability: Capability;
  description: string;
}

export interface ApprovalResponse {
  type: 'approval.response';
  approvalId: string;
  approved: boolean;
}

// ---------- Type guards ----------

export function isRunCommandRequest(value: unknown): value is RunCommandRequest {
  if (value == null || typeof value !== 'object') return false;
  const obj = value as Record<string, unknown>;
  return typeof obj.connector === 'string' && typeof obj.args === 'object' && obj.args !== null;
}

export function isExtensionResponse(value: unknown): value is ExtensionResponse {
  if (value == null || typeof value !== 'object') return false;
  const obj = value as Record<string, unknown>;
  return typeof obj.id === 'string' && typeof obj.ok === 'boolean' && Array.isArray(obj.data);
}

export function isApprovalRequest(value: unknown): value is ApprovalRequest {
  if (value == null || typeof value !== 'object') return false;
  const obj = value as Record<string, unknown>;
  return obj.type === 'approval.request' && typeof obj.approvalId === 'string';
}

export function isApprovalResponse(value: unknown): value is ApprovalResponse {
  if (value == null || typeof value !== 'object') return false;
  const obj = value as Record<string, unknown>;
  return obj.type === 'approval.response' && typeof obj.approvalId === 'string';
}
