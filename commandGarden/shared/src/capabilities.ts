export const CAPABILITIES = [
  'navigate',
  'cookie_read',
  'cookie_write',
  'dom_read',
  'dom_write',
  'intercept_response',
  'js_evaluate',
] as const;

export type Capability = (typeof CAPABILITIES)[number];

export type RiskLevel = 'low' | 'medium' | 'high';

export const CAPABILITY_RISK: Record<Capability, RiskLevel> = {
  navigate: 'low',
  cookie_read: 'medium',
  cookie_write: 'high',
  dom_read: 'low',
  dom_write: 'medium',
  intercept_response: 'medium',
  js_evaluate: 'high',
};

export const HIGH_RISK_CAPABILITIES: readonly Capability[] = CAPABILITIES.filter(
  (c) => CAPABILITY_RISK[c] === 'high',
);

export function isCapability(value: string): value is Capability {
  return (CAPABILITIES as readonly string[]).includes(value);
}
