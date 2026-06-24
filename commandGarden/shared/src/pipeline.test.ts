import { describe, it, expect } from 'vitest';
import {
  PIPELINE_STEP_TYPES,
  STEP_CAPABILITY_MAP,
  pipelineStepSchema,
} from './pipeline';

describe('PIPELINE_STEP_TYPES', () => {
  it('defines exactly 12 step types', () => {
    expect(PIPELINE_STEP_TYPES).toHaveLength(12);
  });
});

describe('STEP_CAPABILITY_MAP', () => {
  it('maps navigate step to navigate capability', () => {
    expect(STEP_CAPABILITY_MAP.navigate).toBe('navigate');
  });

  it('maps wait step to navigate capability', () => {
    expect(STEP_CAPABILITY_MAP.wait).toBe('navigate');
  });

  it('maps extract step to dom_read capability', () => {
    expect(STEP_CAPABILITY_MAP.extract).toBe('dom_read');
  });

  it('maps click and type steps to dom_write', () => {
    expect(STEP_CAPABILITY_MAP.click).toBe('dom_write');
    expect(STEP_CAPABILITY_MAP.type).toBe('dom_write');
  });

  it('maps map/filter/set steps to null (no capability needed)', () => {
    expect(STEP_CAPABILITY_MAP.map).toBeNull();
    expect(STEP_CAPABILITY_MAP.filter).toBeNull();
    expect(STEP_CAPABILITY_MAP.set).toBeNull();
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

  it('rejects unknown step type', () => {
    const result = pipelineStepSchema.safeParse({ step: 'fly', url: 'nope' });
    expect(result.success).toBe(false);
  });

  it('rejects navigate step missing url', () => {
    const result = pipelineStepSchema.safeParse({ step: 'navigate' });
    expect(result.success).toBe(false);
  });
});
