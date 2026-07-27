import { readFileSync } from 'node:fs';

export function readToken(tokenPath: string): string | null {
  try {
    return readFileSync(tokenPath, 'utf-8').trim();
  } catch {
    return null;
  }
}

/**
 * A non-2xx response from the daemon.
 *
 * Carries the status so callers can tell "this thing does not exist" apart
 * from "the daemon is broken" — a transport failure still throws a plain
 * Error, since there is no status to report.
 */
export class DaemonHttpError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'DaemonHttpError';
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
    let resp: Response;
    try {
      resp = await this.rawFetch('/api/status', { method: 'GET' });
    } catch {
      throw new Error('Cannot connect to daemon. Is it running? Try: cg daemon start');
    }
    const data = await resp.json();
    if (!resp.ok) {
      throw new DaemonHttpError((data as Record<string, string>).error ?? `HTTP ${resp.status}`, resp.status);
    }
    return data as { ok: boolean; extensionConnected: boolean; connectorCount: number };
  }

  async pipeRaw(path: string): Promise<Response> {
    const resp = await this.rawFetch(path, {
      method: 'GET',
      headers: this.sseHeaders(),
    });
    if (!resp.ok) throw new Error(`SSE connection failed: HTTP ${resp.status}`);
    return resp;
  }

  async connectSSE(
    path: string,
    onEvent: (event: string, data: unknown) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    const resp = await this.rawFetch(path, {
      method: 'GET',
      headers: this.sseHeaders(),
      signal,
    });

    if (!resp.ok || !resp.body) {
      throw new Error(`SSE connection failed: HTTP ${resp.status}`);
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        let currentEvent = 'message';
        let currentData = '';
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            currentData = line.slice(6);
          } else if (line === '') {
            if (currentData) {
              try {
                onEvent(currentEvent, JSON.parse(currentData));
              } catch {
                onEvent(currentEvent, currentData);
              }
              currentData = '';
              currentEvent = 'message';
            }
          }
        }
      }
    } catch (err) {
      if (signal?.aborted) return;
      throw err;
    }
  }

  private sseHeaders(): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.token}`,
      'X-CommandGarden': '1',
      'Accept': 'text/event-stream',
    };
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
      throw new Error('Cannot connect to daemon. Is it running? Try: cg daemon start');
    }

    const data = await resp.json();
    if (!resp.ok) {
      throw new DaemonHttpError((data as Record<string, string>).error ?? `HTTP ${resp.status}`, resp.status);
    }
    return data as T;
  }

  private rawFetch(path: string, init: RequestInit): Promise<Response> {
    return fetch(`${this.baseUrl}${path}`, init);
  }
}
