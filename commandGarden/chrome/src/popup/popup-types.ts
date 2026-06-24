// src/popup/popup-types.ts
export interface ActivityEntry {
  connector: string;
  ok: boolean;
  timestamp: number;
}

export type PopupMessage =
  | { type: 'getStatus' }
  | { type: 'reconnect' };

export interface PopupStatusResponse {
  connected: boolean;
  recentActivity: ActivityEntry[];
}
