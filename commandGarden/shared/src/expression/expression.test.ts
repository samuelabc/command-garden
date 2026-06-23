import { describe, it, expect } from 'vitest';
import { tokenize, type Token } from './tokenizer';
import { parse, type Expr } from './parser';
import { evaluate, interpolate, type ExprContext } from './evaluator';

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

const CTX: ExprContext = {
  args: { month: '2026-06', count: 5 },
  vars: { token: 'abc123', nested: { deep: 'value' } },
  cookies: { session: 'xyz' },
};

describe('parse', () => {
  it('parses a variable path', () => {
    const tokens = tokenize('args.month');
    const ast = parse(tokens);
    expect(ast).toEqual({ type: 'variable', path: ['args', 'month'] });
  });

  it('parses a string literal', () => {
    const tokens = tokenize('"hello"');
    const ast = parse(tokens);
    expect(ast).toEqual({ type: 'string', value: 'hello' });
  });

  it('parses a number literal', () => {
    const tokens = tokenize('42');
    const ast = parse(tokens);
    expect(ast).toEqual({ type: 'number', value: 42 });
  });

  it('parses string concatenation', () => {
    const tokens = tokenize('"Bearer " + vars.token');
    const ast = parse(tokens);
    expect(ast.type).toBe('concat');
  });

  it('parses pipe filter without args', () => {
    const tokens = tokenize('args.month | trim');
    const ast = parse(tokens);
    expect(ast).toEqual({
      type: 'pipe',
      expr: { type: 'variable', path: ['args', 'month'] },
      filter: 'trim',
      args: [],
    });
  });

  it('parses pipe filter with args', () => {
    const tokens = tokenize('args.month | default("2026-06")');
    const ast = parse(tokens);
    expect(ast.type).toBe('pipe');
    if (ast.type === 'pipe') {
      expect(ast.filter).toBe('default');
      expect(ast.args).toHaveLength(1);
    }
  });

  it('parses chained pipes', () => {
    const tokens = tokenize('args.month | default("x") | trim');
    const ast = parse(tokens);
    expect(ast.type).toBe('pipe');
    if (ast.type === 'pipe') {
      expect(ast.filter).toBe('trim');
      expect(ast.expr.type).toBe('pipe');
    }
  });
});

describe('evaluate', () => {
  it('resolves a variable path', () => {
    expect(evaluate('args.month', CTX)).toBe('2026-06');
  });

  it('resolves nested variable path', () => {
    expect(evaluate('vars.nested.deep', CTX)).toBe('value');
  });

  it('resolves a cookie', () => {
    expect(evaluate('cookies.session', CTX)).toBe('xyz');
  });

  it('evaluates string concatenation', () => {
    expect(evaluate('"Bearer " + vars.token', CTX)).toBe('Bearer abc123');
  });

  it('evaluates a number literal', () => {
    expect(evaluate('42', CTX)).toBe(42);
  });

  it('applies default filter when value exists', () => {
    expect(evaluate('args.month | default("fallback")', CTX)).toBe('2026-06');
  });

  it('applies default filter when value is undefined', () => {
    expect(evaluate('args.missing | default("fallback")', CTX)).toBe('fallback');
  });

  it('applies number filter', () => {
    expect(evaluate('"42" | number', CTX)).toBe(42);
  });

  it('applies trim filter', () => {
    expect(evaluate('"  hello  " | trim', CTX)).toBe('hello');
  });

  it('applies upper filter', () => {
    expect(evaluate('"hello" | upper', CTX)).toBe('HELLO');
  });

  it('applies lower filter', () => {
    expect(evaluate('"HELLO" | lower', CTX)).toBe('hello');
  });

  it('chains multiple pipes', () => {
    expect(evaluate('args.missing | default("  padded  ") | trim', CTX)).toBe('padded');
  });

  it('throws on unknown filter', () => {
    expect(() => evaluate('args.month | nonexistent', CTX)).toThrow('Unknown filter');
  });
});

describe('interpolate', () => {
  it('replaces a single ${{ }} block', () => {
    expect(interpolate('month=${{ args.month }}', CTX)).toBe('month=2026-06');
  });

  it('replaces multiple ${{ }} blocks', () => {
    expect(
      interpolate('${{ args.month }} token=${{ vars.token }}', CTX),
    ).toBe('2026-06 token=abc123');
  });

  it('handles no template blocks (passthrough)', () => {
    expect(interpolate('plain text', CTX)).toBe('plain text');
  });

  it('handles expression with spaces inside braces', () => {
    expect(interpolate('${{  args.month  }}', CTX)).toBe('2026-06');
  });

  it('handles concat inside template', () => {
    expect(interpolate('${{ "Bearer " + vars.token }}', CTX)).toBe('Bearer abc123');
  });

  it('handles pipe inside template', () => {
    expect(interpolate('${{ args.missing | default("N/A") }}', CTX)).toBe('N/A');
  });
});
