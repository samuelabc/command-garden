// src/pipeline/runner.ts
import type {
  ConnectorDef, PipelineStep, PipelineStepType,
  ExtensionResponse, ApprovalConfig, StepSummary,
} from '@commandgarden/shared';
import { STEP_CAPABILITY_MAP } from '@commandgarden/shared';
import type { Capability } from '@commandgarden/shared';
import { PipelineContext } from './context.js';

export interface ChromeAdapter {
  navigateTab(url: string): Promise<number>;
  waitForTabLoad(tabId: number): Promise<void>;
  executeInContent(tabId: number, step: PipelineStep): Promise<unknown>;
  getCookies(domain: string): Promise<Record<string, string>>;
  evaluateInPage(tabId: number, code: string): Promise<unknown>;
}

export type ApprovalGate = (
  stepType: PipelineStepType,
  stepIndex: number,
  capability: Capability,
  description: string,
) => Promise<boolean>;

export class PipelineRunner {
  constructor(
    private adapter: ChromeAdapter,
    private approvalGate?: ApprovalGate,
    private approvalConfig?: ApprovalConfig,
    private connectorKey?: string,
  ) {}

  private async checkApproval(step: PipelineStep, index: number): Promise<void> {
    if (!this.approvalGate || !this.approvalConfig) return;
    const cap = STEP_CAPABILITY_MAP[step.step];
    if (!cap) return;
    if (!this.approvalConfig.approvalRequired.includes(cap)) return;
    if (this.connectorKey && this.approvalConfig.autoApproveConnectors.includes(this.connectorKey)) return;

    const description = `${step.step} step (requires ${cap})`;
    const approved = await this.approvalGate(step.step, index, cap, description);
    if (!approved) {
      throw new Error(`Step ${index + 1} [${step.step}] was rejected by user`);
    }
  }

  async run(
    connector: ConnectorDef,
    args: Record<string, string | number | boolean>,
  ): Promise<ExtensionResponse> {
    const ctx = new PipelineContext(args);
    let tabId = -1;
    const stepSummaries: StepSummary[] = [];

    try {
      for (let i = 0; i < connector.pipeline.length; i++) {
        const step = connector.pipeline[i];
        await this.checkApproval(step, i);
        const stepStart = Date.now();
        try {
        switch (step.step) {
          case 'navigate': {
            const url = ctx.interpolate(step.url);
            tabId = await this.adapter.navigateTab(url);
            await this.adapter.waitForTabLoad(tabId);
            break;
          }
          case 'wait':
          case 'click':
            await this.adapter.executeInContent(tabId, step);
            break;
          case 'type':
            await this.adapter.executeInContent(tabId, {
              ...step, value: ctx.interpolate(step.value),
            });
            break;
          case 'extract': {
            const data = await this.adapter.executeInContent(tabId, step) as Record<string, unknown>[];
            ctx.setData(data);
            break;
          }
          case 'fetch': {
            const fetchStep = {
              ...step,
              url: ctx.interpolate(step.url),
              headers: step.headers
                ? Object.fromEntries(Object.entries(step.headers).map(([k, v]) => [k, ctx.interpolate(v)]))
                : undefined,
              body: step.body ? ctx.interpolate(step.body) : undefined,
            };
            const result = await this.adapter.executeInContent(tabId, fetchStep as PipelineStep);
            if (step.as) {
              ctx.setVar(step.as, result);
            } else if (Array.isArray(result)) {
              ctx.setData(result as Record<string, unknown>[]);
            }
            break;
          }
          case 'intercept': {
            const result = await this.adapter.executeInContent(tabId, step);
            if (step.as) ctx.setVar(step.as, result);
            break;
          }
          case 'cookie': {
            const cookies = await this.adapter.getCookies(step.domain);
            ctx.setCookies(cookies);
            if (step.name && step.as) {
              ctx.setVar(step.as, cookies[step.name] ?? '');
            }
            break;
          }
          case 'js_evaluate': {
            if (!step.code) throw new Error('js_evaluate step has no code (file: not resolved?)');
            const code = ctx.interpolate(step.code);
            const result = await this.adapter.evaluateInPage(tabId, code);
            if (step.as) {
              ctx.setVar(step.as, result);
            } else if (Array.isArray(result)) {
              ctx.setData(result as Record<string, unknown>[]);
            }
            break;
          }
          case 'set':
            ctx.setVar(step.name, ctx.interpolate(step.value));
            break;
          case 'map':
            ctx.applyMap(step.fields);
            break;
          case 'filter':
            ctx.applyFilter(step.field, step.operator, ctx.interpolate(step.value));
            break;
        }
        stepSummaries.push({
          step: step.step, index: i,
          capability: STEP_CAPABILITY_MAP[step.step] ?? undefined,
          durationMs: Date.now() - stepStart,
        });
        } catch (err) {
          stepSummaries.push({
            step: step.step, index: i,
            capability: STEP_CAPABILITY_MAP[step.step] ?? undefined,
            durationMs: Date.now() - stepStart,
            error: err instanceof Error ? err.message : String(err),
          });
          throw err;
        }
      }
      return { id: '', ok: true, data: ctx.getData(), steps: stepSummaries };
    } catch (err) {
      return { id: '', ok: false, data: [], error: err instanceof Error ? err.message : String(err), steps: stepSummaries };
    }
  }
}
