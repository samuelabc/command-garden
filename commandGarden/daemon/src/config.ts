// src/config.ts
import { z } from 'zod';
import { parse as parseYaml } from 'yaml';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

export const configSchema = z.object({
  daemon: z.object({
    port: z.number().int().min(1024).max(65535).default(19825),
    host: z.string().default('127.0.0.1'),
  }).default({}),
  security: z.object({
    extensionId: z.string().default(''),
    highRiskCapabilities: z.array(z.string()).default(['js_evaluate', 'cookie_write']),
    approvedHighRisk: z.array(z.string()).default([]),
    approvalRequired: z.array(z.string()).default([]),
    autoApproveConnectors: z.array(z.string()).default([]),
    approvalTimeoutMs: z.number().int().positive().default(120_000),
  }).default({}),
  connectors: z.object({
    paths: z.array(z.string()).default(['./connectors', '~/.commandgarden/connectors']),
  }).default({}),
  audit: z.object({
    retentionDays: z.number().int().positive().default(90),
    dbPath: z.string().default('~/.commandgarden/audit.db'),
  }).default({}),
  output: z.object({
    defaultFormat: z.enum(['table', 'json', 'csv']).default('table'),
  }).default({}),
});

export type DaemonConfig = z.infer<typeof configSchema>;

export function expandHome(p: string): string {
  if (p.startsWith('~/') || p.startsWith('~\\')) {
    return join(homedir(), p.slice(2));
  }
  return p;
}

export function loadConfig(configPath?: string): DaemonConfig {
  const path = configPath ?? join(homedir(), '.commandgarden', 'config.yaml');
  if (!existsSync(path)) return configSchema.parse({});
  const raw = readFileSync(path, 'utf-8');
  const parsed = parseYaml(raw);
  return configSchema.parse(parsed ?? {});
}
