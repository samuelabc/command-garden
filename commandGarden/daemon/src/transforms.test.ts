import { describe, it, expect } from 'vitest';
import { getTransform } from './transforms';

describe('getTransform', () => {
  it('throws for unknown transform type', () => {
    expect(() => getTransform('nonexistent')).toThrow('Unknown transform type');
  });
});

describe('html_to_markdown', () => {
  const convert = getTransform('html_to_markdown');

  it('converts heading to markdown', () => {
    expect(convert('<h1>Title</h1>')).toContain('Title');
  });

  it('converts paragraph to plain text', () => {
    expect(convert('<p>Hello world</p>')).toBe('Hello world');
  });

  it('converts link to markdown link', () => {
    const md = convert('<a href="https://example.com">Link</a>');
    expect(md).toContain('[Link](https://example.com)');
  });

  it('converts code block', () => {
    const md = convert('<pre><code>const x = 1;</code></pre>');
    expect(md).toContain('const x = 1;');
  });

  it('converts unordered list', () => {
    const md = convert('<ul><li>A</li><li>B</li></ul>');
    expect(md).toContain('A');
    expect(md).toContain('B');
  });
});

describe('json_unwrap', () => {
  const unwrap = getTransform('json_unwrap');

  it('extracts a nested array by path', () => {
    const input = {
      version: 'https://jsonfeed.org/version/1',
      title: 'Feed',
      items: [{ id: 1 }, { id: 2 }],
    };
    const result = unwrap(input, { path: 'items' });
    expect(result).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it('handles dot-separated paths', () => {
    const input = { data: { results: [{ name: 'A' }] } };
    const result = unwrap(input, { path: 'data.results' });
    expect(result).toEqual([{ name: 'A' }]);
  });

  it('returns empty array when path not found', () => {
    const result = unwrap({ other: 'value' }, { path: 'items' });
    expect(result).toEqual([]);
  });

  it('returns empty array when nested value is not an array', () => {
    const result = unwrap({ items: 'not-an-array' }, { path: 'items' });
    expect(result).toEqual([]);
  });

  it('returns empty array for null input', () => {
    const result = unwrap(null, { path: 'items' });
    expect(result).toEqual([]);
  });
});

describe('split_metadata', () => {
  const split = getTransform('split_metadata');

  it('splits by pipe delimiter', () => {
    const result = split('Author Name (ID)|Jan 15, 2025', { delimiter: '|', fields: ['author', 'lastUpdated'] }) as Record<string, string>;
    expect(result.author).toBe('Author Name (ID)');
    expect(result.lastUpdated).toBe('Jan 15, 2025');
  });

  it('handles missing parts gracefully', () => {
    const result = split('OnlyOne', { delimiter: '|', fields: ['first', 'second'] }) as Record<string, string>;
    expect(result.first).toBe('OnlyOne');
    expect(result.second).toBe('');
  });

  it('uses default pipe delimiter', () => {
    const result = split('A|B', { fields: ['x', 'y'] }) as Record<string, string>;
    expect(result.x).toBe('A');
    expect(result.y).toBe('B');
  });
});
