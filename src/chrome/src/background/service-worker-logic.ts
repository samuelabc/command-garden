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
