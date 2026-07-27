import type {
  ConnectorDef, PipelineStep, PipelineStepType,
  ExtensionResponse, ApprovalConfig, StepSummary,
  Capability, EvalAnalysis,
} from '@commandgarden/shared';
import { STEP_CAPABILITY_MAP, inferStepCapabilities } from '@commandgarden/shared';
import { PipelineContext } from './context.js';
import { buildAllowlist, isUrlAllowed } from '../domain-guard.js';

export interface ChromeAdapter {
  navigateTab(url: string): Promise<number>;
  waitForTabLoad(tabId: number): Promise<void>;
  executeInContent(tabId: number, step: PipelineStep): Promise<unknown>;
  getCookies(domain: string): Promise<Record<string, string>>;
  evaluateInPage(tabId: number, code: string): Promise<unknown>;
  addEgressRules(tabId: number, allowedDomains: string[]): Promise<void>;
  removeEgressRules(tabId: number): Promise<void>;
}

export type ApprovalGate = (
  stepType: PipelineStepType,
  stepIndex: number,
  capabilities: Capability[],
  description: string,
) => Promise<boolean>;

export class PipelineRunner {
  constructor(
    private adapter: ChromeAdapter,
    private approvalGate?: ApprovalGate,
    private approvalConfig?: ApprovalConfig,
    private connectorKey?: string,
  ) {}

  private async checkApproval(step: PipelineStep, index: number, caps: Capability[]): Promise<void> {
    if (!this.approvalGate || !this.approvalConfig) return;
    if (caps.length === 0) return;
    const needsApproval = caps.some(c => this.approvalConfig!.approvalRequired.includes(c));
    if (!needsApproval) return;
    if (this.connectorKey && this.approvalConfig.autoApproveConnectors.includes(this.connectorKey)) return;

    const description = `${step.step} step (requires ${caps.join(', ')})`;
    const approved = await this.approvalGate(step.step, index, caps, description);
    if (!approved) {
      throw new Error(`Step ${index + 1} [${step.step}] was rejected by user`);
    }
  }

  private enforceCapabilities(
    step: PipelineStep,
    connector: ConnectorDef,
    evalAnalysis?: EvalAnalysis,
  ): Capability[] {
    const required = inferStepCapabilities(step, connector, evalAnalysis);
    const declared = new Set(connector.capabilities);
    const missing = required.filter(c => !declared.has(c));
    if (missing.length > 0) {
      throw new Error(
        `Step "${step.step}" requires undeclared capabilities: [${missing.join(', ')}]`,
      );
    }
    return required;
  }

  private enforceDomain(url: string, connector: ConnectorDef): void {
    const allowlist = buildAllowlist(connector.domains);
    if (!isUrlAllowed(url, allowlist)) {
      throw new Error(`URL "${url}" targets a domain not declared in connector domains`);
    }
  }

  async run(
    connector: ConnectorDef,
    args: Record<string, string | number | boolean>,
    evalAnalysis?: EvalAnalysis,
  ): Promise<ExtensionResponse> {
    const ctx = new PipelineContext(args, connector.vars);
    let tabId = -1;
    const stepSummaries: StepSummary[] = [];

    try {
      for (let i = 0; i < connector.pipeline.length; i++) {
        const step = connector.pipeline[i];
        const caps = this.enforceCapabilities(step, connector, evalAnalysis);
        await this.checkApproval(step, i, caps);
        const stepStart = Date.now();
        try {
        switch (step.step) {
          case 'navigate': {
            const url = ctx.interpolate(step.url);
            this.enforceDomain(url, connector);
            tabId = await this.adapter.navigateTab(url);
            await this.adapter.waitForTabLoad(tabId);
            break;
          }
          case 'wait':
          case 'click':
          case 'click_all':
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
          case 'extract_tree': {
            const treeData = await this.adapter.executeInContent(tabId, step) as Record<string, unknown>[];
            ctx.setData(treeData);
            break;
          }
          case 'extract_html': {
            const html = await this.adapter.executeInContent(tabId, step) as string;
            if (step.as) ctx.setVar(step.as, html);
            break;
          }
          case 'fetch': {
            const resolvedUrl = ctx.interpolate(step.url);
            this.enforceDomain(resolvedUrl, connector);
            const fetchStep = {
              ...step,
              url: resolvedUrl,
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
            throw new Error('The "intercept" step is deprecated and not supported');
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

            const hasEgress = connector.capabilities.includes('network_egress');
            try {
              // Inside the try: if adding the rules fails partway, the catch-all
              // BLOCK rule may already be installed and must still be removed.
              if (hasEgress) {
                await this.adapter.addEgressRules(tabId, connector.domains);
              }
              const result = await this.adapter.evaluateInPage(tabId, code);
              if (step.as) {
                ctx.setVar(step.as, result);
              } else if (Array.isArray(result)) {
                ctx.setData(result as Record<string, unknown>[]);
              }
            } finally {
              if (hasEgress) {
                await this.adapter.removeEgressRules(tabId);
              }
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
          capabilities: caps,
          durationMs: Date.now() - stepStart,
        });
        } catch (err) {
          stepSummaries.push({
            step: step.step, index: i,
            capabilities: caps,
            durationMs: Date.now() - stepStart,
            error: err instanceof Error ? err.message : String(err),
          });
          throw err;
        }
      }
      return { id: '', ok: true, data: ctx.getData(), vars: ctx.getVars(), steps: stepSummaries };
    } catch (err) {
      return { id: '', ok: false, data: [], vars: {}, error: err instanceof Error ? err.message : String(err), steps: stepSummaries };
    }
  }
}
