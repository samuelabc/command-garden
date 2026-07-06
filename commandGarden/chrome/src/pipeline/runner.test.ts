// src/pipeline/runner.test.ts
import { describe, it, expect, vi } from 'vitest';
import { PipelineRunner, type ChromeAdapter } from './runner.js';
import type { ConnectorDef, PipelineStep } from '@commandgarden/shared';

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

function makeConnector(pipeline: PipelineStep[]): ConnectorDef {
  return {
    site: 'test', name: 'cmd', version: '1.0', access: 'read',
    domains: ['example.com'], capabilities: ['navigate', 'dom_read', 'cookie_read'],
    args: [], columns: [], pipeline,
  } as unknown as ConnectorDef;
}

describe('PipelineRunner', () => {
  it('executes navigate step', async () => {
    const adapter = mockAdapter();
    const runner = new PipelineRunner(adapter);
    const connector = makeConnector([{ step: 'navigate', url: 'https://example.com' }]);
    await runner.run(connector, {});
    expect(adapter.navigateTab).toHaveBeenCalledWith('https://example.com');
  });

  it('executes wait step via content script', async () => {
    const adapter = mockAdapter();
    const runner = new PipelineRunner(adapter);
    const connector = makeConnector([
      { step: 'navigate', url: 'https://example.com' },
      { step: 'wait', selector: '.table', timeout: 5000 },
    ]);
    await runner.run(connector, {});
    expect(adapter.executeInContent).toHaveBeenCalled();
  });

  it('executes click_all step via content script', async () => {
    const adapter = mockAdapter();
    const runner = new PipelineRunner(adapter);
    const connector = makeConnector([
      { step: 'navigate', url: 'https://example.com' },
      { step: 'click_all', selector: 'button[aria-expanded="false"]', pause: 100, maxRounds: 5, settle: 200 },
    ] as unknown as import('@commandgarden/shared').PipelineStep[]);
    await runner.run(connector, {});
    expect(adapter.executeInContent).toHaveBeenCalled();
  });

  it('executes extract step and collects data', async () => {
    const adapter = mockAdapter({
      executeInContent: vi.fn().mockResolvedValue([{ name: 'Alice' }]),
    });
    const runner = new PipelineRunner(adapter);
    const connector = makeConnector([
      { step: 'navigate', url: 'https://example.com' },
      { step: 'extract', selector: 'tr', fields: { name: 'td' } },
    ]);
    const result = await runner.run(connector, {});
    expect(result.data).toEqual([{ name: 'Alice' }]);
  });

  it('executes set step and uses variable in later steps', async () => {
    const adapter = mockAdapter();
    const runner = new PipelineRunner(adapter);
    const connector = makeConnector([
      { step: 'set', name: 'base', value: 'https://example.com' },
      { step: 'navigate', url: '${{ vars.base }}/page' },
    ]);
    await runner.run(connector, {});
    expect(adapter.navigateTab).toHaveBeenCalledWith('https://example.com/page');
  });

  it('executes cookie step', async () => {
    const adapter = mockAdapter({
      getCookies: vi.fn().mockResolvedValue({ session: 'abc' }),
    });
    const runner = new PipelineRunner(adapter);
    const connector = makeConnector([
      { step: 'cookie', domain: 'example.com' },
    ]);
    await runner.run(connector, {});
    expect(adapter.getCookies).toHaveBeenCalledWith('example.com');
  });

  it('executes filter step on data', async () => {
    const adapter = mockAdapter({
      executeInContent: vi.fn().mockResolvedValue([
        { name: 'A', score: 5 }, { name: 'B', score: 15 },
      ]),
    });
    const runner = new PipelineRunner(adapter);
    const connector = makeConnector([
      { step: 'navigate', url: 'https://example.com' },
      { step: 'extract', selector: 'tr', fields: { name: 'td', score: 'td:nth-child(2)' } },
      { step: 'filter', field: 'score', operator: 'gt', value: '10' },
    ]);
    const result = await runner.run(connector, {});
    expect(result.data).toHaveLength(1);
    expect(result.data[0].name).toBe('B');
  });

  it('interpolates args in navigate URL', async () => {
    const adapter = mockAdapter();
    const runner = new PipelineRunner(adapter);
    const connector = makeConnector([
      { step: 'navigate', url: 'https://example.com/${{ args.month }}' },
    ]);
    await runner.run(connector, { month: '2026-06' });
    expect(adapter.navigateTab).toHaveBeenCalledWith('https://example.com/2026-06');
  });

  it('executes js_evaluate step and stores result as variable', async () => {
    const adapter = mockAdapter({
      evaluateInPage: vi.fn().mockResolvedValue('my-token'),
    });
    const runner = new PipelineRunner(adapter);
    const connector = makeConnector([
      { step: 'navigate', url: 'https://example.com' },
      { step: 'js_evaluate', code: 'return sessionStorage.getItem("token")', as: 'token' },
    ] as unknown as import('@commandgarden/shared').PipelineStep[]);
    const result = await runner.run(connector, {});
    expect(result.ok).toBe(true);
    expect(adapter.evaluateInPage).toHaveBeenCalledWith(1, 'return sessionStorage.getItem("token")');
  });

  it('executes js_evaluate step and sets data when no as', async () => {
    const mockRows = [{ name: 'Alice' }, { name: 'Bob' }];
    const adapter = mockAdapter({
      evaluateInPage: vi.fn().mockResolvedValue(mockRows),
    });
    const runner = new PipelineRunner(adapter);
    const connector = makeConnector([
      { step: 'navigate', url: 'https://example.com' },
      { step: 'js_evaluate', code: 'return [{name:"Alice"},{name:"Bob"}]' },
    ] as unknown as import('@commandgarden/shared').PipelineStep[]);
    const result = await runner.run(connector, {});
    expect(result.ok).toBe(true);
    expect(result.data).toEqual(mockRows);
  });

  it('returns error result on step failure', async () => {
    const adapter = mockAdapter({
      navigateTab: vi.fn().mockRejectedValue(new Error('Tab error')),
    });
    const runner = new PipelineRunner(adapter);
    const connector = makeConnector([{ step: 'navigate', url: 'https://example.com' }]);
    const result = await runner.run(connector, {});
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Tab error');
  });

  it('calls approval gate before step with matching capability', async () => {
    const adapter = mockAdapter();
    const gate = vi.fn().mockResolvedValue(true);
    const approvalConfig = { approvalRequired: ['navigate'], autoApproveConnectors: [], approvalTimeoutMs: 120_000 };
    const runner = new PipelineRunner(adapter, gate, approvalConfig);
    const connector = makeConnector([{ step: 'navigate', url: 'https://example.com' }]);
    await runner.run(connector, {});
    expect(gate).toHaveBeenCalledWith('navigate', 0, 'navigate', expect.any(String));
    expect(adapter.navigateTab).toHaveBeenCalled();
  });

  it('aborts pipeline when approval gate rejects', async () => {
    const adapter = mockAdapter();
    const gate = vi.fn().mockResolvedValue(false);
    const approvalConfig = { approvalRequired: ['navigate'], autoApproveConnectors: [], approvalTimeoutMs: 120_000 };
    const runner = new PipelineRunner(adapter, gate, approvalConfig);
    const connector = makeConnector([{ step: 'navigate', url: 'https://example.com' }]);
    const result = await runner.run(connector, {});
    expect(result.ok).toBe(false);
    expect(result.error).toContain('rejected');
    expect(adapter.navigateTab).not.toHaveBeenCalled();
  });

  it('skips approval gate for steps without matching capability', async () => {
    const adapter = mockAdapter();
    const gate = vi.fn().mockResolvedValue(true);
    const approvalConfig = { approvalRequired: ['js_evaluate'], autoApproveConnectors: [], approvalTimeoutMs: 120_000 };
    const runner = new PipelineRunner(adapter, gate, approvalConfig);
    const connector = makeConnector([{ step: 'navigate', url: 'https://example.com' }]);
    await runner.run(connector, {});
    expect(gate).not.toHaveBeenCalled();
  });

  it('skips approval gate for auto-approved connectors', async () => {
    const adapter = mockAdapter();
    const gate = vi.fn().mockResolvedValue(true);
    const approvalConfig = { approvalRequired: ['navigate'], autoApproveConnectors: ['test/cmd'], approvalTimeoutMs: 120_000 };
    const runner = new PipelineRunner(adapter, gate, approvalConfig, 'test/cmd');
    const connector = makeConnector([{ step: 'navigate', url: 'https://example.com' }]);
    await runner.run(connector, {});
    expect(gate).not.toHaveBeenCalled();
  });

  it('includes step summaries in successful response', async () => {
    const adapter = mockAdapter({
      executeInContent: vi.fn().mockResolvedValue([{ name: 'Alice' }]),
    });
    const runner = new PipelineRunner(adapter);
    const connector = makeConnector([
      { step: 'navigate', url: 'https://example.com' },
      { step: 'extract', selector: 'tr', fields: { name: 'td' } },
    ]);
    const result = await runner.run(connector, {});
    expect(result.ok).toBe(true);
    expect(result.steps).toBeDefined();
    expect(result.steps).toHaveLength(2);
    expect(result.steps![0].step).toBe('navigate');
    expect(result.steps![0].index).toBe(0);
    expect(result.steps![0].capability).toBe('navigate');
    expect(result.steps![0].durationMs).toBeGreaterThanOrEqual(0);
    expect(result.steps![1].step).toBe('extract');
    expect(result.steps![1].index).toBe(1);
  });

  it('includes step summaries on error with failed step marked', async () => {
    const adapter = mockAdapter({
      navigateTab: vi.fn().mockResolvedValue(1),
      waitForTabLoad: vi.fn().mockResolvedValue(undefined),
      executeInContent: vi.fn().mockRejectedValue(new Error('DOM error')),
    });
    const runner = new PipelineRunner(adapter);
    const connector = makeConnector([
      { step: 'navigate', url: 'https://example.com' },
      { step: 'extract', selector: 'tr', fields: { name: 'td' } },
    ]);
    const result = await runner.run(connector, {});
    expect(result.ok).toBe(false);
    expect(result.steps).toBeDefined();
    expect(result.steps).toHaveLength(2);
    expect(result.steps![0].error).toBeUndefined();
    expect(result.steps![1].error).toContain('DOM error');
  });

  it('map step resolves ${{ row.field }} and produces mapped data', async () => {
    const adapter = mockAdapter({
      executeInContent: vi.fn().mockResolvedValue([
        { id: 'abc-123', name: 'Alice', extra: 'ignored' },
        { id: 'def-456', name: 'Bob', extra: 'also ignored' },
      ]),
    });
    const runner = new PipelineRunner(adapter);
    const connector = makeConnector([
      { step: 'navigate', url: 'https://example.com' },
      { step: 'extract', selector: 'tr', fields: { id: 'td', name: 'td:nth-child(2)', extra: 'td:nth-child(3)' } },
      { step: 'map', fields: { userId: '${{ row.id }}', userName: '${{ row.name }}' } },
    ]);
    const result = await runner.run(connector, {});
    expect(result.ok).toBe(true);
    expect(result.data).toEqual([
      { userId: 'abc-123', userName: 'Alice' },
      { userId: 'def-456', userName: 'Bob' },
    ]);
  });

  it('map step also supports ${{ vars.row.field }} path', async () => {
    const adapter = mockAdapter({
      executeInContent: vi.fn().mockResolvedValue([{ x: 42 }]),
    });
    const runner = new PipelineRunner(adapter);
    const connector = makeConnector([
      { step: 'navigate', url: 'https://example.com' },
      { step: 'extract', selector: 'tr', fields: { x: 'td' } },
      { step: 'map', fields: { val: '${{ vars.row.x }}' } },
    ]);
    const result = await runner.run(connector, {});
    expect(result.data).toEqual([{ val: '42' }]);
  });

  it('map step returns "undefined" for missing row fields', async () => {
    const adapter = mockAdapter({
      executeInContent: vi.fn().mockResolvedValue([{ a: 1 }]),
    });
    const runner = new PipelineRunner(adapter);
    const connector = makeConnector([
      { step: 'navigate', url: 'https://example.com' },
      { step: 'extract', selector: 'tr', fields: { a: 'td' } },
      { step: 'map', fields: { missing: '${{ row.nonexistent }}' } },
    ]);
    const result = await runner.run(connector, {});
    expect(result.ok).toBe(true);
    expect(result.data).toEqual([{ missing: 'undefined' }]);
  });

  it('steps with no capability have capability undefined', async () => {
    const adapter = mockAdapter({
      executeInContent: vi.fn().mockResolvedValue([{ name: 'A', score: 5 }]),
    });
    const runner = new PipelineRunner(adapter);
    const connector = makeConnector([
      { step: 'navigate', url: 'https://example.com' },
      { step: 'extract', selector: 'tr', fields: { name: 'td' } },
      { step: 'map', fields: { title: '${{ row.name }}' } },
    ]);
    const result = await runner.run(connector, {});
    expect(result.steps![2].step).toBe('map');
    expect(result.steps![2].capability).toBeUndefined();
  });

  it('skips approval gate for steps with null capability', async () => {
    const adapter = mockAdapter({
      executeInContent: vi.fn().mockResolvedValue([{ name: 'A', score: 5 }]),
    });
    const gate = vi.fn().mockResolvedValue(true);
    const approvalConfig = { approvalRequired: ['navigate'], autoApproveConnectors: [], approvalTimeoutMs: 120_000 };
    const runner = new PipelineRunner(adapter, gate, approvalConfig);
    const connector = makeConnector([
      { step: 'navigate', url: 'https://example.com' },
      { step: 'extract', selector: 'tr', fields: { name: 'td' } },
      { step: 'map', fields: { title: '${{ row.name }}' } },
    ]);
    await runner.run(connector, {});
    // navigate requires approval, map has null capability so no approval
    expect(gate).toHaveBeenCalledTimes(1);
  });
});
