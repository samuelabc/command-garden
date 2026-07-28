// Test helper. Not collected as a suite (vitest include is `src/**/*.test.ts`)
// and excluded from tsconfig via `src/**/testing/**` — importing `node:fs` here
// would otherwise pull @types/node globals into a program typed for WebWorker,
// retyping setInterval as NodeJS.Timeout and breaking background/ws-client.ts.
//
// Executes a connector's real .eval.js the same way the extension does, so
// tests exercise the shipped file rather than a copy of its logic.
import { vi } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseConnectorYaml, type ConnectorDef } from '@commandgarden/shared';
import { PipelineContext } from '../context.js';

export const CONNECTORS_DIR = join(__dirname, '../../../../../connectors');

/** Mirrors ConnectorRegistry.resolveFileRefs: inline each js_evaluate file. */
export function loadConnectorDef(filename: string): ConnectorDef {
  const yaml = readFileSync(join(CONNECTORS_DIR, filename), 'utf-8');
  const result = parseConnectorYaml(yaml);
  if (!result.ok) throw new Error(result.error.message);
  for (const step of result.data.pipeline) {
    if (step.step === 'js_evaluate' && step.file) {
      const filePath = join(CONNECTORS_DIR, step.file);
      if (!existsSync(filePath)) throw new Error(`File not found: ${step.file}`);
      (step as { code?: string }).code = readFileSync(filePath, 'utf-8');
    }
  }
  return result.data;
}

/** Interpolates `${{ args.* }}` through the real expression engine. */
export function resolveEvalCode(connector: ConnectorDef, args: Record<string, string>): string {
  const step = connector.pipeline.find((s) => s.step === 'js_evaluate');
  if (!step || !('code' in step) || !step.code) throw new Error('no js_evaluate step with code');
  return new PipelineContext(args).interpolate(step.code);
}

/**
 * Minimal stand-in for the browser Storage object. `getItem` is non-enumerable
 * so an eval's `Object.keys(sessionStorage)` scan sees only stored entries.
 */
export function makeSessionStorage(entries: Record<string, string>): Record<string, unknown> {
  const store = { ...entries };
  const stub: Record<string, unknown> = { ...store };
  Object.defineProperty(stub, 'getItem', {
    value: (k: string) => store[k] ?? null,
    enumerable: false,
  });
  return stub;
}

export function tokenEntry(secret: string, expiresInSeconds: number): Record<string, string> {
  return {
    'msal.abc-def.accesstoken.timetracking': JSON.stringify({
      secret,
      expiresOn: String(Math.floor(Date.now() / 1000) + expiresInSeconds),
    }),
  };
}

/** Pins the clock so as-of date arithmetic is deterministic. Month is 0-indexed. */
export function freezeAt(year: number, monthIndex: number, day: number): void {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(year, monthIndex, day, 12, 0, 0));
}

/** Matches chrome-adapter.evaluateInPage: `new AsyncFunction(code)()`. */
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

export async function runEvalCode<T>(
  code: string,
  opts: { fetchImpl: unknown; token?: Record<string, string> },
): Promise<T> {
  vi.stubGlobal('sessionStorage', makeSessionStorage(opts.token ?? tokenEntry('tok-123', 3600)));
  vi.stubGlobal('fetch', opts.fetchImpl);
  return (await new AsyncFunction(code)()) as T;
}

/** Builds a fetch stub that resolves each URL by substring match. */
export function fetchRouter(routes: { match: string; body: unknown; ok?: boolean; status?: number }[]) {
  return vi.fn(async (url: string) => {
    const route = routes.find((r) => url.includes(r.match));
    if (!route) throw new Error(`unrouted fetch: ${url}`);
    return { ok: route.ok ?? true, status: route.status ?? 200, json: async () => route.body };
  });
}
