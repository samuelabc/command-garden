// src/commands/config-cmd.ts
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

const VALID_SECTIONS = ['daemon', 'security', 'connectors', 'audit', 'output'];

export function executeConfigShow(configPath: string): string {
  if (!existsSync(configPath)) {
    return [
      'No config file found.',
      `Expected at: ${configPath}`,
      'Using defaults. Run "commandgarden config set <key> <value>" to create one.',
    ].join('\n');
  }
  return readFileSync(configPath, 'utf-8');
}

export function executeConfigSet(configPath: string, key: string, value: string): string {
  const parts = key.split('.');
  if (parts.length !== 2 || !VALID_SECTIONS.includes(parts[0])) {
    return `Unknown config section: "${parts[0]}". Valid sections: ${VALID_SECTIONS.join(', ')}`;
  }

  let config: Record<string, Record<string, unknown>> = {};
  if (existsSync(configPath)) {
    const raw = readFileSync(configPath, 'utf-8');
    config = (parseYaml(raw) as Record<string, Record<string, unknown>>) ?? {};
  }

  const [section, prop] = parts;
  if (!config[section]) config[section] = {};

  // Auto-convert numeric and boolean values
  let parsed: unknown = value;
  if (value === 'true') parsed = true;
  else if (value === 'false') parsed = false;
  else if (!isNaN(Number(value)) && value !== '') parsed = Number(value);

  config[section][prop] = parsed;

  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(configPath, stringifyYaml(config), 'utf-8');
  return `Set ${key} = ${value}`;
}
