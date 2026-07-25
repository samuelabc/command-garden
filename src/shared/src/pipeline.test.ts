import { describe, it, expect } from 'vitest';
import {
  PIPELINE_STEP_TYPES,
  STEP_CAPABILITY_MAP,
  DAEMON_STEPS,
  pipelineStepSchema,
  splitPipeline,
  inferStepCapabilities,
  type PipelineStep,
} from './pipeline';

describe('PIPELINE_STEP_TYPES', () => {
  it('defines exactly 16 step types', () => {
    expect(PIPELINE_STEP_TYPES).toHaveLength(16);
  });
});

describe('STEP_CAPABILITY_MAP', () => {
  it('maps navigate step to navigate capability', () => {
    expect(STEP_CAPABILITY_MAP.navigate).toEqual(['navigate']);
  });

  it('maps wait step to navigate capability', () => {
    expect(STEP_CAPABILITY_MAP.wait).toEqual(['navigate']);
  });

  it('maps extract step to dom_read capability', () => {
    expect(STEP_CAPABILITY_MAP.extract).toEqual(['dom_read']);
  });

  it('maps click and type steps to dom_write', () => {
    expect(STEP_CAPABILITY_MAP.click).toEqual(['dom_write']);
    expect(STEP_CAPABILITY_MAP.type).toEqual(['dom_write']);
  });

  it('maps click_all step to dom_write', () => {
    expect(STEP_CAPABILITY_MAP.click_all).toEqual(['dom_write']);
  });

  it('maps extract_tree step to dom_read', () => {
    expect(STEP_CAPABILITY_MAP.extract_tree).toEqual(['dom_read']);
  });

  it('maps extract_html step to dom_read', () => {
    expect(STEP_CAPABILITY_MAP.extract_html).toEqual(['dom_read']);
  });

  it('maps transform step to daemon_transform', () => {
    expect(STEP_CAPABILITY_MAP.transform).toEqual(['daemon_transform']);
  });

  it('maps fetch step to network_fetch', () => {
    expect(STEP_CAPABILITY_MAP.fetch).toEqual(['network_fetch']);
  });

  it('maps map/filter/set steps to empty array (no capability needed)', () => {
    expect(STEP_CAPABILITY_MAP.map).toEqual([]);
    expect(STEP_CAPABILITY_MAP.filter).toEqual([]);
    expect(STEP_CAPABILITY_MAP.set).toEqual([]);
  });

  it('maps intercept step to empty array (deprecated)', () => {
    expect(STEP_CAPABILITY_MAP.intercept).toEqual([]);
  });
});

describe('pipelineStepSchema', () => {
  it('validates a navigate step', () => {
    const result = pipelineStepSchema.safeParse({ step: 'navigate', url: 'https://example.com' });
    expect(result.success).toBe(true);
  });

  it('validates a wait step with defaults', () => {
    const result = pipelineStepSchema.safeParse({ step: 'wait', selector: '#table' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.step).toBe('wait');
    }
  });

  it('validates an extract step with fields', () => {
    const result = pipelineStepSchema.safeParse({
      step: 'extract',
      selector: 'tr',
      fields: { date: 'td:nth-child(1)', hours: 'td:nth-child(2)' },
    });
    expect(result.success).toBe(true);
  });

  it('validates a click step', () => {
    const result = pipelineStepSchema.safeParse({ step: 'click', selector: '#submit' });
    expect(result.success).toBe(true);
  });

  it('validates a type step', () => {
    const result = pipelineStepSchema.safeParse({ step: 'type', selector: '#input', value: 'hello' });
    expect(result.success).toBe(true);
  });

  it('validates an intercept step', () => {
    const result = pipelineStepSchema.safeParse({ step: 'intercept', urlPattern: '/api/data', as: 'apiData' });
    expect(result.success).toBe(true);
  });

  it('validates a cookie step', () => {
    const result = pipelineStepSchema.safeParse({ step: 'cookie', domain: 'example.com', name: 'session', as: 'sess' });
    expect(result.success).toBe(true);
  });

  it('validates a fetch step', () => {
    const result = pipelineStepSchema.safeParse({
      step: 'fetch', url: 'https://api.example.com/data', method: 'GET', as: 'resp',
    });
    expect(result.success).toBe(true);
  });

  it('validates a map step', () => {
    const result = pipelineStepSchema.safeParse({ step: 'map', fields: { hours: '${{ row.rawHours | number }}' } });
    expect(result.success).toBe(true);
  });

  it('validates a filter step', () => {
    const result = pipelineStepSchema.safeParse({ step: 'filter', field: 'hours', operator: 'gt', value: '0' });
    expect(result.success).toBe(true);
  });

  it('validates a set step', () => {
    const result = pipelineStepSchema.safeParse({ step: 'set', name: 'token', value: '${{ cookies.auth }}' });
    expect(result.success).toBe(true);
  });

  it('validates a js_evaluate step', () => {
    const result = pipelineStepSchema.safeParse({ step: 'js_evaluate', code: 'return 42;' });
    expect(result.success).toBe(true);
  });

  it('validates a js_evaluate step with as', () => {
    const result = pipelineStepSchema.safeParse({ step: 'js_evaluate', code: 'return 42;', as: 'val' });
    expect(result.success).toBe(true);
  });

  it('validates a js_evaluate step with file', () => {
    const result = pipelineStepSchema.safeParse({ step: 'js_evaluate', file: 'report.eval.js' });
    expect(result.success).toBe(true);
  });

  it('validates a click_all step with defaults', () => {
    const result = pipelineStepSchema.safeParse({
      step: 'click_all', selector: 'button[aria-expanded="false"]',
    });
    expect(result.success).toBe(true);
  });

  it('validates a click_all step with all params', () => {
    const result = pipelineStepSchema.safeParse({
      step: 'click_all', selector: 'button', pause: 100, maxRounds: 5, settle: 500,
    });
    expect(result.success).toBe(true);
  });

  it('rejects click_all step missing selector', () => {
    const result = pipelineStepSchema.safeParse({ step: 'click_all' });
    expect(result.success).toBe(false);
  });

  it('validates an extract_tree step', () => {
    const result = pipelineStepSchema.safeParse({
      step: 'extract_tree',
      root: 'aside > div',
      group: { match: 'div:has(> button)', title: ':scope > button', children: ':scope > div' },
      leaf: { match: 'a[href^="/docs/"]', fields: { title: 'textContent', url: 'href' } },
    });
    expect(result.success).toBe(true);
  });

  it('validates an extract_tree step with pathSeparator', () => {
    const result = pipelineStepSchema.safeParse({
      step: 'extract_tree',
      root: 'nav',
      group: { match: 'div:has(> button)', title: ':scope > button', children: ':scope > div' },
      leaf: { match: 'a', fields: { title: 'textContent' } },
      pathSeparator: ' > ',
    });
    expect(result.success).toBe(true);
  });

  it('validates an extract_html step', () => {
    const result = pipelineStepSchema.safeParse({ step: 'extract_html', selector: 'article', as: 'rawHtml' });
    expect(result.success).toBe(true);
  });

  it('rejects extract_html step missing selector', () => {
    const result = pipelineStepSchema.safeParse({ step: 'extract_html', as: 'x' });
    expect(result.success).toBe(false);
  });

  it('validates a transform step', () => {
    const result = pipelineStepSchema.safeParse({
      step: 'transform', type: 'html_to_markdown', input: 'rawHtml', as: 'content',
    });
    expect(result.success).toBe(true);
  });

  it('validates a transform step with options', () => {
    const result = pipelineStepSchema.safeParse({
      step: 'transform', type: 'split_metadata', input: 'pill', as: 'meta',
      options: { delimiter: '|', fields: ['author', 'date'] },
    });
    expect(result.success).toBe(true);
  });

  it('rejects extract_tree step missing root', () => {
    const result = pipelineStepSchema.safeParse({
      step: 'extract_tree',
      group: { match: 'div', title: 'button', children: 'div' },
      leaf: { match: 'a', fields: { title: 'textContent' } },
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown step type', () => {
    const result = pipelineStepSchema.safeParse({ step: 'fly', url: 'nope' });
    expect(result.success).toBe(false);
  });

  it('rejects navigate step missing url', () => {
    const result = pipelineStepSchema.safeParse({ step: 'navigate' });
    expect(result.success).toBe(false);
  });
});

describe('DAEMON_STEPS', () => {
  it('includes transform', () => {
    expect(DAEMON_STEPS).toContain('transform');
  });
});

describe('splitPipeline', () => {
  it('splits a mixed pipeline into extension and daemon segments', () => {
    const steps: PipelineStep[] = [
      { step: 'navigate', url: 'https://example.com' },
      { step: 'wait', selector: 'article' },
      { step: 'extract_html', selector: 'article', as: 'html' },
      { step: 'transform', type: 'html_to_markdown', input: 'html', as: 'md' },
    ];
    const { extensionSteps, daemonSteps } = splitPipeline(steps);
    expect(extensionSteps).toHaveLength(3);
    expect(daemonSteps).toHaveLength(1);
    expect(daemonSteps[0].step).toBe('transform');
  });

  it('returns all steps as extension when no daemon steps', () => {
    const steps: PipelineStep[] = [
      { step: 'navigate', url: 'https://example.com' },
      { step: 'extract', selector: 'tr', fields: { name: 'td' } },
    ];
    const { extensionSteps, daemonSteps } = splitPipeline(steps);
    expect(extensionSteps).toHaveLength(2);
    expect(daemonSteps).toHaveLength(0);
  });

  it('returns all steps as daemon when all are daemon steps', () => {
    const steps: PipelineStep[] = [
      { step: 'transform', type: 'html_to_markdown', input: 'x', as: 'y' },
    ];
    const { extensionSteps, daemonSteps } = splitPipeline(steps);
    expect(extensionSteps).toHaveLength(0);
    expect(daemonSteps).toHaveLength(1);
  });
});

describe('inferStepCapabilities', () => {
  it('returns base capability for navigate step', () => {
    const step = { step: 'navigate', url: 'https://example.com' } as PipelineStep;
    expect(inferStepCapabilities(step, {})).toEqual(['navigate']);
  });

  it('returns network_fetch for GET fetch', () => {
    const step = { step: 'fetch', url: 'https://api.example.com', method: 'GET', as: 'data' } as PipelineStep;
    expect(inferStepCapabilities(step, {})).toEqual(['network_fetch']);
  });

  it('infers state_mutate for POST fetch', () => {
    const step = { step: 'fetch', url: 'https://api.example.com', method: 'POST', as: 'resp' } as PipelineStep;
    const caps = inferStepCapabilities(step, {});
    expect(caps).toContain('network_fetch');
    expect(caps).toContain('state_mutate');
  });

  it('infers state_mutate for DELETE fetch', () => {
    const step = { step: 'fetch', url: 'https://api.example.com', method: 'DELETE', as: 'resp' } as PipelineStep;
    expect(inferStepCapabilities(step, {})).toContain('state_mutate');
  });

  it('infers cdp_attach for js_evaluate on cdp connector', () => {
    const step = { step: 'js_evaluate', code: 'return 42;' } as PipelineStep;
    const caps = inferStepCapabilities(step, { cdp: true });
    expect(caps).toContain('js_evaluate');
    expect(caps).toContain('cdp_attach');
  });

  it('does not infer cdp_attach when cdp is false', () => {
    const step = { step: 'js_evaluate', code: 'return 42;' } as PipelineStep;
    const caps = inferStepCapabilities(step, { cdp: false });
    expect(caps).not.toContain('cdp_attach');
  });

  it('infers network_egress when evalAnalysis indicates egress', () => {
    const step = { step: 'js_evaluate', code: 'return 42;' } as PipelineStep;
    const caps = inferStepCapabilities(step, {}, { hasNetworkEgress: true });
    expect(caps).toContain('js_evaluate');
    expect(caps).toContain('network_egress');
  });

  it('does not infer network_egress without evalAnalysis', () => {
    const step = { step: 'js_evaluate', code: 'return 42;' } as PipelineStep;
    const caps = inferStepCapabilities(step, {});
    expect(caps).not.toContain('network_egress');
  });

  it('returns empty for map/filter/set steps', () => {
    const step = { step: 'map', fields: { name: '${{ row.title }}' } } as PipelineStep;
    expect(inferStepCapabilities(step, {})).toEqual([]);
  });
});
