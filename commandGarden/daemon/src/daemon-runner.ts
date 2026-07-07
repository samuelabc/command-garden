// src/daemon-runner.ts
import type { PipelineStep, TransformStep, MapStep, FilterStep } from '@commandgarden/shared';
import { interpolate, type ExprContext } from '@commandgarden/shared';
import { getTransform } from './transforms.js';

export interface DaemonRunnerInput {
  steps: PipelineStep[];
  data: Record<string, unknown>[];
  vars: Record<string, unknown>;
  args?: Record<string, string | number | boolean>;
}

export function runDaemonSteps(input: DaemonRunnerInput): {
  data: Record<string, unknown>[];
  vars: Record<string, unknown>;
} {
  const vars = { ...input.vars };
  const args = input.args ?? {};
  let data = input.data;

  for (const step of input.steps) {
    switch (step.step) {
      case 'transform': {
        const ts = step as TransformStep;
        const inputVal = vars[ts.input] ?? '';
        const fn = getTransform(ts.type);
        const result = fn(inputVal, ts.options);
        if (Array.isArray(result)) {
          data = result as Record<string, unknown>[];
        } else if (typeof result === 'object') {
          Object.assign(vars, result);
        } else {
          vars[ts.as] = result;
        }
        break;
      }
      // map and filter are dual-mode — they run here when they appear after a transform
      case 'map': {
        const ms = step as MapStep;
        data = data.map(row => {
          const mapped: Record<string, unknown> = {};
          const ctx: ExprContext = { args, vars: { ...vars, row }, cookies: {}, row };
          for (const [key, expr] of Object.entries(ms.fields)) {
            mapped[key] = interpolate(expr, ctx);
          }
          return mapped;
        });
        break;
      }
      case 'filter': {
        const fs = step as FilterStep;
        const filterCtx: ExprContext = { args, vars, cookies: {} };
        const filterValue = interpolate(fs.value, filterCtx);
        data = data.filter(row => {
          const actual = row[fs.field];
          switch (fs.operator) {
            case 'eq': return actual === filterValue;
            case 'ne': return actual !== filterValue;
            case 'contains': return String(actual).includes(String(filterValue));
            case 'matches': try { return new RegExp(String(filterValue)).test(String(actual)); } catch { return false; }
            default: return true;
          }
        });
        break;
      }
      default:
        throw new Error(`DaemonRunner does not support step type: ${step.step}`);
    }
  }

  return { data, vars };
}
