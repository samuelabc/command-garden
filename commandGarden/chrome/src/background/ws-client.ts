// src/background/ws-client.ts
declare function setTimeout(cb: () => void, ms: number): number;
declare function clearTimeout(id: number): void;
import type { ExtensionRequest, ExtensionResponse } from '@commandgarden/shared';

type RequestHandler = (request: ExtensionRequest) => void;

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
  private reconnectTimer: number | null = null;
  private reconnectDelay = 1000;
  private readonly maxReconnectDelay = 30000;
  private intentionallyClosed = false;

  constructor(
    private url: string,
    private WS: WebSocketConstructor = globalThis.WebSocket as unknown as WebSocketConstructor,
  ) {}

  connect(): void {
    this.intentionallyClosed = false;
    this.attemptConnect();
  }

  private attemptConnect(): void {
    try {
      this.ws = new this.WS(this.url);
    } catch {
      this.scheduleReconnect();
      return;
    }
    const onOpen = () => { this.reconnectDelay = 1000; };
    const onMessage = (event: unknown) => {
      const data = typeof event === 'string' ? event : (event as { data?: string })?.data;
      if (!data || !this.handler) return;
      try {
        const parsed = JSON.parse(String(data));
        if (parsed.id && parsed.connector) this.handler(parsed as ExtensionRequest);
      } catch { /* ignore parse errors */ }
    };
    const onClose = () => {
      this.ws = null;
      if (!this.intentionallyClosed) this.scheduleReconnect();
    };
    this.ws.addEventListener('open', onOpen);
    this.ws.addEventListener('message', onMessage);
    this.ws.addEventListener('close', onClose);
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

  sendResponse(response: ExtensionResponse): void {
    if (this.ws && this.ws.readyState === this.WS.OPEN) {
      this.ws.send(JSON.stringify(response));
    }
  }

  isConnected(): boolean { return this.ws !== null && this.ws.readyState === this.WS.OPEN; }

  disconnect(): void {
    this.intentionallyClosed = true;
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
    if (this.ws) this.ws.close();
  }

  getSocket(): WebSocketLike | null { return this.ws; }
}
