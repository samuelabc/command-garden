import { z } from 'zod';
import { CAPABILITIES } from './capabilities.js';
import { pipelineStepSchema } from './pipeline.js';

const capabilityEnum = z.enum(CAPABILITIES);

const connectorArgSchema = z.object({
  name: z.string(),
  type: z.enum(['string', 'number', 'boolean']),
  required: z.boolean().default(false),
  default: z.union([z.string(), z.number(), z.boolean()]).optional(),
  help: z.string().optional(),
  pattern: z.string().optional(),
});

const connectorColumnSchema = z.object({
  name: z.string(),
  type: z.enum(['string', 'number', 'boolean']),
});

export const connectorSchema = z.object({
  site: z.string().min(1),
  name: z.string().min(1),
  version: z.string(),
  description: z.string().optional(),
  access: z.enum(['read', 'write']).default('read'),
  domains: z.array(z.string()).min(1),
  capabilities: z.array(capabilityEnum).min(1),
  args: z.array(connectorArgSchema).optional().default([]),
  columns: z.array(connectorColumnSchema).optional().default([]),
  pipeline: z.array(pipelineStepSchema).min(1),
});

export type ConnectorDef = z.infer<typeof connectorSchema>;
export type ConnectorArg = z.infer<typeof connectorArgSchema>;
export type ConnectorColumn = z.infer<typeof connectorColumnSchema>;
