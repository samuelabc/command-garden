import { describe, it, expect } from 'vitest';
import {
  CAPABILITIES,
  type Capability,
  CAPABILITY_RISK,
  HIGH_RISK_CAPABILITIES,
  isCapability,
} from './capabilities';

describe('CAPABILITIES', () => {
  it('defines exactly 7 capabilities', () => {
    expect(CAPABILITIES).toHaveLength(7);
  });

  it('includes all expected capabilities', () => {
    const expected: Capability[] = [
      'navigate', 'cookie_read', 'cookie_write',
      'dom_read', 'dom_write', 'intercept_response', 'js_evaluate',
    ];
    expect([...CAPABILITIES].sort()).toEqual([...expected].sort());
  });
});

describe('CAPABILITY_RISK', () => {
  it('marks cookie_write as high risk', () => {
    expect(CAPABILITY_RISK.cookie_write).toBe('high');
  });

  it('marks js_evaluate as high risk', () => {
    expect(CAPABILITY_RISK.js_evaluate).toBe('high');
  });

  it('marks navigate as low risk', () => {
    expect(CAPABILITY_RISK.navigate).toBe('low');
  });

  it('marks dom_read as low risk', () => {
    expect(CAPABILITY_RISK.dom_read).toBe('low');
  });

  it('marks dom_write as medium risk', () => {
    expect(CAPABILITY_RISK.dom_write).toBe('medium');
  });
});

describe('HIGH_RISK_CAPABILITIES', () => {
  it('includes exactly cookie_write and js_evaluate', () => {
    expect([...HIGH_RISK_CAPABILITIES].sort()).toEqual(['cookie_write', 'js_evaluate']);
  });
});

describe('isCapability', () => {
  it('returns true for valid capability', () => {
    expect(isCapability('navigate')).toBe(true);
  });

  it('returns false for invalid string', () => {
    expect(isCapability('fly')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isCapability('')).toBe(false);
  });
});
