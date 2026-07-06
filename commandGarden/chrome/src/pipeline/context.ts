// src/pipeline/context.ts
import { interpolate as sharedInterpolate, type ExprContext } from '@commandgarden/shared';

export class PipelineContext {
  private vars: Record<string, unknown> = {};
  private cookies: Record<string, string> = {};
  private data: Record<string, unknown>[] = [];
  private readonly args: Record<string, string | number | boolean>;

  constructor(args: Record<string, string | number | boolean>, initialVars?: Record<string, unknown>) {
    this.args = args;
    if (initialVars) Object.assign(this.vars, initialVars);
  }

  setVar(name: string, value: unknown): void { this.vars[name] = value; }
  getVar(name: string): unknown { return this.vars[name]; }
  setCookies(cookies: Record<string, string>): void { Object.assign(this.cookies, cookies); }
  setData(data: Record<string, unknown>[]): void { this.data = data; }
  getData(): Record<string, unknown>[] { return this.data; }

  interpolate(template: string): string {
    const ctx: ExprContext = { args: this.args, vars: this.vars, cookies: this.cookies };
    return sharedInterpolate(template, ctx);
  }

  applyMap(fields: Record<string, string>): void {
    this.data = this.data.map(row => {
      const mapped: Record<string, unknown> = {};
      for (const [key, expr] of Object.entries(fields)) {
        const rowCtx: ExprContext = {
          args: this.args, vars: { ...this.vars, row }, cookies: this.cookies,
          row,
        };
        mapped[key] = sharedInterpolate(expr, rowCtx);
      }
      return mapped;
    });
  }

  applyFilter(field: string, operator: string, value: string): void {
    this.data = this.data.filter(row => {
      const actual = row[field];
      const expected = isNaN(Number(value)) ? value : Number(value);
      switch (operator) {
        case 'eq': return actual === expected;
        case 'ne': return actual !== expected;
        case 'gt': return Number(actual) > Number(expected);
        case 'lt': return Number(actual) < Number(expected);
        case 'gte': return Number(actual) >= Number(expected);
        case 'lte': return Number(actual) <= Number(expected);
        case 'contains': return String(actual).includes(String(expected));
        case 'matches': return new RegExp(String(expected)).test(String(actual));
        default: return true;
      }
    });
  }
}
