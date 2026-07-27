export const CAPABILITIES = [
  'navigate',
  'cookie_read',
  'dom_read',
  'dom_write',
  'js_evaluate',
  'network_fetch',
  'cdp_attach',
  'daemon_transform',
  'state_mutate',
  'network_egress',
] as const;

export type Capability = (typeof CAPABILITIES)[number];

export type RiskLevel = 'low' | 'medium' | 'high';

export const CAPABILITY_RISK: Record<Capability, RiskLevel> = {
  navigate: 'low',
  cookie_read: 'medium',
  dom_read: 'low',
  dom_write: 'medium',
  js_evaluate: 'high',
  network_fetch: 'medium',
  cdp_attach: 'high',
  daemon_transform: 'low',
  state_mutate: 'high',
  network_egress: 'high',
};

export const HIGH_RISK_CAPABILITIES: readonly Capability[] = CAPABILITIES.filter(
  (c) => CAPABILITY_RISK[c] === 'high',
);

export function isCapability(value: string): value is Capability {
  return (CAPABILITIES as readonly string[]).includes(value);
}

export function requiredApprovals(
  capabilities: readonly string[],
  highRiskCaps: readonly string[],
): string[] {
  return capabilities.filter(c => highRiskCaps.includes(c));
}

export function hasAllApprovals(
  required: readonly string[],
  approved: readonly string[],
): boolean {
  return required.every(c => approved.includes(c));
}
