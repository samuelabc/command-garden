// src/auth.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { generateSessionToken, writeSessionToken, readSessionToken, validateToken } from './auth.js';

describe('generateSessionToken', () => {
  it('returns a 64-char hex string', () => {
    const t = generateSessionToken();
    expect(t).toHaveLength(64);
    expect(t).toMatch(/^[0-9a-f]+$/);
  });
  it('generates unique tokens', () => {
    expect(generateSessionToken()).not.toBe(generateSessionToken());
  });
});

describe('writeSessionToken / readSessionToken', () => {
  let tmpDir: string;
  beforeEach(() => { tmpDir = mkdtempSync(join(tmpdir(), 'cg-auth-')); });
  afterEach(() => { rmSync(tmpDir, { recursive: true, force: true }); });

  it('round-trips token through file', () => {
    const p = join(tmpDir, 'token');
    const token = generateSessionToken();
    writeSessionToken(token, p);
    expect(readSessionToken(p)).toBe(token);
  });
  it('creates nested parent dirs', () => {
    const p = join(tmpDir, 'a', 'b', 'token');
    writeSessionToken('test', p);
    expect(readSessionToken(p)).toBe('test');
  });
  it('returns null for missing file', () => {
    expect(readSessionToken(join(tmpDir, 'nope'))).toBeNull();
  });
});

describe('validateToken', () => {
  it('accepts matching tokens', () => {
    expect(validateToken('abc123', 'abc123')).toBe(true);
  });
  it('rejects different tokens', () => {
    expect(validateToken('abc123', 'xyz789')).toBe(false);
  });
  it('rejects different lengths', () => {
    expect(validateToken('short', 'muchlonger')).toBe(false);
  });
  it('rejects empty incoming', () => {
    expect(validateToken('', 'valid')).toBe(false);
  });
});
