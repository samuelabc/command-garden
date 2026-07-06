import type { ConnectorArg } from './connector.js';

export type FanOutResult =
  | { isFanOut: false; argSets: Record<string, string>[] }
  | { isFanOut: true; fanOutArgName: string; argSets: Record<string, string>[] };

/**
 * Expand "all" on enum args into multiple arg sets for sequential fan-out.
 * If no enum arg has the value "all", returns the original args as a single-item array.
 * Only one arg can fan out per invocation (first match wins).
 */
export function expandFanOut(
  args: Record<string, string>,
  argDefs: ConnectorArg[],
): FanOutResult {
  for (const def of argDefs) {
    if (!def.enum || def.enum.length === 0) continue;
    const value = args[def.name] ?? def.default;
    if (String(value) !== 'all') continue;

    return {
      isFanOut: true,
      fanOutArgName: def.name,
      argSets: def.enum.map(enumVal => ({ ...args, [def.name]: enumVal })),
    };
  }

  return { isFanOut: false, argSets: [args] };
}

/**
 * Validate that all enum args have valid values (in the enum list or "all").
 * Returns null if valid, or an error message string if invalid.
 */
export function validateEnumArgs(
  args: Record<string, string>,
  argDefs: ConnectorArg[],
): string | null {
  for (const def of argDefs) {
    if (!def.enum || def.enum.length === 0) continue;
    const value = args[def.name] ?? (def.default != null ? String(def.default) : undefined);
    if (value === undefined) continue;
    if (value === 'all') continue;
    if (!def.enum.includes(value)) {
      return `Invalid value "${value}" for arg "${def.name}". Must be one of: ${def.enum.join(', ')}, all`;
    }
  }
  return null;
}
