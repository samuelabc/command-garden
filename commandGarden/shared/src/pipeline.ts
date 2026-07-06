import { z } from 'zod';
import type { Capability } from './capabilities.js';

export const PIPELINE_STEP_TYPES = [
  'navigate', 'wait', 'extract', 'extract_tree', 'extract_html', 'click', 'click_all', 'type',
  'intercept', 'cookie', 'fetch', 'map', 'filter', 'set', 'transform', 'js_evaluate',
] as const;

export type PipelineStepType = (typeof PIPELINE_STEP_TYPES)[number];

export const STEP_CAPABILITY_MAP: Record<PipelineStepType, Capability | null> = {
  navigate: 'navigate',
  wait: 'navigate',
  extract: 'dom_read',
  extract_tree: 'dom_read',
  extract_html: 'dom_read',
  click: 'dom_write',
  click_all: 'dom_write',
  type: 'dom_write',
  intercept: 'intercept_response',
  cookie: 'cookie_read',
  fetch: 'cookie_read',
  map: null,
  filter: null,
  set: null,
  transform: null,
  js_evaluate: 'js_evaluate',
};

const navigateStepSchema = z.object({
  step: z.literal('navigate'),
  url: z.string(),
});

const waitStepSchema = z.object({
  step: z.literal('wait'),
  selector: z.string().optional(),
  timeout: z.number().positive().optional(),
});

const extractStepSchema = z.object({
  step: z.literal('extract'),
  selector: z.string(),
  fields: z.record(z.string(), z.string()),
});

const clickStepSchema = z.object({
  step: z.literal('click'),
  selector: z.string(),
});

const typeStepSchema = z.object({
  step: z.literal('type'),
  selector: z.string(),
  value: z.string(),
});

const interceptStepSchema = z.object({
  step: z.literal('intercept'),
  urlPattern: z.string(),
  as: z.string().optional(),
});

const cookieStepSchema = z.object({
  step: z.literal('cookie'),
  domain: z.string(),
  name: z.string().optional(),
  as: z.string().optional(),
});

const fetchStepSchema = z.object({
  step: z.literal('fetch'),
  url: z.string(),
  method: z.string().optional(),
  headers: z.record(z.string(), z.string()).optional(),
  body: z.string().optional(),
  as: z.string().optional(),
});

const mapStepSchema = z.object({
  step: z.literal('map'),
  fields: z.record(z.string(), z.string()),
});

const filterStepSchema = z.object({
  step: z.literal('filter'),
  field: z.string(),
  operator: z.enum(['eq', 'ne', 'gt', 'lt', 'gte', 'lte', 'contains', 'matches']),
  value: z.string(),
});

const setStepSchema = z.object({
  step: z.literal('set'),
  name: z.string(),
  value: z.string(),
});

const extractHtmlStepSchema = z.object({
  step: z.literal('extract_html'),
  selector: z.string(),
  as: z.string(),
});

const transformStepSchema = z.object({
  step: z.literal('transform'),
  type: z.string(),
  input: z.string(),
  as: z.string(),
  options: z.record(z.string(), z.unknown()).optional(),
});

const extractTreeStepSchema = z.object({
  step: z.literal('extract_tree'),
  root: z.string(),
  group: z.object({
    match: z.string(),
    title: z.string(),
    children: z.string(),
  }),
  leaf: z.object({
    match: z.string(),
    fields: z.record(z.string(), z.string()),
  }),
  pathSeparator: z.string().optional(),
});

const clickAllStepSchema = z.object({
  step: z.literal('click_all'),
  selector: z.string(),
  pause: z.number().positive().optional(),
  maxRounds: z.number().positive().optional(),
  settle: z.number().nonnegative().optional(),
});

const jsEvaluateStepSchema = z.object({
  step: z.literal('js_evaluate'),
  code: z.string().optional(),
  file: z.string().optional(),
  as: z.string().optional(),
});

export const pipelineStepSchema = z.discriminatedUnion('step', [
  navigateStepSchema,
  waitStepSchema,
  extractStepSchema,
  clickStepSchema,
  typeStepSchema,
  interceptStepSchema,
  cookieStepSchema,
  fetchStepSchema,
  mapStepSchema,
  filterStepSchema,
  setStepSchema,
  extractHtmlStepSchema,
  transformStepSchema,
  extractTreeStepSchema,
  clickAllStepSchema,
  jsEvaluateStepSchema,
]);

export type PipelineStep = z.infer<typeof pipelineStepSchema>;
export type NavigateStep = z.infer<typeof navigateStepSchema>;
export type WaitStep = z.infer<typeof waitStepSchema>;
export type ExtractStep = z.infer<typeof extractStepSchema>;
export type ClickStep = z.infer<typeof clickStepSchema>;
export type TypeStep = z.infer<typeof typeStepSchema>;
export type InterceptStep = z.infer<typeof interceptStepSchema>;
export type CookieStep = z.infer<typeof cookieStepSchema>;
export type FetchStep = z.infer<typeof fetchStepSchema>;
export type MapStep = z.infer<typeof mapStepSchema>;
export type FilterStep = z.infer<typeof filterStepSchema>;
export type SetStep = z.infer<typeof setStepSchema>;
export type ExtractTreeStep = z.infer<typeof extractTreeStepSchema>;
export type ClickAllStep = z.infer<typeof clickAllStepSchema>;
export type ExtractHtmlStep = z.infer<typeof extractHtmlStepSchema>;
export type TransformStep = z.infer<typeof transformStepSchema>;
export type JsEvaluateStep = z.infer<typeof jsEvaluateStepSchema>;

export const DAEMON_STEPS = ['transform'] as const;
export type DaemonStepType = (typeof DAEMON_STEPS)[number];

export function splitPipeline(steps: PipelineStep[]): {
  extensionSteps: PipelineStep[];
  daemonSteps: PipelineStep[];
} {
  const daemonSet = new Set<string>(DAEMON_STEPS);
  const firstDaemonIdx = steps.findIndex(s => daemonSet.has(s.step));
  if (firstDaemonIdx === -1) return { extensionSteps: steps, daemonSteps: [] };
  return {
    extensionSteps: steps.slice(0, firstDaemonIdx),
    daemonSteps: steps.slice(firstDaemonIdx),
  };
}
