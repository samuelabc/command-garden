import { describe, it, expect } from 'vitest';
import {
  CAPABILITIES,
  type Capability,
  CAPABILITY_RISK,
  HIGH_RISK_CAPABILITIES,
  isCapability,
  requiredApprovals,
  hasAllApprovals,
} from './capabilities';

describe('CAPABILITIES', () => {
  it('defines exactly 10 capabilities', () => {
    expect(CAPABILITIES).toHaveLength(10);
  });

  it('includes all expected capabilities', () => {
    const expected: Capability[] = [
      'navigate', 'cookie_read', 'dom_read', 'dom_write',
      'js_evaluate', 'network_fetch', 'cdp_attach',
      'daemon_transform', 'state_mutate', 'network_egress',
    ];
    expect([...CAPABILITIES].sort()).toEqual([...expected].sort());
  });
});

describe('CAPABILITY_RISK', () => {
  it('marks js_evaluate as high risk', () => {
    expect(CAPABILITY_RISK.js_evaluate).toBe('high');
  });

  it('marks cdp_attach as high risk', () => {
    expect(CAPABILITY_RISK.cdp_attach).toBe('high');
  });

  it('marks state_mutate as high risk', () => {
    expect(CAPABILITY_RISK.state_mutate).toBe('high');
  });

  it('marks network_egress as high risk', () => {
    expect(CAPABILITY_RISK.network_egress).toBe('high');
  });

  it('marks navigate as low risk', () => {
    expect(CAPABILITY_RISK.navigate).toBe('low');
  });

  it('marks dom_read as low risk', () => {
    expect(CAPABILITY_RISK.dom_read).toBe('low');
  });

  it('marks daemon_transform as low risk', () => {
    expect(CAPABILITY_RISK.daemon_transform).toBe('low');
  });

  it('marks dom_write as medium risk', () => {
    expect(CAPABILITY_RISK.dom_write).toBe('medium');
  });

  it('marks network_fetch as medium risk', () => {
    expect(CAPABILITY_RISK.network_fetch).toBe('medium');
  });
});

describe('HIGH_RISK_CAPABILITIES', () => {
  it('includes exactly the four high-risk capabilities', () => {
    expect([...HIGH_RISK_CAPABILITIES].sort()).toEqual(
      ['cdp_attach', 'js_evaluate', 'network_egress', 'state_mutate'],
    );
  });
});

describe('isCapability', () => {
  it('returns true for valid capability', () => {
    expect(isCapability('navigate')).toBe(true);
    expect(isCapability('network_fetch')).toBe(true);
    expect(isCapability('cdp_attach')).toBe(true);
  });

  it('returns false for removed capabilities', () => {
    expect(isCapability('cookie_write')).toBe(false);
    expect(isCapability('intercept_response')).toBe(false);
  });

  it('returns false for invalid string', () => {
    expect(isCapability('fly')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isCapability('')).toBe(false);
  });
});

describe('requiredApprovals', () => {
  const highRisk = [...HIGH_RISK_CAPABILITIES];

  it('returns the intersection of declared and high-risk capabilities', () => {
    expect(requiredApprovals(['navigate', 'js_evaluate', 'network_egress'], highRisk))
      .toEqual(['js_evaluate', 'network_egress']);
  });

  it('returns empty for a connector with no high-risk capabilities', () => {
    expect(requiredApprovals(['navigate', 'dom_read'], highRisk)).toEqual([]);
  });

  it('respects a custom high-risk list', () => {
    expect(requiredApprovals(['navigate', 'js_evaluate'], ['navigate'])).toEqual(['navigate']);
  });

  it('returns empty when the high-risk list is empty', () => {
    expect(requiredApprovals(['js_evaluate'], [])).toEqual([]);
  });
});

describe('hasAllApprovals', () => {
  it('returns true when every required capability is approved', () => {
    expect(hasAllApprovals(['js_evaluate', 'network_egress'], ['js_evaluate', 'network_egress'])).toBe(true);
  });

  it('returns false when only some required capabilities are approved', () => {
    expect(hasAllApprovals(['js_evaluate', 'network_egress'], ['js_evaluate'])).toBe(false);
  });

  it('returns false when nothing is approved', () => {
    expect(hasAllApprovals(['js_evaluate'], [])).toBe(false);
  });

  it('is vacuously true when nothing is required', () => {
    expect(hasAllApprovals([], [])).toBe(true);
  });

  it('ignores extra approvals beyond what is required', () => {
    expect(hasAllApprovals(['js_evaluate'], ['js_evaluate', 'cdp_attach'])).toBe(true);
  });
});
