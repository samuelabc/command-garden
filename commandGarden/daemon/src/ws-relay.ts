// src/ws-relay.ts
import { randomUUID } from 'node:crypto';
import type {
  ConnectorDef, ExtensionRequest, ExtensionResponse,
  ApprovalRequest, ApprovalResponse, ApprovalConfig,
} from '@commandgarden/shared';
import { isExtensionResponse, isApprovalRequest, isApprovalResponse } from '@commandgarden/shared';

interface PendingRequest {
  resolve: (resp: ExtensionResponse) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

interface PendingApproval {
  resolve: (approved: boolean) => void;
  timer: ReturnType<typeof setTimeout>;
  request: ApprovalRequest;
}

export type ApprovalRequestHandler = (request: ApprovalRequest) => void;

interface SocketLike {
  on(event: string, cb: (...args: unknown[]) => void): void;
  send(data: string): void;
  close(): void;
}

export class WsRelay {
  private ws: SocketLike | null = null;
  private pending = new Map<string, PendingRequest>();
  private pendingApprovals = new Map<string, PendingApproval>();
  private approvalHandler: ApprovalRequestHandler | null = null;
  private approvalResolvedHandler: ((id: string, approved: boolean, req: ApprovalRequest) => void) | null = null;

  get connected(): boolean { return this.ws !== null; }

  onApprovalRequest(handler: ApprovalRequestHandler): void {
    this.approvalHandler = handler;
  }

  onApprovalResolved(handler: (id: string, approved: boolean, req: ApprovalRequest) => void): void {
    this.approvalResolvedHandler = handler;
  }

  attach(ws: SocketLike): void {
    if (this.ws) this.ws.close();
    this.ws = ws;
    ws.on('message', (raw: unknown) => {
      const data = JSON.parse(String(raw));
      if (data.type === 'ping') return;
      if (isExtensionResponse(data)) {
        const entry = this.pending.get(data.id);
        if (entry) {
          clearTimeout(entry.timer);
          this.pending.delete(data.id);
          entry.resolve(data);
        }
      } else if (isApprovalRequest(data)) {
        if (this.approvalHandler) {
          this.approvalHandler(data);
        }
      } else if (isApprovalResponse(data)) {
        // Extension user approved/rejected via notification — resolve pending approval
        // without sending response back to extension (it came from there)
        const entry = this.pendingApprovals.get(data.approvalId);
        if (entry) {
          if (this.approvalResolvedHandler) {
            this.approvalResolvedHandler(data.approvalId, data.approved, entry.request);
          }
          clearTimeout(entry.timer);
          this.pendingApprovals.delete(data.approvalId);
          entry.resolve(data.approved);
        }
      }
    });
    ws.on('close', () => {
      this.ws = null;
      for (const [, entry] of this.pending) {
        clearTimeout(entry.timer);
        entry.reject(new Error('Extension disconnected'));
      }
      this.pending.clear();
      for (const [, entry] of this.pendingApprovals) {
        clearTimeout(entry.timer);
        entry.resolve(false);
      }
      this.pendingApprovals.clear();
    });
  }

  async send(
    connector: ConnectorDef,
    args: Record<string, string | number | boolean>,
    approvalConfig?: ApprovalConfig,
    timeoutMs = 120_000,
    requestId?: string,
  ): Promise<ExtensionResponse> {
    if (!this.ws) throw new Error('Extension not connected');
    const id = requestId ?? randomUUID();
    const request: ExtensionRequest = { id, connector, args, approvalConfig };
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('Extension request timed out'));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.ws!.send(JSON.stringify(request));
    });
  }

  resolveApproval(approvalId: string, approved: boolean): boolean {
    const entry = this.pendingApprovals.get(approvalId);
    if (!entry) return false;
    clearTimeout(entry.timer);
    this.pendingApprovals.delete(approvalId);
    entry.resolve(approved);
    const response: ApprovalResponse = { type: 'approval.response', approvalId, approved };
    if (this.ws) this.ws.send(JSON.stringify(response));
    return true;
  }

  registerApproval(request: ApprovalRequest, timeoutMs: number): Promise<boolean> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pendingApprovals.delete(request.approvalId);
        resolve(false);
      }, timeoutMs);
      this.pendingApprovals.set(request.approvalId, { resolve, timer, request });
    });
  }

  getPendingApproval(approvalId: string): PendingApproval | undefined {
    return this.pendingApprovals.get(approvalId);
  }

  detach(): void {
    if (this.ws) { this.ws.close(); this.ws = null; }
  }
}
