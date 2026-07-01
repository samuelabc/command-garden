// src/popup/popup-types.ts
export interface ActivityEntry {
  connector: string;
  ok: boolean;
  timestamp: number;
}

export interface ApprovalInfo {
  approvalId: string;
  connectorKey: string;
  stepIndex: number;
  stepType: string;
  capability: string;
}

export type PopupMessage =
  | { type: 'getStatus' }
  | { type: 'reconnect' }
  | { type: 'setEnabled'; enabled: boolean }
  | { type: 'approvalDecision'; approvalId: string; approved: boolean };

export interface PopupStatusResponse {
  connected: boolean;
  enabled: boolean;
  recentActivity: ActivityEntry[];
  pendingApprovals: ApprovalInfo[];
}
