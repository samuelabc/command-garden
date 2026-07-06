import { describe, it, expect } from 'vitest';
import { runDaemonSteps } from './daemon-runner';
import type { PipelineStep } from '@commandgarden/shared';

describe('runDaemonSteps', () => {
  it('executes a split_metadata transform and spreads fields into vars', () => {
    const steps: PipelineStep[] = [
      { step: 'transform', type: 'split_metadata', input: 'pill', as: 'meta', options: { delimiter: '|', fields: ['author', 'date'] } },
    ];
    const { vars } = runDaemonSteps({
      steps,
      data: [],
      vars: { pill: 'Alice|2025-01-15' },
    });
    expect(vars.author).toBe('Alice');
    expect(vars.date).toBe('2025-01-15');
  });

  it('chains multiple transform steps', () => {
    const steps: PipelineStep[] = [
      { step: 'transform', type: 'html_to_markdown', input: 'rawHtml', as: 'content' },
      { step: 'transform', type: 'split_metadata', input: 'pill', as: 'meta', options: { delimiter: '|', fields: ['a', 'b'] } },
    ];
    const { vars } = runDaemonSteps({
      steps,
      data: [],
      vars: { rawHtml: '<p>Hello</p>', pill: 'X|Y' },
    });
    expect(vars.content).toBe('Hello');
    expect(vars.a).toBe('X');
    expect(vars.b).toBe('Y');
  });

  it('throws for unsupported step type', () => {
    const steps = [{ step: 'navigate', url: 'https://example.com' }] as PipelineStep[];
    expect(() => runDaemonSteps({ steps, data: [], vars: {} })).toThrow('does not support');
  });

  it('throws for unknown transform type', () => {
    const steps: PipelineStep[] = [
      { step: 'transform', type: 'nonexistent', input: 'x', as: 'y' },
    ];
    expect(() => runDaemonSteps({ steps, data: [], vars: { x: 'val' } })).toThrow('Unknown transform');
  });
});
