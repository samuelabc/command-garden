// src/background/service-worker-logic.ts
import type { PopupStatusResponse, ActivityEntry } from '../popup/popup-types.js';

export interface ClientLike {
  connect(): void;
  disconnect(): void;
  isConnected(): boolean;
}

type StorageGet = (keys: string | string[], cb: (result: Record<string, unknown>) => void) => void;
type StorageSet = (items: Record<string, unknown>, cb?: () => void) => void;

export function initFromStorage(get: StorageGet, client: ClientLike): void {
  get('enabled', (result) => {
    const enabled = result.enabled ?? true;
    if (enabled) client.connect();
  });
}

export function handleSetEnabled(
  enabled: boolean,
  client: ClientLike,
  set: StorageSet,
  sendResponse: (response: PopupStatusResponse) => void,
  recentActivity: ActivityEntry[] = [],
): void {
  if (enabled) {
    client.connect();
  } else {
    client.disconnect();
  }
  set({ enabled }, () => {
    sendResponse({
      enabled,
      connected: client.isConnected(),
      recentActivity,
    });
  });
}

export function buildStatusResponse(
  client: ClientLike,
  get: StorageGet,
  recentActivity: ActivityEntry[],
  sendResponse: (response: PopupStatusResponse) => void,
): void {
  get('enabled', (result) => {
    sendResponse({
      enabled: (result.enabled ?? true) as boolean,
      connected: client.isConnected(),
      recentActivity,
    });
  });
}
