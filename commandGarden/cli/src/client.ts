// src/client.ts
import { readFileSync } from 'node:fs';

export function readToken(tokenPath: string): string | null {
  try {
    return readFileSync(tokenPath, 'utf-8').trim();
  } catch {
    return null;
  }
}

export class DaemonClient {
  constructor(
    private baseUrl: string,
    private token: string,
  ) {}

  async get<T = Record<string, unknown>>(path: string): Promise<T> {
    return this.request('GET', path);
  }

  async post<T = Record<string, unknown>>(path: string, body: unknown): Promise<T> {
    return this.request('POST', path, body);
  }

  async status(): Promise<{ ok: boolean; extensionConnected: boolean; connectorCount: number }> {
    const resp = await this.rawFetch('/api/status', { method: 'GET' });
    return resp.json() as Promise<{ ok: boolean; extensionConnected: boolean; connectorCount: number }>;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    let resp: Response;
    try {
      resp = await this.rawFetch(path, {
        method,
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'X-CommandGarden': '1',
          'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new Error('Cannot connect to daemon. Is it running? Try: commandgarden daemon start');
    }

    const data = await resp.json();
    if (!resp.ok) {
      throw new Error((data as Record<string, string>).error ?? `HTTP ${resp.status}`);
    }
    return data as T;
  }

  private rawFetch(path: string, init: RequestInit): Promise<Response> {
    return fetch(`${this.baseUrl}${path}`, init);
  }
}
