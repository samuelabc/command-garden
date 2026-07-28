import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  loadConnectorDef,
  resolveEvalCode,
  tokenEntry,
  freezeAt,
  runEvalCode,
  fetchRouter,
} from './testing/eval-harness';

const PROJECTS = JSON.parse(
  readFileSync(join(__dirname, 'fixtures/timetracking-projects.api.json'), 'utf-8'),
);
const REPORTFAK = JSON.parse(
  readFileSync(join(__dirname, 'fixtures/timetracking-reportfak.api.json'), 'utf-8'),
);

interface RunOptions {
  month?: string;
  projects?: unknown;
  projectsOk?: boolean;
  reportOk?: boolean;
  fetchImpl?: unknown;
}

async function runReport(opts: RunOptions = {}) {
  const connector = loadConnectorDef('timetracking-report.yaml');
  const code = resolveEvalCode(connector, opts.month ? { month: opts.month } : {});
  const fetchMock =
    opts.fetchImpl ??
    fetchRouter([
      { match: 'ReportFAK', body: REPORTFAK, ok: opts.reportOk ?? true, status: opts.reportOk === false ? 500 : 200 },
      { match: 'Projects', body: opts.projects ?? PROJECTS, ok: opts.projectsOk ?? true },
    ]);

  const rows = await runEvalCode<Record<string, unknown>[]>(code, { fetchImpl: fetchMock });
  return { rows, fetchMock: fetchMock as ReturnType<typeof vi.fn>, connector };
}

function urlFor(fetchMock: ReturnType<typeof vi.fn>, needle: string): string {
  const call = fetchMock.mock.calls.find((c) => String(c[0]).includes(needle));
  if (!call) throw new Error(`no fetch matching ${needle}`);
  return String(call[0]);
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('timetracking/report — the two endpoints need different dates', () => {
  // This is the regression guard for the 2026-07-28 breakage: both URLs were
  // built from `month + '-01'`, so Projects returned HTTP 200 with [] and every
  // projectName/activityName silently came back null.
  it('sends the period start to ReportFAK but today to Projects', async () => {
    freezeAt(2026, 6, 28);
    const { fetchMock } = await runReport({ month: '2026-06' });
    expect(urlFor(fetchMock, 'ReportFAK')).toContain('?date=2026-06-01');
    expect(urlFor(fetchMock, 'Projects')).toContain('?date=2026-07-28');
  });

  it('never sends a first-of-month date to Projects', async () => {
    freezeAt(2026, 6, 28);
    const { fetchMock } = await runReport({ month: '2026-07' });
    expect(urlFor(fetchMock, 'Projects')).not.toContain('-01');
  });

  it('queries Projects as of today even for the current month', async () => {
    freezeAt(2026, 1, 9);
    const { fetchMock } = await runReport();
    expect(urlFor(fetchMock, 'ReportFAK')).toContain('?date=2026-02-01');
    expect(urlFor(fetchMock, 'Projects')).toContain('?date=2026-02-09');
  });
});

describe('timetracking/report — name resolution', () => {
  it('resolves projectName and activityName from the Projects roster', async () => {
    const { rows } = await runReport({ month: '2026-06' });
    expect(rows[0].projectId).toBe('PID0000222_007_001');
    expect(rows[0].projectName).toBe('RD-XYZ Widgetmaster CLOUD & EXA Example Tools 2026');
    expect(rows[0].activityName).toBe('EXA-SEC-Tools DEV ZZ');
  });

  it('resolves names per activity, not just per project', async () => {
    const { rows } = await runReport({ month: '2026-06' });
    const row = rows.find((r) => r.activity === 'A000100004');
    expect(row?.projectName).toBe('Internal - ACME 0000 Example Co Widget Embedded onboard &');
    expect(row?.activityName).toBe('Organisation & Events');
  });

  it('leaves names null for a booking whose project is off the roster', async () => {
    const { rows } = await runReport({ month: '2026-06' });
    const orphan = rows.find((r) => r.projectId === 'PID9999999_000_000');
    expect(orphan?.projectName).toBeNull();
    expect(orphan?.activityName).toBeNull();
  });

  it('flattens every calendar line into a row', async () => {
    const { rows } = await runReport({ month: '2026-06' });
    expect(rows).toHaveLength(4);
    expect(rows.map((r) => r.hours)).toEqual([8, 6, 2, 4]);
    expect(new Set(rows.map((r) => r.month))).toEqual(new Set(['2026-06']));
  });

  it('emits exactly the columns declared in the YAML', async () => {
    const { rows, connector } = await runReport({ month: '2026-06' });
    const declared = connector.columns.map((c) => c.name).sort();
    expect(Object.keys(rows[0]).sort()).toEqual(declared);
  });
});

describe('timetracking/report — degradation', () => {
  // Projects failing must not take the whole report down, but it must also not
  // be mistaken for success: the rows still arrive, with null names.
  it('still returns bookings when the Projects lookup fails', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes('Projects')) throw new Error('network down');
      return { ok: true, status: 200, json: async () => REPORTFAK };
    });
    const { rows } = await runReport({ month: '2026-06', fetchImpl });
    expect(rows).toHaveLength(4);
    expect(rows.every((r) => r.projectName === null)).toBe(true);
    expect(rows.every((r) => r.hours !== null)).toBe(true);
  });

  it('still returns bookings when Projects responds non-2xx', async () => {
    const { rows } = await runReport({ month: '2026-06', projectsOk: false });
    expect(rows).toHaveLength(4);
    expect(rows.every((r) => r.activityName === null)).toBe(true);
  });

  it('throws when ReportFAK itself fails', async () => {
    await expect(runReport({ month: '2026-06', reportOk: false })).rejects.toThrow(
      'ReportFAK returned HTTP 500',
    );
  });

  it('throws when no unexpired access token is in sessionStorage', async () => {
    vi.useFakeTimers();
    const connector = loadConnectorDef('timetracking-report.yaml');
    const code = resolveEvalCode(connector, { month: '2026-06' });
    const promise = runEvalCode(code, {
      fetchImpl: vi.fn(),
      token: tokenEntry('stale', -60),
    });
    const assertion = expect(promise).rejects.toThrow('No valid MSAL access token');
    await vi.advanceTimersByTimeAsync(61_000);
    await assertion;
  });
});
