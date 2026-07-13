export type FilterFn = (value: unknown, ...args: unknown[]) => unknown;

export const BUILT_IN_FILTERS: Record<string, FilterFn> = {
  default: (value: unknown, fallback: unknown) => value ?? fallback,
  number: (value: unknown) => Number(value),
  trim: (value: unknown) => String(value).trim(),
  upper: (value: unknown) => String(value).toUpperCase(),
  lower: (value: unknown) => String(value).toLowerCase(),
  lookup: (value: unknown, map: unknown) => {
    if (map == null || typeof map !== 'object') return undefined;
    return (map as Record<string, unknown>)[String(value)];
  },
  slice: (value: unknown, start: unknown, end?: unknown) =>
    String(value).slice(Number(start), end != null ? Number(end) : undefined),
  replace: (value: unknown, search: unknown, replacement: unknown) =>
    String(value).replace(String(search), String(replacement ?? '')),
};
