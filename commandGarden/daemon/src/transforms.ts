// src/transforms.ts
import TurndownService from 'turndown';

export type TransformFn = (input: string, options?: Record<string, unknown>) => string | Record<string, string>;

const transforms = new Map<string, TransformFn>();

transforms.set('html_to_markdown', (input: string) => {
  const td = new TurndownService();
  return td.turndown(input);
});

transforms.set('split_metadata', (input: string, options?: Record<string, unknown>) => {
  const delimiter = (options?.delimiter as string) ?? '|';
  const fieldNames = (options?.fields as string[]) ?? [];
  const parts = input.split(delimiter).map(s => s.trim());
  const result: Record<string, string> = {};
  for (let i = 0; i < fieldNames.length; i++) {
    result[fieldNames[i]] = parts[i] ?? '';
  }
  return result;
});

export function getTransform(type: string): TransformFn {
  const fn = transforms.get(type);
  if (!fn) throw new Error(`Unknown transform type: "${type}"`);
  return fn;
}
