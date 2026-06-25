// src/auth.ts
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export function generateSessionToken(): string {
  return randomBytes(32).toString('hex');
}

export function writeSessionToken(token: string, tokenPath: string): void {
  mkdirSync(dirname(tokenPath), { recursive: true });
  writeFileSync(tokenPath, token, { mode: 0o600 });
}

export function readSessionToken(tokenPath: string): string | null {
  try {
    return readFileSync(tokenPath, 'utf-8').trim();
  } catch {
    return null;
  }
}

export function validateToken(incoming: string, expected: string): boolean {
  if (incoming.length === 0 || incoming.length !== expected.length) return false;
  const a = Buffer.from(incoming);
  const b = Buffer.from(expected);
  return timingSafeEqual(a, b);
}
