import { z } from 'zod';
import type { Capability } from './capabilities.js';

export const PIPELINE_STEP_TYPES = [
  'navigate', 'wait', 'extract', 'click', 'type',
  'intercept', 'cookie', 'fetch', 'map', 'filter', 'set',
] as const;

export type PipelineStepType = (typeof PIPELINE_STEP_TYPES)[number];

export const STEP_CAPABILITY_MAP: Record<PipelineStepType, Capability | null> = {
  navigate: 'navigate',
  wait: 'navigate',
  extract: 'dom_read',
  click: 'dom_write',
  type: 'dom_write',
  intercept: 'intercept_response',
  cookie: 'cookie_read',
  fetch: 'cookie_read',
  map: null,
  filter: null,
  set: null,
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
