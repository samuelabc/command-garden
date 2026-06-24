// src/messages.ts
import { randomUUID } from 'node:crypto';

export type DomAction = 'wait' | 'extract' | 'click' | 'type' | 'fetch';

export interface DomRequest {
  id: string;
  action: DomAction;
  params: Record<string, unknown>;
}

export interface DomResponse {
  requestId: string;
  ok: boolean;
  data?: unknown;
  error?: string;
}

export function createDomRequest(action: DomAction, params: Record<string, unknown>): DomRequest {
  return { id: randomUUID(), action, params };
}

export function createDomResponse(
  requestId: string, ok: boolean, data?: unknown, error?: string,
): DomResponse {
  return { requestId, ok, data, error };
}

export function isDomRequest(value: unknown): value is DomRequest {
  if (value == null || typeof value !== 'object') return false;
  const obj = value as Record<string, unknown>;
  return typeof obj.id === 'string' && typeof obj.action === 'string' && typeof obj.params === 'object';
}

export function isDomResponse(value: unknown): value is DomResponse {
  if (value == null || typeof value !== 'object') return false;
  const obj = value as Record<string, unknown>;
  return typeof obj.requestId === 'string' && typeof obj.ok === 'boolean';
}
