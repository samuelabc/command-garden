import { tokenize } from './tokenizer.js';
import { parse, type Expr } from './parser.js';
import { BUILT_IN_FILTERS } from './filters.js';

export interface ExprContext {
  args: Record<string, string | number | boolean>;
  vars: Record<string, unknown>;
  cookies: Record<string, string>;
  /** Per-row scope injected by PipelineContext.applyMap for ${{ row.field }} expressions */
  row?: Record<string, unknown>;
}

function resolvePath(obj: unknown, path: string[]): unknown {
  let current = obj;
  for (const key of path) {
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function exec(expr: Expr, context: ExprContext): unknown {
  switch (expr.type) {
    case 'string':
      return expr.value;
    case 'number':
      return expr.value;
    case 'variable': {
      const [root, ...rest] = expr.path;
      const scope = (context as unknown as Record<string, unknown>)[root];
      return rest.length === 0 ? scope : resolvePath(scope, rest);
    }
    case 'concat': {
      const left = exec(expr.left, context);
      const right = exec(expr.right, context);
      return String(left) + String(right);
    }
    case 'pipe': {
      const value = exec(expr.expr, context);
      const filter = BUILT_IN_FILTERS[expr.filter];
      if (!filter) throw new Error(`Unknown filter: ${expr.filter}`);
      const args = expr.args.map((a: Expr) => exec(a, context));
      return filter(value, ...args);
    }
  }
}

export function evaluate(expression: string, context: ExprContext): unknown {
  const tokens = tokenize(expression);
  const ast = parse(tokens);
  return exec(ast, context);
}

export function interpolate(template: string, context: ExprContext): string {
  return template.replace(/\$\{\{\s*(.+?)\s*\}\}/g, (_, exprStr: string) => {
    return String(evaluate(exprStr, context));
  });
}
