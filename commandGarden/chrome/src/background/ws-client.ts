// src/background/ws-client.ts
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

  constructor(
    private url: string,
    private WS: WebSocketConstructor = globalThis.WebSocket as unknown as WebSocketConstructor,
  ) {}

  connect(): void {
    this.ws = new this.WS(this.url);
    const onMessage = (event: unknown) => {
      const data = typeof event === 'string' ? event : (event as { data?: string })?.data;
      if (!data || !this.handler) return;
      try {
        const parsed = JSON.parse(String(data));
        if (parsed.id && parsed.connector) this.handler(parsed as ExtensionRequest);
      } catch { /* ignore parse errors */ }
    };
    const onClose = () => { this.ws = null; };
    this.ws.addEventListener('message', onMessage);
    this.ws.addEventListener('close', onClose);
  }

  onRequest(handler: RequestHandler): void { this.handler = handler; }

  sendResponse(response: ExtensionResponse): void {
    if (this.ws && this.ws.readyState === this.WS.OPEN) {
      this.ws.send(JSON.stringify(response));
    }
  }

  isConnected(): boolean { return this.ws !== null && this.ws.readyState === this.WS.OPEN; }

  disconnect(): void { if (this.ws) this.ws.close(); }

  getSocket(): WebSocketLike | null { return this.ws; }
}
