import { describe, it, expect } from 'vitest';
import { tokenize, type Token } from './tokenizer';

describe('tokenize', () => {
  it('tokenizes a simple variable path', () => {
    const tokens = tokenize('args.month');
    expect(tokens).toEqual([
      { type: 'IDENT', value: 'args' },
      { type: 'DOT', value: '.' },
      { type: 'IDENT', value: 'month' },
      { type: 'EOF', value: '' },
    ]);
  });

  it('tokenizes a string literal (double quotes)', () => {
    const tokens = tokenize('"hello world"');
    expect(tokens).toEqual([
      { type: 'STRING', value: 'hello world' },
      { type: 'EOF', value: '' },
    ]);
  });

  it('tokenizes a string literal (single quotes)', () => {
    const tokens = tokenize("'hello'");
    expect(tokens).toEqual([
      { type: 'STRING', value: 'hello' },
      { type: 'EOF', value: '' },
    ]);
  });

  it('tokenizes a number', () => {
    const tokens = tokenize('42');
    expect(tokens).toEqual([
      { type: 'NUMBER', value: '42' },
      { type: 'EOF', value: '' },
    ]);
  });

  it('tokenizes a decimal number', () => {
    const tokens = tokenize('3.14');
    expect(tokens).toEqual([
      { type: 'NUMBER', value: '3.14' },
      { type: 'EOF', value: '' },
    ]);
  });

  it('tokenizes string concat expression', () => {
    const tokens = tokenize('"Bearer " + vars.token');
    expect(tokens.map((t) => t.type)).toEqual([
      'STRING', 'PLUS', 'IDENT', 'DOT', 'IDENT', 'EOF',
    ]);
  });

  it('tokenizes pipe expression with args', () => {
    const tokens = tokenize('args.month | default("2026-06")');
    expect(tokens.map((t) => t.type)).toEqual([
      'IDENT', 'DOT', 'IDENT', 'PIPE', 'IDENT', 'LPAREN', 'STRING', 'RPAREN', 'EOF',
    ]);
  });

  it('skips whitespace', () => {
    const tokens = tokenize('  args . month  ');
    expect(tokens.filter((t) => t.type !== 'EOF')).toHaveLength(3);
  });

  it('throws on unexpected character', () => {
    expect(() => tokenize('args @ month')).toThrow('Unexpected character');
  });
});
