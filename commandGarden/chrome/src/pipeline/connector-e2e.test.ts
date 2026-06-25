import { describe, it, expect, vi } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseConnectorYaml } from '@commandgarden/shared';
import { PipelineRunner, type ChromeAdapter } from './runner';

const CONNECTORS_DIR = join(__dirname, '../../../connectors');

function loadConnectorDef(filename: string) {
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

function mockAdapter(overrides?: Partial<ChromeAdapter>): ChromeAdapter {
  return {
    navigateTab: vi.fn().mockResolvedValue(1),
    waitForTabLoad: vi.fn().mockResolvedValue(undefined),
    executeInContent: vi.fn().mockResolvedValue(undefined),
    getCookies: vi.fn().mockResolvedValue({}),
    evaluateInPage: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('timetracking/report — pipeline execution', () => {
  const MOCK_ROWS = [
    { month: '2026-06', date: '2026-06-02', projectId: 'P001', category: 'Dev',
      activity: 'A001', hours: 8, status: 'RELEASED', journalId: 'J001', lineNumber: 1 },
  ];

  it('navigates to timetracking page and calls js_evaluate step', async () => {
    const connector = loadConnectorDef('timetracking-report.yaml');
    const evaluateInPage = vi.fn().mockResolvedValue(MOCK_ROWS);

    const adapter = mockAdapter({ evaluateInPage });
    const runner = new PipelineRunner(adapter);
    const result = await runner.run(connector, { month: '2026-06' });

    expect(result.ok).toBe(true);
    expect(adapter.navigateTab).toHaveBeenCalledWith(
      'https://timetracking.mercedes-benz-techinnovation.com/'
    );
    expect(evaluateInPage).toHaveBeenCalledTimes(1);
  });

  it('returns rows from js_evaluate as pipeline data', async () => {
    const connector = loadConnectorDef('timetracking-report.yaml');
    const evaluateInPage = vi.fn().mockResolvedValue(MOCK_ROWS);

    const adapter = mockAdapter({ evaluateInPage });
    const runner = new PipelineRunner(adapter);
    const result = await runner.run(connector, { month: '2026-06' });

    expect(result.ok).toBe(true);
    expect(result.data).toEqual(MOCK_ROWS);
  });

  it('interpolates month arg into js_evaluate code', async () => {
    const connector = loadConnectorDef('timetracking-report.yaml');
    const evaluateInPage = vi.fn().mockResolvedValue([]);

    const adapter = mockAdapter({ evaluateInPage });
    const runner = new PipelineRunner(adapter);
    await runner.run(connector, { month: '2026-07' });

    const code = evaluateInPage.mock.calls[0][1] as string;
    expect(code).toContain("let month = '2026-07'");
  });
});

describe('ConnectorRegistry loads sample connectors', () => {
  it('loads connectors from the connectors directory', async () => {
    const { ConnectorRegistry } = await import('../../../daemon/src/registry');
    const registry = new ConnectorRegistry([CONNECTORS_DIR]);
    const { loaded, errors } = registry.load();

    expect(errors).toEqual([]);
    expect(loaded).toBe(2);
    expect(registry.get('timetracking/report')).toBeDefined();
    expect(registry.get('teams/room-availability')).toBeDefined();
  });

  it('lists all connectors', async () => {
    const { ConnectorRegistry } = await import('../../../daemon/src/registry');
    const registry = new ConnectorRegistry([CONNECTORS_DIR]);
    registry.load();

    const keys = registry.keys();
    expect(keys).toContain('timetracking/report');
    expect(keys).toContain('teams/room-availability');
  });
});
