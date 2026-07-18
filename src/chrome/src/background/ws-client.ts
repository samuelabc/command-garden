// src/background/ws-client.ts
import type { ExtensionRequest, ExtensionResponse, ApprovalRequest, ApprovalResponse } from '@commandgarden/shared';

type RequestHandler = (request: ExtensionRequest) => void;
type ApprovalResponseHandler = (response: ApprovalResponse) => void;

interface WebSocketLike {
  readyState: number;
  send(data: string): void;
  close(): void;
  addEventListener(event: string, cb: (...args: unknown[]) => void): void;
  removeEventListener(event: string, cb: (...args: unknown[]) => void): void;
}

interface WebSocketConstructor {
  new(url: string): WebSocketLike;
  OPEN: number;
}

export class WsClient {
  private ws: WebSocketLike | null = null;
  private handler: RequestHandler | null = null;
  private approvalResponseHandler: ApprovalResponseHandler | null = null;
  private reconnectTimer: number | null = null;
  private keepaliveTimer: number | null = null;
  private reconnectDelay = 1000;
  private readonly maxReconnectDelay = 30000;
  private readonly keepaliveIntervalMs = 20_000;
  private intentionallyClosed = false;
  private readonly probeUrl: string;

  constructor(
    private url: string,
    private WS: WebSocketConstructor = (globalThis as unknown as { WebSocket: WebSocketConstructor }).WebSocket,
  ) {
    this.probeUrl = url.replace(/^ws/, 'http').replace(/\/ws\/extension$/, '/api/status');
  }

  connect(): void {
    if (this.ws) return;
    this.intentionallyClosed = false;
    this.attemptConnect();
  }

  private attemptConnect(): void {
    fetch(this.probeUrl, { method: 'HEAD' }).then(() => {
      this.doConnect();
    }).catch(() => {
      this.scheduleReconnect();
    });
  }

  private doConnect(): void {
    if (this.ws) return;
    try {
      this.ws = new this.WS(this.url);
    } catch {
      this.scheduleReconnect();
      return;
    }
    const onOpen = () => {
      this.reconnectDelay = 1000;
      this.startKeepalive();
    };
    const onMessage = (event: unknown) => {
      const data = typeof event === 'string' ? event : (event as { data?: string })?.data;
      if (!data || !this.handler) return;
      try {
        const parsed = JSON.parse(String(data));
        if (parsed.type === 'approval.response' && this.approvalResponseHandler) {
          this.approvalResponseHandler(parsed as ApprovalResponse);
        } else if (parsed.id && parsed.connector) {
          this.handler(parsed as ExtensionRequest);
        }
      } catch { /* ignore parse errors */ }
    };
    const onClose = () => {
      this.ws = null;
      this.stopKeepalive();
      if (!this.intentionallyClosed) this.scheduleReconnect();
    };
    this.ws.addEventListener('open', onOpen);
    this.ws.addEventListener('message', onMessage);
    this.ws.addEventListener('close', onClose);
  }

  private startKeepalive(): void {
    this.stopKeepalive();
    this.keepaliveTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === this.WS.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping' }));
      } else {
        this.stopKeepalive();
      }
    }, this.keepaliveIntervalMs);
  }

  private stopKeepalive(): void {
    if (this.keepaliveTimer) { clearInterval(this.keepaliveTimer); this.keepaliveTimer = null; }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.attemptConnect();
    }, this.reconnectDelay);
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
  }

  onRequest(handler: RequestHandler): void { this.handler = handler; }
  onApprovalResponse(handler: ApprovalResponseHandler): void { this.approvalResponseHandler = handler; }

  sendResponse(response: ExtensionResponse): void {
    if (this.ws && this.ws.readyState === this.WS.OPEN) {
      this.ws.send(JSON.stringify(response));
    }
  }

  sendApprovalRequest(request: ApprovalRequest): void {
    if (this.ws && this.ws.readyState === this.WS.OPEN) {
      this.ws.send(JSON.stringify(request));
    }
  }

  sendApprovalResponse(response: ApprovalResponse): void {
    if (this.ws && this.ws.readyState === this.WS.OPEN) {
      this.ws.send(JSON.stringify(response));
    }
  }

  isConnected(): boolean { return this.ws !== null && this.ws.readyState === this.WS.OPEN; }

  waitConnected(timeoutMs = 2000): Promise<boolean> {
    if (!this.ws || this.ws.readyState === this.WS.OPEN) {
      return Promise.resolve(this.isConnected());
    }
    return new Promise(resolve => {
      const ws = this.ws!;
      let settled = false;
      const cleanup = () => {
        if (settled) return;
        settled = true;
        ws.removeEventListener('open', onOpen);
        ws.removeEventListener('close', onClose);
      };
      const timer = setTimeout(() => { cleanup(); resolve(false); }, timeoutMs);
      const onOpen = () => { clearTimeout(timer); cleanup(); resolve(true); };
      const onClose = () => { clearTimeout(timer); cleanup(); resolve(false); };
      ws.addEventListener('open', onOpen);
      ws.addEventListener('close', onClose);
    });
  }

  disconnect(): void {
    this.intentionallyClosed = true;
    this.stopKeepalive();
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    if (this.ws) this.ws.close();
  }

  getSocket(): WebSocketLike | null { return this.ws; }
}
