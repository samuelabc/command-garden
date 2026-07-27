// src/background/service-worker-logic.ts
import type { PopupStatusResponse, ActivityEntry, ApprovalInfo } from '../popup/popup-types.js';

export interface ClientLike {
  connect(): void;
  disconnect(): void;
  isConnected(): boolean;
  waitConnected(timeoutMs?: number): Promise<boolean>;
}

type StorageGet = (keys: string | string[], cb: (result: Record<string, unknown>) => void) => void;
type StorageSet = (items: Record<string, unknown>, cb?: () => void) => void;

export interface SessionRuleApi {
  getSessionRules(): Promise<{ id: number }[]>;
  updateSessionRules(options: { removeRuleIds?: number[] }): Promise<void>;
}

/**
 * Remove every declarativeNetRequest session rule.
 *
 * Session rules live for the whole browser session, so they outlive this
 * service worker. If a run is interrupted after egress rules are installed but
 * before they are removed — worker eviction, extension reload, crash — the
 * rules survive: the catch-all BLOCK rule keeps killing traffic in that tab,
 * and the in-memory ID counter restarts from the minimum and collides with
 * them. Every session rule belongs to this extension, so clearing them all at
 * startup is safe and fixes both problems.
 *
 * Never throws: a failed sweep must not stop the worker from starting.
 */
export async function clearAllSessionRules(dnr: SessionRuleApi): Promise<void> {
  try {
    const existing = await dnr.getSessionRules();
    if (existing.length === 0) return;
    await dnr.updateSessionRules({ removeRuleIds: existing.map(r => r.id) });
  } catch (err) {
    console.warn('Failed to clear stale session rules', err);
  }
}

export function initFromStorage(get: StorageGet, client: ClientLike): void {
  get('enabled', (result) => {
    const enabled = result.enabled ?? true;
    if (enabled) client.connect();
  });
}

export async function handleSetEnabled(
  enabled: boolean,
  client: ClientLike,
  set: StorageSet,
  sendResponse: (response: PopupStatusResponse) => void,
  recentActivity: ActivityEntry[] = [],
  pendingApprovals: ApprovalInfo[] = [],
): Promise<void> {
  if (enabled) {
    client.connect();
    await client.waitConnected();
  } else {
    client.disconnect();
  }
  set({ enabled }, () => {
    sendResponse({
      enabled,
      connected: client.isConnected(),
      recentActivity,
      pendingApprovals,
    });
  });
}

export async function buildStatusResponse(
  client: ClientLike,
  get: StorageGet,
  recentActivity: ActivityEntry[],
  sendResponse: (response: PopupStatusResponse) => void,
  pendingApprovals: ApprovalInfo[] = [],
): Promise<void> {
  await client.waitConnected();
  get('enabled', (result) => {
    sendResponse({
      enabled: (result.enabled ?? true) as boolean,
      connected: client.isConnected(),
      recentActivity,
      pendingApprovals,
    });
  });
}
