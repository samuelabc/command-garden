// src/ws-relay.ts
import { randomUUID } from 'node:crypto';
import type { ConnectorDef, ExtensionRequest, ExtensionResponse } from '@commandgarden/shared';
import { isExtensionResponse } from '@commandgarden/shared';

interface PendingRequest {
  resolve: (resp: ExtensionResponse) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

interface SocketLike {
  on(event: string, cb: (...args: unknown[]) => void): void;
  send(data: string): void;
  close(): void;
}

export class WsRelay {
  private ws: SocketLike | null = null;
  private pending = new Map<string, PendingRequest>();

  get connected(): boolean { return this.ws !== null; }

  attach(ws: SocketLike): void {
    if (this.ws) this.ws.close();
    this.ws = ws;
    ws.on('message', (raw: unknown) => {
      const data = JSON.parse(String(raw));
      if (isExtensionResponse(data)) {
        const entry = this.pending.get(data.id);
        if (entry) {
          clearTimeout(entry.timer);
          this.pending.delete(data.id);
          entry.resolve(data);
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
    });
  }

  async send(
    connector: ConnectorDef,
    args: Record<string, string | number | boolean>,
    timeoutMs = 120_000,
  ): Promise<ExtensionResponse> {
    if (!this.ws) throw new Error('Extension not connected');
    const id = randomUUID();
    const request: ExtensionRequest = { id, connector, args };
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('Extension request timed out'));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.ws!.send(JSON.stringify(request));
    });
  }

  detach(): void {
    if (this.ws) { this.ws.close(); this.ws = null; }
  }
}
