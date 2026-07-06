// src/daemon-runner.ts
import type { PipelineStep, TransformStep } from '@commandgarden/shared';
import { getTransform } from './transforms.js';

export interface DaemonRunnerInput {
  steps: PipelineStep[];
  data: Record<string, unknown>[];
  vars: Record<string, unknown>;
}

export function runDaemonSteps(input: DaemonRunnerInput): {
  data: Record<string, unknown>[];
  vars: Record<string, unknown>;
} {
  const vars = { ...input.vars };
  let data = input.data;

  for (const step of input.steps) {
    switch (step.step) {
      case 'transform': {
        const ts = step as TransformStep;
        const inputVal = vars[ts.input] as string ?? '';
        const fn = getTransform(ts.type);
        const result = fn(inputVal, ts.options);
        vars[ts.as] = result;
        break;
      }
      default:
        throw new Error(`DaemonRunner does not support step type: ${step.step}`);
    }
  }

  return { data, vars };
}
