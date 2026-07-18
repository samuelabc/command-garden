import { describe, it, expect } from 'vitest';
import { applyArgDefaults, expandFanOut, validateEnumArgs } from './fan-out.js';
import type { ConnectorArg } from './connector.js';

const REGION_ARG: ConnectorArg = {
  name: 'region',
  type: 'string',
  required: false,
  default: 'all',
  enum: ['emea', 'amap', 'cn'],
};

const PLAIN_ARG: ConnectorArg = {
  name: 'month',
  type: 'string',
  required: true,
};

describe('expandFanOut', () => {
  it('returns isFanOut=false when no enum args exist', () => {
    const result = expandFanOut({ month: '2026-06' }, [PLAIN_ARG]);
    expect(result.isFanOut).toBe(false);
    expect(result.argSets).toEqual([{ month: '2026-06' }]);
  });

  it('returns isFanOut=false when enum arg is not "all"', () => {
    const result = expandFanOut({ region: 'emea' }, [REGION_ARG]);
    expect(result.isFanOut).toBe(false);
    expect(result.argSets).toEqual([{ region: 'emea' }]);
  });

  it('expands "all" into one arg set per enum value (with defaults applied)', () => {
    const result = expandFanOut({ region: 'all' }, [REGION_ARG]);
    expect(result.isFanOut).toBe(true);
    if (!result.isFanOut) throw new Error('expected fan-out');
    expect(result.fanOutArgName).toBe('region');
    expect(result.argSets).toEqual([
      { region: 'emea' },
      { region: 'amap' },
      { region: 'cn' },
    ]);
  });

  it('uses default value when arg is not provided', () => {
    const result = expandFanOut({}, [REGION_ARG]);
    expect(result.isFanOut).toBe(true);
    if (!result.isFanOut) throw new Error('expected fan-out');
    expect(result.fanOutArgName).toBe('region');
    expect(result.argSets).toHaveLength(3);
  });

  it('preserves other args during fan-out', () => {
    const result = expandFanOut({ region: 'all', verbose: 'true' }, [REGION_ARG, PLAIN_ARG]);
    expect(result.isFanOut).toBe(true);
    expect(result.argSets).toEqual([
      { region: 'emea', verbose: 'true' },
      { region: 'amap', verbose: 'true' },
      { region: 'cn', verbose: 'true' },
    ]);
  });

  it('applies defaults to non-fan-out argSets', () => {
    const regionWithDefault: ConnectorArg = {
      name: 'region', type: 'string', required: false,
      default: 'emea', enum: ['emea', 'amap', 'cn'],
    };
    const result = expandFanOut({}, [regionWithDefault]);
    expect(result.isFanOut).toBe(false);
    expect(result.argSets).toEqual([{ region: 'emea' }]);
  });

  it('only fans out the first matching enum arg', () => {
    const secondEnum: ConnectorArg = {
      name: 'env',
      type: 'string',
      required: false,
      enum: ['dev', 'prod'],
    };
    const result = expandFanOut({ region: 'all', env: 'all' }, [REGION_ARG, secondEnum]);
    expect(result.isFanOut).toBe(true);
    if (!result.isFanOut) throw new Error('expected fan-out');
    expect(result.fanOutArgName).toBe('region');
  });

  it('applies region default when clientid is provided but region is not', () => {
    const argDefs: ConnectorArg[] = [
      { name: 'clientid', type: 'string', required: true },
      { name: 'region', type: 'string', required: false, default: 'emea', enum: ['emea', 'amap', 'cn'] },
    ];
    const result = expandFanOut({ clientid: 'abc-123' }, argDefs);
    expect(result.isFanOut).toBe(false);
    expect(result.argSets).toEqual([{ clientid: 'abc-123', region: 'emea' }]);
  });

  it('returns isFanOut=false for empty args and no default', () => {
    const noDefault: ConnectorArg = {
      name: 'region',
      type: 'string',
      required: true,
      enum: ['emea', 'amap', 'cn'],
    };
    const result = expandFanOut({}, [noDefault]);
    expect(result.isFanOut).toBe(false);
  });
});

describe('applyArgDefaults', () => {
  it('fills in missing args that have defaults', () => {
    const argDefs: ConnectorArg[] = [
      { name: 'region', type: 'string', required: false, default: 'emea' },
      { name: 'month', type: 'string', required: true },
    ];
    expect(applyArgDefaults({}, argDefs)).toEqual({ region: 'emea' });
  });

  it('does not override user-provided values', () => {
    const argDefs: ConnectorArg[] = [
      { name: 'region', type: 'string', required: false, default: 'emea' },
    ];
    expect(applyArgDefaults({ region: 'cn' }, argDefs)).toEqual({ region: 'cn' });
  });

  it('converts numeric defaults to strings', () => {
    const argDefs: ConnectorArg[] = [
      { name: 'limit', type: 'number', required: false, default: 10 },
    ];
    expect(applyArgDefaults({}, argDefs)).toEqual({ limit: '10' });
  });

  it('preserves all existing args', () => {
    const argDefs: ConnectorArg[] = [
      { name: 'region', type: 'string', required: false, default: 'emea' },
    ];
    expect(applyArgDefaults({ clientid: 'abc' }, argDefs)).toEqual({ clientid: 'abc', region: 'emea' });
  });
});

describe('validateEnumArgs', () => {
  it('returns null for valid enum value', () => {
    expect(validateEnumArgs({ region: 'emea' }, [REGION_ARG])).toBeNull();
  });

  it('returns null for "all"', () => {
    expect(validateEnumArgs({ region: 'all' }, [REGION_ARG])).toBeNull();
  });

  it('returns null when no args provided and default is valid', () => {
    expect(validateEnumArgs({}, [REGION_ARG])).toBeNull();
  });

  it('returns error for invalid enum value', () => {
    const err = validateEnumArgs({ region: 'xyz' }, [REGION_ARG]);
    expect(err).toContain('Invalid value "xyz"');
    expect(err).toContain('emea, amap, cn, all');
  });

  it('returns null for args without enum', () => {
    expect(validateEnumArgs({ month: '2026-06' }, [PLAIN_ARG])).toBeNull();
  });

  it('skips args not provided and no default', () => {
    const noDefault: ConnectorArg = {
      name: 'region',
      type: 'string',
      required: true,
      enum: ['emea', 'amap', 'cn'],
    };
    expect(validateEnumArgs({}, [noDefault])).toBeNull();
  });
});
