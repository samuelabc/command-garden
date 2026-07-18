// src/messages.test.ts
import { describe, it, expect } from 'vitest';
import {
  createDomRequest, createDomResponse,
  isDomRequest, isDomResponse,
} from './messages.js';

describe('createDomRequest', () => {
  it('creates a wait request', () => {
    const req = createDomRequest('wait', { selector: '.table', timeout: 5000 });
    expect(req.id).toBeDefined();
    expect(req.action).toBe('wait');
    expect(req.params.selector).toBe('.table');
  });

  it('creates an extract request', () => {
    const req = createDomRequest('extract', { selector: 'tr', fields: { name: 'td:first-child' } });
    expect(req.action).toBe('extract');
    expect(req.params.fields).toBeDefined();
  });

  it('creates a click request', () => {
    const req = createDomRequest('click', { selector: '#btn' });
    expect(req.action).toBe('click');
  });

  it('creates a type request', () => {
    const req = createDomRequest('type', { selector: '#input', value: 'hello' });
    expect(req.action).toBe('type');
  });

  it('creates a fetch request', () => {
    const req = createDomRequest('fetch', { url: 'https://example.com/api', method: 'GET' });
    expect(req.action).toBe('fetch');
  });
});

describe('createDomResponse', () => {
  it('creates success response', () => {
    const res = createDomResponse('req-1', true, [{ a: 1 }]);
    expect(res.requestId).toBe('req-1');
    expect(res.ok).toBe(true);
    expect(res.data).toEqual([{ a: 1 }]);
  });

  it('creates error response', () => {
    const res = createDomResponse('req-1', false, undefined, 'Element not found');
    expect(res.ok).toBe(false);
    expect(res.error).toBe('Element not found');
  });
});

describe('type guards', () => {
  it('isDomRequest accepts valid request', () => {
    expect(isDomRequest({ id: '1', action: 'wait', params: {} })).toBe(true);
  });
  it('isDomRequest rejects invalid', () => {
    expect(isDomRequest({ foo: 'bar' })).toBe(false);
  });
  it('isDomResponse accepts valid response', () => {
    expect(isDomResponse({ requestId: '1', ok: true })).toBe(true);
  });
  it('isDomResponse rejects invalid', () => {
    expect(isDomResponse(null)).toBe(false);
  });
});
