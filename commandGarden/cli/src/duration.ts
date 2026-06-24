// src/duration.ts

const UNITS: Record<string, number> = {
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
  w: 604_800_000,
};

export function parseDuration(input: string): Date {
  const match = input.match(/^(\d+)([mhdw])$/);
  if (!match) throw new Error(`Invalid duration: "${input}". Use format like 7d, 2w, 12h, 30m`);
  const value = parseInt(match[1], 10);
  const unit = match[2];
  if (value <= 0) throw new Error(`Invalid duration: "${input}". Value must be positive`);
  return new Date(Date.now() - value * UNITS[unit]);
}
