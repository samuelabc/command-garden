// src/popup/popup-types.ts
export interface ActivityEntry {
  connector: string;
  ok: boolean;
  timestamp: number;
}

export type PopupMessage =
  | { type: 'getStatus' }
  | { type: 'reconnect' }
  | { type: 'setEnabled'; enabled: boolean };

export interface PopupStatusResponse {
  connected: boolean;
  enabled: boolean;
  recentActivity: ActivityEntry[];
}
