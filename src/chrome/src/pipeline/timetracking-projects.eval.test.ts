import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  loadConnectorDef,
  resolveEvalCode,
  tokenEntry,
  freezeAt,
  runEvalCode,
} from './testing/eval-harness';

const FIXTURE = JSON.parse(
  readFileSync(join(__dirname, 'fixtures/timetracking-projects.api.json'), 'utf-8'),
) as unknown[];

interface RunOptions {
  args?: Record<string, string>;
  token?: Record<string, string>;
  fetchImpl?: ReturnType<typeof vi.fn>;
}

async function runEval(opts: RunOptions = {}) {
  const connector = loadConnectorDef('timetracking-projects.yaml');
  const code = resolveEvalCode(connector, opts.args ?? {});
  const fetchMock =
    opts.fetchImpl ??
    vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => FIXTURE });

  const rows = await runEvalCode<Record<string, unknown>[]>(code, {
    fetchImpl: fetchMock,
    token: opts.token,
  });
  return { rows, fetchMock, connector };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('timetracking/projects — eval.js against captured API payload', () => {
  it('flattens every project/activity pair into one row', async () => {
    const { rows } = await runEval();
    // 1 + 1 + 3 activities across the three projects in the fixture
    expect(rows).toHaveLength(5);
  });

  it('maps the API field names onto the connector columns', async () => {
    const { rows } = await runEval();
    expect(rows[0]).toEqual({
      projectId: 'PID0000111_001_041',
      projectName: 'ACME BC Capability development Q1-3',
      activityNumber: 'A000100001',
      activityName: 'Sec - Security Base',
      category: 'Non-billable hours',
      linePropertyId: 'NonBill',
    });
  });

  it('repeats the parent project on each of its activities', async () => {
    const { rows } = await runEval();
    const internal = rows.filter((r) => r.projectId === 'PID0000333');
    expect(internal).toHaveLength(3);
    expect(internal.map((r) => r.activityNumber)).toEqual([
      'A000100003',
      'A000100004',
      'A000100005',
    ]);
    expect(new Set(internal.map((r) => r.projectName)).size).toBe(1);
  });

  it('leaves no column null — a renamed API field would show up here', async () => {
    const { rows, connector } = await runEval();
    const columnNames = connector.columns.map((c) => c.name);
    for (const row of rows) {
      for (const col of columnNames) {
        expect(row[col], `column "${col}" was null/undefined`).not.toBeNull();
        expect(row[col], `column "${col}" was null/undefined`).toBeDefined();
      }
    }
  });

  it('emits exactly the columns declared in the YAML', async () => {
    const { rows, connector } = await runEval();
    const declared = connector.columns.map((c) => c.name).sort();
    expect(Object.keys(rows[0]).sort()).toEqual(declared);
  });
});

describe('timetracking/projects — request construction', () => {
  it('calls the Projects endpoint with a bearer token', async () => {
    const { fetchMock } = await runEval();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain(
      'https://mbti-bam-wzde-prd-ejdchtb0g9afexhr.a01.azurefd.net/api/Projects?date=',
    );
    expect(init.headers.Authorization).toBe('Bearer tok-123');
  });

  // `date` is an as-of DAY that only answers for the current date. A
  // YYYY-MM-01 date — or any historical one — returns HTTP 200 with an empty
  // array, which is how this connector silently returned zero rows.
  it('queries as of today, never a first-of-month date', async () => {
    freezeAt(2026, 6, 28);
    const { fetchMock } = await runEval();
    expect(fetchMock.mock.calls[0][0]).toContain('?date=2026-07-28');
  });

  it('pads single-digit months and days', async () => {
    freezeAt(2026, 1, 9);
    const { fetchMock } = await runEval();
    expect(fetchMock.mock.calls[0][0]).toContain('?date=2026-02-09');
  });

  // The roster is today-only, so the connector declares no args. A stray one
  // must not silently change the query.
  it('ignores a month arg it no longer declares', async () => {
    freezeAt(2026, 6, 28);
    const { fetchMock, connector } = await runEval({ args: { month: '2026-06' } });
    expect(connector.args).toEqual([]);
    expect(fetchMock.mock.calls[0][0]).toContain('?date=2026-07-28');
  });

  it('only requests hosts the connector declares', async () => {
    const { fetchMock, connector } = await runEval();
    const host = new URL(fetchMock.mock.calls[0][0] as string).hostname;
    expect(connector.domains).toContain(host);
  });
});

describe('timetracking/projects — failure modes', () => {
  it('throws on a non-2xx response rather than returning no rows', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 403, json: async () => ({}) });
    await expect(runEval({ fetchImpl })).rejects.toThrow('Projects API returned HTTP 403');
  });

  it('throws when no unexpired access token is in sessionStorage', async () => {
    vi.useFakeTimers();
    const promise = runEval({ token: tokenEntry('stale', -60) });
    // The eval polls sessionStorage for 60s to ride out an SSO/MFA redirect.
    const assertion = expect(promise).rejects.toThrow('No valid MSAL access token');
    await vi.advanceTimersByTimeAsync(61_000);
    await assertion;
  });

  it('CHARACTERIZATION: an empty project list is silently reported as success', async () => {
    // This is not desirable behaviour. It is how the 2026-07-28 breakage hid:
    // GET /api/Projects?date=YYYY-MM-01 returned HTTP 200 with `[]`, so the
    // connector reported ok/rowCount:0 rather than failing. The date bug is
    // fixed, but the silent-empty path remains. Pinned here so that if the eval
    // is changed to surface empty results, this test fails and forces a
    // deliberate decision.
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => [] });
    const { rows } = await runEval({ fetchImpl });
    expect(rows).toEqual([]);
  });
});
