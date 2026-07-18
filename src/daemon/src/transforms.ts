// src/transforms.ts
import TurndownService from 'turndown';

export type TransformFn = (input: unknown, options?: Record<string, unknown>) => string | Record<string, string> | Record<string, unknown>[];

const transforms = new Map<string, TransformFn>();

transforms.set('html_to_markdown', (input: unknown) => {
  const td = new TurndownService();
  return td.turndown(String(input));
});

transforms.set('split_metadata', (input: unknown, options?: Record<string, unknown>) => {
  const delimiter = (options?.delimiter as string) ?? '|';
  const fieldNames = (options?.fields as string[]) ?? [];
  const parts = String(input).split(delimiter).map(s => s.trim());
  const result: Record<string, string> = {};
  for (let i = 0; i < fieldNames.length; i++) {
    result[fieldNames[i]] = parts[i] ?? '';
  }
  return result;
});

transforms.set('json_unwrap', (input: unknown, options?: Record<string, unknown>) => {
  const path = (options?.path as string) ?? '';
  let current: unknown = input;
  for (const key of path.split('.')) {
    if (current == null || typeof current !== 'object') return [];
    current = (current as Record<string, unknown>)[key];
  }
  if (!Array.isArray(current)) return [];
  return current as Record<string, unknown>[];
});

export function getTransform(type: string): TransformFn {
  const fn = transforms.get(type);
  if (!fn) throw new Error(`Unknown transform type: "${type}"`);
  return fn;
}
