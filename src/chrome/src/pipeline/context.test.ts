// src/pipeline/context.test.ts
import { describe, it, expect } from 'vitest';
import { PipelineContext } from './context.js';

describe('PipelineContext', () => {
  it('stores and retrieves variables', () => {
    const ctx = new PipelineContext({ month: '2026-06' });
    ctx.setVar('token', 'abc');
    expect(ctx.getVar('token')).toBe('abc');
  });

  it('interpolates args in templates', () => {
    const ctx = new PipelineContext({ month: '2026-06' });
    expect(ctx.interpolate('Report for ${{ args.month }}')).toBe('Report for 2026-06');
  });

  it('interpolates vars in templates', () => {
    const ctx = new PipelineContext({});
    ctx.setVar('base', 'https://example.com');
    expect(ctx.interpolate('${{ vars.base }}/api')).toBe('https://example.com/api');
  });

  it('interpolates cookies in templates', () => {
    const ctx = new PipelineContext({});
    ctx.setCookies({ session: 'xyz' });
    expect(ctx.interpolate('Bearer ${{ cookies.session }}')).toBe('Bearer xyz');
  });

  it('returns template unchanged if no expressions', () => {
    const ctx = new PipelineContext({});
    expect(ctx.interpolate('plain text')).toBe('plain text');
  });

  it('collects data rows', () => {
    const ctx = new PipelineContext({});
    ctx.setData([{ a: 1 }, { a: 2 }]);
    expect(ctx.getData()).toHaveLength(2);
  });

  it('applies map to data', () => {
    const ctx = new PipelineContext({});
    ctx.setData([{ firstName: 'Alice' }]);
    ctx.applyMap({ name: '${{ vars.row.firstName }}' });
    expect(ctx.getData()[0].name).toBe('Alice');
  });

  it('applies filter to data', () => {
    const ctx = new PipelineContext({});
    ctx.setData([{ score: 5 }, { score: 15 }, { score: 25 }]);
    ctx.applyFilter('score', 'gt', '10');
    expect(ctx.getData()).toHaveLength(2);
  });

  it('contains filter with empty string matches all rows', () => {
    const ctx = new PipelineContext({});
    ctx.setData([
      { tags: 'ai, python' },
      { tags: 'security' },
      { tags: 'llms, rust' },
    ]);
    ctx.applyFilter('tags', 'contains', '');
    expect(ctx.getData()).toHaveLength(3);
  });
});
