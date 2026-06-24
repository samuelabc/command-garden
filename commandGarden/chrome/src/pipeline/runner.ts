// src/pipeline/runner.ts
import type { ConnectorDef, PipelineStep, ExtensionResponse } from '@commandgarden/shared';
import { PipelineContext } from './context.js';

export interface ChromeAdapter {
  navigateTab(url: string): Promise<number>;
  waitForTabLoad(tabId: number): Promise<void>;
  executeInContent(tabId: number, step: PipelineStep): Promise<unknown>;
  getCookies(domain: string): Promise<Record<string, string>>;
}

export class PipelineRunner {
  constructor(private adapter: ChromeAdapter) {}

  async run(
    connector: ConnectorDef,
    args: Record<string, string | number | boolean>,
  ): Promise<ExtensionResponse> {
    const ctx = new PipelineContext(args);
    let tabId = -1;

    try {
      for (const step of connector.pipeline) {
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
          case 'set':
            ctx.setVar(step.name, ctx.interpolate(step.value));
            break;
          case 'map':
            ctx.applyMap(step.fields);
            break;
          case 'filter':
            ctx.applyFilter(step.field, step.operator, step.value);
            break;
        }
      }
      return { id: '', ok: true, data: ctx.getData() };
    } catch (err) {
      return { id: '', ok: false, data: [], error: err instanceof Error ? err.message : String(err) };
    }
  }
}
