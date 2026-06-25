import type { ConnectorDef } from './connector.js';

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
}

// ---------- Daemon → Extension ----------

export interface ExtensionRequest {
  id: string;
  connector: ConnectorDef;
  args: Record<string, string | number | boolean>;
}

export interface ExtensionResponse {
  id: string;
  ok: boolean;
  data: Record<string, unknown>[];
  error?: string;
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
