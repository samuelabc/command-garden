import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { isProcessAlive } from './process-alive.js';

export type LockResult = { acquired: true } | { acquired: false; holderPid: number };

export function acquireLock(lockPath: string): LockResult {
  if (existsSync(lockPath)) {
    const holderPid = parseInt(readFileSync(lockPath, 'utf-8').trim(), 10);
    if (isProcessAlive(holderPid)) return { acquired: false, holderPid };
  }
  writeFileSync(lockPath, String(process.pid));
  return { acquired: true };
}

export function releaseLock(lockPath: string): void {
  try { unlinkSync(lockPath); } catch { /* already gone */ }
}
