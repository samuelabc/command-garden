import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseConnectorYaml } from '@commandgarden/shared';
import { PipelineRunner, type ChromeAdapter } from './runner';

const CONNECTORS_DIR = join(__dirname, '../../../connectors');

function loadConnectorDef(filename: string) {
  const yaml = readFileSync(join(CONNECTORS_DIR, filename), 'utf-8');
  const result = parseConnectorYaml(yaml);
  if (!result.ok) throw new Error(result.error.message);
  return result.data;
}

function mockAdapter(overrides?: Partial<ChromeAdapter>): ChromeAdapter {
  return {
    navigateTab: vi.fn().mockResolvedValue(1),
    waitForTabLoad: vi.fn().mockResolvedValue(undefined),
    executeInContent: vi.fn().mockResolvedValue(undefined),
    getCookies: vi.fn().mockResolvedValue({}),
    ...overrides,
  };
}

describe('demo/extract-table — full pipeline', () => {
  const MOCK_DOM_DATA = [
    { name: ' Alice ', email: ' ALICE@DEMO.COM ', rawScore: '85', status: ' active ' },
    { name: ' Bob ', email: ' BOB@DEMO.COM ', rawScore: '42', status: ' inactive ' },
    { name: ' Carol ', email: ' CAROL@DEMO.COM ', rawScore: '91', status: ' active ' },
  ];

  it('executes full pipeline and returns mapped + filtered data', async () => {
    const connector = loadConnectorDef('demo-extract-table.yaml');
    const executeInContent = vi.fn()
      .mockResolvedValueOnce(undefined) // wait step
      .mockResolvedValueOnce(MOCK_DOM_DATA); // extract step

    const adapter = mockAdapter({ executeInContent });
    const runner = new PipelineRunner(adapter);
    const result = await runner.run(connector, { minScore: 50 });

    expect(result.ok).toBe(true);
    // After map: name trimmed, email lowered, rawScore→score as number string, status uppered
    // After filter: score >= 50 → Alice (85) and Carol (91), Bob (42) excluded
    expect(result.data).toHaveLength(2);
    expect(result.data[0]).toEqual({
      name: 'Alice',
      email: 'alice@demo.com',
      score: '85',
      status: 'ACTIVE',
    });
    expect(result.data[1]).toEqual({
      name: 'Carol',
      email: 'carol@demo.com',
      score: '91',
      status: 'ACTIVE',
    });
  });

  it('returns all rows when minScore is 0', async () => {
    const connector = loadConnectorDef('demo-extract-table.yaml');
    const executeInContent = vi.fn()
      .mockResolvedValueOnce(undefined) // wait
      .mockResolvedValueOnce(MOCK_DOM_DATA); // extract

    const adapter = mockAdapter({ executeInContent });
    const runner = new PipelineRunner(adapter);
    const result = await runner.run(connector, { minScore: 0 });

    expect(result.ok).toBe(true);
    expect(result.data).toHaveLength(3);
  });

  it('navigates to the correct URL', async () => {
    const connector = loadConnectorDef('demo-extract-table.yaml');
    const adapter = mockAdapter({
      executeInContent: vi.fn()
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce([]),
    });
    const runner = new PipelineRunner(adapter);
    await runner.run(connector, { minScore: 0 });

    expect(adapter.navigateTab).toHaveBeenCalledWith('https://demo.example.com/users');
  });

  it('returns empty data when no rows match filter', async () => {
    const connector = loadConnectorDef('demo-extract-table.yaml');
    const executeInContent = vi.fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(MOCK_DOM_DATA);

    const adapter = mockAdapter({ executeInContent });
    const runner = new PipelineRunner(adapter);
    const result = await runner.run(connector, { minScore: 100 });

    expect(result.ok).toBe(true);
    expect(result.data).toHaveLength(0);
  });
});

describe('timetracking/report — pipeline execution', () => {
  it('navigates to timetracking page and calls fetch step', async () => {
    const connector = loadConnectorDef('timetracking-report.yaml');
    const mockReportData = [
      { date: '2026-06-02', calendarHeader: { status: 'RELEASED' }, calendarLines: [
        { mserp_projectid: 'P001', mserp_category: 'Dev', mserp_activitynumber: 'A001',
          mserp_hours: 8, mserp_journalid: 'J001', mserp_linenumber: 1 },
      ]},
    ];

    const executeInContent = vi.fn()
      .mockResolvedValueOnce(undefined) // wait step
      .mockResolvedValueOnce(mockReportData); // fetch step

    const adapter = mockAdapter({ executeInContent });
    const runner = new PipelineRunner(adapter);
    const result = await runner.run(connector, { month: '2026-06' });

    expect(result.ok).toBe(true);
    expect(adapter.navigateTab).toHaveBeenCalledWith(
      'https://timetracking.mercedes-benz-techinnovation.com/'
    );
  });

  it('interpolates month arg into fetch URL', async () => {
    const connector = loadConnectorDef('timetracking-report.yaml');
    const executeInContent = vi.fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce([]);

    const adapter = mockAdapter({ executeInContent });
    const runner = new PipelineRunner(adapter);
    await runner.run(connector, { month: '2026-07' });

    // The fetch step should have been called with interpolated URL
    const fetchCall = executeInContent.mock.calls[1];
    expect(fetchCall).toBeDefined();
    const fetchStep = fetchCall[1];
    expect(fetchStep.url).toContain('2026-07-01');
  });
});

describe('ConnectorRegistry loads sample connectors', () => {
  it('loads connectors from the connectors directory', async () => {
    const { ConnectorRegistry } = await import('../../../daemon/src/registry');
    const registry = new ConnectorRegistry([CONNECTORS_DIR]);
    const { loaded, errors } = registry.load();

    expect(errors).toEqual([]);
    expect(loaded).toBe(2);
    expect(registry.get('demo/extract-table')).toBeDefined();
    expect(registry.get('timetracking/report')).toBeDefined();
  });

  it('lists all connectors', async () => {
    const { ConnectorRegistry } = await import('../../../daemon/src/registry');
    const registry = new ConnectorRegistry([CONNECTORS_DIR]);
    registry.load();

    const keys = registry.keys();
    expect(keys).toContain('demo/extract-table');
    expect(keys).toContain('timetracking/report');
  });
});
