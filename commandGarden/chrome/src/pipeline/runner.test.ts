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
});
