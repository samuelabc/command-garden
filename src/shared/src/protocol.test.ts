import { describe, it, expect } from 'vitest';
import {
  type RunCommandRequest,
  type RunCommandResponse,
  type ExtensionRequest,
  type ExtensionResponse,
  isRunCommandRequest,
  isExtensionResponse,
} from './protocol';

describe('isRunCommandRequest', () => {
  it('returns true for a valid request', () => {
    const req: RunCommandRequest = {
      connector: 'timetracking/report',
      args: { month: '2026-06' },
    };
    expect(isRunCommandRequest(req)).toBe(true);
  });

  it('returns false when connector is missing', () => {
    expect(isRunCommandRequest({ args: {} })).toBe(false);
  });

  it('returns false when connector is not a string', () => {
    expect(isRunCommandRequest({ connector: 42, args: {} })).toBe(false);
  });

  it('returns false for null', () => {
    expect(isRunCommandRequest(null)).toBe(false);
  });

  it('returns false for non-object', () => {
    expect(isRunCommandRequest('string')).toBe(false);
  });
});

describe('isExtensionResponse', () => {
  it('returns true for a valid success response', () => {
    const res: ExtensionResponse = {
      id: '123',
      ok: true,
      data: [{ date: '2026-06-01', hours: 8 }],
    };
    expect(isExtensionResponse(res)).toBe(true);
  });

  it('returns true for a valid error response', () => {
    const res: ExtensionResponse = {
      id: '123',
      ok: false,
      data: [],
      error: 'Timeout',
    };
    expect(isExtensionResponse(res)).toBe(true);
  });

  it('returns false when id is missing', () => {
    expect(isExtensionResponse({ ok: true, data: [] })).toBe(false);
  });

  it('returns false when ok is missing', () => {
    expect(isExtensionResponse({ id: '123', data: [] })).toBe(false);
  });
});
