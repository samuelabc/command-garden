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

describe('split_metadata', () => {
  const split = getTransform('split_metadata');

  it('splits by pipe delimiter', () => {
    const result = JSON.parse(split('Author Name (ID)|Jan 15, 2025', { delimiter: '|', fields: ['author', 'lastUpdated'] }));
    expect(result.author).toBe('Author Name (ID)');
    expect(result.lastUpdated).toBe('Jan 15, 2025');
  });

  it('handles missing parts gracefully', () => {
    const result = JSON.parse(split('OnlyOne', { delimiter: '|', fields: ['first', 'second'] }));
    expect(result.first).toBe('OnlyOne');
    expect(result.second).toBe('');
  });

  it('uses default pipe delimiter', () => {
    const result = JSON.parse(split('A|B', { fields: ['x', 'y'] }));
    expect(result.x).toBe('A');
    expect(result.y).toBe('B');
  });
});
