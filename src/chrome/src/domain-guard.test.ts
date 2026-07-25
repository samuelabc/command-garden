// src/domain-guard.test.ts
import { describe, it, expect } from 'vitest';
import { buildAllowlist, buildAllowlistFromConnectors, isUrlAllowed, extractHostname } from './domain-guard.js';
import type { ConnectorDef } from '@commandgarden/shared';

const makeConnector = (domains: string[]): ConnectorDef => ({
  site: 'test', name: 'cmd', version: '1.0',
  domains, capabilities: ['navigate'],
  pipeline: [{ step: 'navigate', url: 'https://example.com' }],
} as unknown as ConnectorDef);

describe('buildAllowlistFromConnectors', () => {
  it('merges domains from multiple connectors', () => {
    const list = buildAllowlistFromConnectors([
      makeConnector(['a.com', 'b.com']),
      makeConnector(['b.com', 'c.com']),
    ]);
    expect(list.size).toBe(3);
    expect(list.has('a.com')).toBe(true);
    expect(list.has('c.com')).toBe(true);
  });

  it('returns empty set for no connectors', () => {
    expect(buildAllowlistFromConnectors([]).size).toBe(0);
  });
});

describe('buildAllowlist', () => {
  it('builds set from domain array', () => {
    const list = buildAllowlist(['a.com', 'b.com']);
    expect(list.size).toBe(2);
    expect(list.has('a.com')).toBe(true);
    expect(list.has('b.com')).toBe(true);
  });
});

describe('extractHostname', () => {
  it('extracts hostname from full URL', () => {
    expect(extractHostname('https://example.com/path')).toBe('example.com');
  });
  it('extracts hostname with port', () => {
    expect(extractHostname('https://example.com:8080/path')).toBe('example.com');
  });
  it('returns null for invalid URL', () => {
    expect(extractHostname('not-a-url')).toBeNull();
  });
  it('handles chrome:// URLs', () => {
    expect(extractHostname('chrome://extensions')).toBe('extensions');
  });
});

describe('isUrlAllowed', () => {
  const allowlist = new Set(['example.com', 'api.example.com']);

  it('allows listed domain', () => {
    expect(isUrlAllowed('https://example.com/page', allowlist)).toBe(true);
  });
  it('allows listed subdomain', () => {
    expect(isUrlAllowed('https://api.example.com/v1', allowlist)).toBe(true);
  });
  it('blocks unlisted domain', () => {
    expect(isUrlAllowed('https://evil.com', allowlist)).toBe(false);
  });
  it('blocks invalid URL', () => {
    expect(isUrlAllowed('not-a-url', allowlist)).toBe(false);
  });
  it('blocks empty allowlist', () => {
    expect(isUrlAllowed('https://example.com', new Set())).toBe(false);
  });
});
