import { describe, it, expect, vi } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseConnectorYaml } from '@commandgarden/shared';
import { PipelineRunner, type ChromeAdapter } from './runner';

const CONNECTORS_DIR = join(__dirname, '../../../../connectors');

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

describe('gcs/kb-pages — declarative pipeline (no js_evaluate)', () => {
  const MOCK_TREE_RAW = [
    { title: 'EDR', url: '/gcs/KB/docs/general-security/edr/', section: 'Security', path: 'Security / EDR', depth: 1 },
  ];
  const MOCK_TREE_MAPPED = [
    { title: 'EDR', url: 'gcs/KB/docs/general-security/edr/', section: 'Security', path: 'Security / EDR', depth: '1' },
  ];

  it('loads gcs-kb-pages connector without js_evaluate', () => {
    const connector = loadConnectorDef('gcs-kb-pages.yaml');
    expect(connector.capabilities).not.toContain('js_evaluate');
    expect(connector.capabilities).toContain('dom_read');
    expect(connector.capabilities).toContain('dom_write');
  });

  it('runs gcs-kb-pages pipeline with click_all and extract_tree', async () => {
    const connector = loadConnectorDef('gcs-kb-pages.yaml');
    const executeInContent = vi.fn()
      .mockResolvedValueOnce(undefined) // wait
      .mockResolvedValueOnce(undefined) // click_all
      .mockResolvedValueOnce(MOCK_TREE_RAW); // extract_tree

    const adapter = mockAdapter({ executeInContent });
    const runner = new PipelineRunner(adapter);
    const result = await runner.run(connector, {});

    expect(result.ok).toBe(true);
    expect(result.data).toEqual(MOCK_TREE_MAPPED);
    expect(adapter.navigateTab).toHaveBeenCalledWith(
      'https://pages.i.mercedes-benz.com/gcs/KB/docs/main/'
    );
    // Should NOT call evaluateInPage (no js_evaluate)
    expect(adapter.evaluateInPage).not.toHaveBeenCalled();
  });
});

describe('gcs/kb-content — declarative pipeline (no js_evaluate)', () => {
  it('loads gcs-kb-content connector without js_evaluate', () => {
    const connector = loadConnectorDef('gcs-kb-content.yaml');
    expect(connector.capabilities).not.toContain('js_evaluate');
    expect(connector.capabilities).toContain('dom_read');
  });

  it('runs extension-side steps of gcs-kb-content pipeline', async () => {
    const connector = loadConnectorDef('gcs-kb-content.yaml');
    // Only extension steps should run in PipelineRunner
    // transform steps are daemon-side and would be skipped/errored
    // For this test we verify the extension-side steps work
    const executeInContent = vi.fn()
      .mockResolvedValueOnce(undefined) // wait
      .mockResolvedValueOnce([{ title: 'EDR', authorPill: 'Alice (ID)|Jan 15, 2025' }]) // extract
      .mockResolvedValueOnce('<h1>EDR</h1><p>Content</p>'); // extract_html

    const adapter = mockAdapter({ executeInContent });
    const runner = new PipelineRunner(adapter);

    // Use splitPipeline to only run extension steps
    const { splitPipeline } = await import('@commandgarden/shared');
    const { extensionSteps, daemonSteps } = splitPipeline(connector.pipeline);
    expect(daemonSteps).toHaveLength(2); // two transform steps

    // Run only extension steps
    const extConnector = { ...connector, pipeline: extensionSteps };
    const result = await runner.run(extConnector, { path: 'gcs/KB/docs/general-security/edr/' });

    expect(result.ok).toBe(true);
    expect(adapter.navigateTab).toHaveBeenCalled();
    expect(adapter.evaluateInPage).not.toHaveBeenCalled();
  });
});

describe('ConnectorRegistry loads sample connectors', () => {
  it('loads connectors from the connectors directory', async () => {
    const { ConnectorRegistry } = await import('../../../daemon/src/registry');
    const registry = new ConnectorRegistry([CONNECTORS_DIR]);
    const { loaded, errors } = registry.load();

    expect(errors).toEqual([]);
    expect(loaded).toBeGreaterThanOrEqual(7);
    expect(registry.get('timetracking/report')).toBeDefined();
    expect(registry.get('timetracking/projects')).toBeDefined();
    expect(registry.get('teams/room-availability')).toBeDefined();
    expect(registry.get('ado/git-commits')).toBeDefined();
    expect(registry.get('jira/my-tickets')).toBeDefined();
    expect(registry.get('outlook/my-meetings')).toBeDefined();
    expect(registry.get('tokenmaster/clients-list')).toBeDefined();
  });

  it('lists all connectors', async () => {
    const { ConnectorRegistry } = await import('../../../daemon/src/registry');
    const registry = new ConnectorRegistry([CONNECTORS_DIR]);
    registry.load();

    const keys = registry.keys();
    expect(keys).toContain('timetracking/report');
    expect(keys).toContain('timetracking/projects');
    expect(keys).toContain('teams/room-availability');
  });
});
