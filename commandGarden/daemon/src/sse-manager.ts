// src/sse-manager.ts

export type SseWriter = (event: string, data: unknown) => void;

export class SseManager {
  private clients = new Map<string, SseWriter>();
  private readyResolvers = new Map<string, { resolve: () => void; reject: (err: Error) => void }>();

  waitForConnection(requestId: string, timeoutMs: number): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.readyResolvers.delete(requestId)) {
          reject(new Error('SSE connection timeout'));
        }
      }, timeoutMs);
      this.readyResolvers.set(requestId, {
        resolve: () => { clearTimeout(timer); resolve(); },
        reject: (err) => { clearTimeout(timer); reject(err); },
      });
    });
  }

  register(requestId: string, writer: SseWriter): void {
    this.clients.set(requestId, writer);
    const entry = this.readyResolvers.get(requestId);
    if (entry) {
      this.readyResolvers.delete(requestId);
      entry.resolve();
    }
  }

  send(requestId: string, event: string, data: unknown): boolean {
    const writer = this.clients.get(requestId);
    if (!writer) return false;
    writer(event, data);
    return true;
  }

  remove(requestId: string): void {
    this.clients.delete(requestId);
  }
}
