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

  it('map step transforms data rows using expressions', () => {
    const steps = [
      { step: 'map', fields: { label: '${{ row.name }}', upper: '${{ row.name }}' } },
    ] as PipelineStep[];
    const data = [{ name: 'Alice' }, { name: 'Bob' }];
    const result = runDaemonSteps({ steps, data, vars: {}, args: {} });
    expect(result.data).toEqual([
      { label: 'Alice', upper: 'Alice' },
      { label: 'Bob', upper: 'Bob' },
    ]);
  });

  it('filter step filters data rows by contains', () => {
    const steps = [
      { step: 'filter', field: 'tags', operator: 'contains', value: 'Security' },
    ] as PipelineStep[];
    const data = [
      { title: 'A', tags: 'Security News' },
      { title: 'B', tags: 'Research' },
      { title: 'C', tags: 'Security Alert' },
    ];
    const result = runDaemonSteps({ steps, data, vars: {} });
    expect(result.data).toEqual([
      { title: 'A', tags: 'Security News' },
      { title: 'C', tags: 'Security Alert' },
    ]);
  });

  it('json_unwrap → map → filter chain', () => {
    const steps = [
      { step: 'transform', type: 'json_unwrap', input: 'feed', as: '_data', options: { path: 'items' } },
      { step: 'map', fields: { name: '${{ row.title }}', tag: '${{ row.category }}' } },
      { step: 'filter', field: 'tag', operator: 'eq', value: 'news' },
    ] as PipelineStep[];
    const vars = {
      feed: { items: [{ title: 'Post 1', category: 'news' }, { title: 'Post 2', category: 'blog' }] },
    };
    const result = runDaemonSteps({ steps, data: [], vars });
    expect(result.data).toEqual([{ name: 'Post 1', tag: 'news' }]);
  });

  it('filter with matches and invalid regex returns false (no throw)', () => {
    const steps = [
      { step: 'filter', field: 'name', operator: 'matches', value: '(invalid[' },
    ] as PipelineStep[];
    const data = [{ name: 'Alice' }, { name: 'Bob' }];
    const result = runDaemonSteps({ steps, data, vars: {} });
    expect(result.data).toEqual([]);
  });
});
