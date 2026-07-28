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
    addEgressRules: vi.fn().mockResolvedValue(undefined),
    removeEgressRules: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeConnector(pipeline: PipelineStep[]): ConnectorDef {
  return {
    site: 'test', name: 'cmd', version: '1.0', access: 'read',
    domains: ['example.com'],
    capabilities: ['navigate', 'dom_read', 'dom_write', 'cookie_read', 'network_fetch', 'js_evaluate'],
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
    expect(adapter.waitForTabLoad).toHaveBeenCalledWith(1, ['example.com']);
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

  it('fetch step with dataPath: content-script unwraps, runner receives array', async () => {
    // Content-script handles dataPath unwrapping; runner sees the resulting array
    const unwrappedItems = [{ name: 'Article 1' }, { name: 'Article 2' }];
    const adapter = mockAdapter({
      executeInContent: vi.fn().mockResolvedValue(unwrappedItems),
    });
    const runner = new PipelineRunner(adapter);
    const connector = makeConnector([
      { step: 'navigate', url: 'https://example.com' },
      { step: 'fetch', url: 'https://example.com/feed.json', dataPath: 'items' },
    ] as unknown as import('@commandgarden/shared').PipelineStep[]);
    const result = await runner.run(connector, {});
    expect(result.ok).toBe(true);
    expect(result.data).toEqual([{ name: 'Article 1' }, { name: 'Article 2' }]);
  });

  it('fetch step with dot-separated dataPath: content-script unwraps nested path', async () => {
    // Content-script resolves dot-separated dataPath; runner sees the resulting array
    const unwrappedResults = [{ id: 1 }, { id: 2 }];
    const adapter = mockAdapter({
      executeInContent: vi.fn().mockResolvedValue(unwrappedResults),
    });
    const runner = new PipelineRunner(adapter);
    const connector = makeConnector([
      { step: 'navigate', url: 'https://example.com' },
      { step: 'fetch', url: 'https://example.com/api', dataPath: 'data.results' },
    ] as unknown as import('@commandgarden/shared').PipelineStep[]);
    const result = await runner.run(connector, {});
    expect(result.ok).toBe(true);
    expect(result.data).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it('fetch step with dataPath: content-script returns [] when path not found', async () => {
    // Content-script returns [] for missing dataPath; runner sees empty array
    const adapter = mockAdapter({
      executeInContent: vi.fn().mockResolvedValue([]),
    });
    const runner = new PipelineRunner(adapter);
    const connector = makeConnector([
      { step: 'navigate', url: 'https://example.com' },
      { step: 'fetch', url: 'https://example.com/api', dataPath: 'items' },
    ] as unknown as import('@commandgarden/shared').PipelineStep[]);
    const result = await runner.run(connector, {});
    expect(result.ok).toBe(true);
    expect(result.data).toEqual([]);
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
    expect(gate).toHaveBeenCalledWith('navigate', 0, ['navigate'], expect.any(String));
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
    expect(result.steps![0].capabilities).toContain('navigate');
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
    expect(result.steps![2].capabilities).toEqual([]);
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

  it('throws when step requires undeclared capability', async () => {
    const adapter = mockAdapter();
    const runner = new PipelineRunner(adapter);
    const connector = {
      site: 'test', name: 'cmd', version: '1.0', access: 'read',
      domains: ['example.com'],
      capabilities: ['dom_read'],
      args: [], columns: [],
      pipeline: [{ step: 'navigate', url: 'https://example.com' }],
    } as unknown as ConnectorDef;
    const result = await runner.run(connector, {});
    expect(result.ok).toBe(false);
    expect(result.error).toContain('undeclared capabilities');
    expect(result.error).toContain('navigate');
  });

  it('throws when navigate targets undeclared domain', async () => {
    const adapter = mockAdapter();
    const runner = new PipelineRunner(adapter);
    const connector = makeConnector([{ step: 'navigate', url: 'https://evil.com/hack' }]);
    const result = await runner.run(connector, {});
    expect(result.ok).toBe(false);
    expect(result.error).toContain('domain not declared');
  });

  it('throws when fetch targets undeclared domain', async () => {
    const adapter = mockAdapter({
      executeInContent: vi.fn().mockResolvedValue({ data: [] }),
    });
    const runner = new PipelineRunner(adapter);
    const connector = makeConnector([
      { step: 'navigate', url: 'https://example.com' },
      { step: 'fetch', url: 'https://malicious.com/api', method: 'GET', as: 'resp' },
    ] as unknown as PipelineStep[]);
    const result = await runner.run(connector, {});
    expect(result.ok).toBe(false);
    expect(result.error).toContain('domain not declared');
  });

  it('applies egress rules for js_evaluate when connector declares network_egress', async () => {
    const adapter = mockAdapter({
      evaluateInPage: vi.fn().mockResolvedValue([{ val: 1 }]),
    });
    const runner = new PipelineRunner(adapter);
    const connector = {
      site: 'test', name: 'cmd', version: '1.0', access: 'read',
      domains: ['example.com'],
      capabilities: ['navigate', 'js_evaluate', 'network_egress'],
      args: [], columns: [],
      pipeline: [
        { step: 'navigate', url: 'https://example.com' },
        { step: 'js_evaluate', code: 'return await fetch("/api").then(r => r.json())' },
      ],
    } as unknown as ConnectorDef;
    await runner.run(connector, {});
    expect(adapter.addEgressRules).toHaveBeenCalledWith(1, ['example.com']);
    expect(adapter.removeEgressRules).toHaveBeenCalledWith(1);
  });

  it('removes egress rules even when adding them fails', async () => {
    const adapter = mockAdapter({
      addEgressRules: vi.fn().mockRejectedValue(new Error('duplicate rule id')),
      evaluateInPage: vi.fn().mockResolvedValue([{ val: 1 }]),
    });
    const runner = new PipelineRunner(adapter);
    const connector = {
      site: 'test', name: 'cmd', version: '1.0', access: 'read',
      domains: ['example.com'],
      capabilities: ['navigate', 'js_evaluate', 'network_egress'],
      args: [], columns: [],
      pipeline: [
        { step: 'navigate', url: 'https://example.com' },
        { step: 'js_evaluate', code: 'return await fetch("/api").then(r => r.json())' },
      ],
    } as unknown as ConnectorDef;
    const result = await runner.run(connector, {});
    expect(result.ok).toBe(false);
    // A stranded catch-all BLOCK rule would kill all traffic in the tab for the
    // rest of the browser session, so cleanup must run regardless.
    expect(adapter.removeEgressRules).toHaveBeenCalledWith(1);
    expect(adapter.evaluateInPage).not.toHaveBeenCalled();
  });

  it('does not apply egress rules when connector lacks network_egress', async () => {
    const adapter = mockAdapter({
      evaluateInPage: vi.fn().mockResolvedValue(42),
    });
    const runner = new PipelineRunner(adapter);
    const connector = makeConnector([
      { step: 'navigate', url: 'https://example.com' },
      { step: 'js_evaluate', code: 'return 42;' },
    ] as unknown as PipelineStep[]);
    await runner.run(connector, {});
    expect(adapter.addEgressRules).not.toHaveBeenCalled();
    expect(adapter.removeEgressRules).not.toHaveBeenCalled();
  });
});
