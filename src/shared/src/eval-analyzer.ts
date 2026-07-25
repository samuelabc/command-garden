const NETWORK_PATTERNS = [
  /\bfetch\s*\(/,
  /\bnew\s+XMLHttpRequest\b/,
  /\bnavigator\.sendBeacon\b/,
  /\.open\s*\(\s*['"`](GET|POST|PUT|DELETE|PATCH)/i,
  /\baxios\b/,
  /\$\.ajax\b/,
  /\bnew\s+WebSocket\s*\(/,
  /\bnew\s+EventSource\s*\(/,
];

export function detectNetworkEgress(code: string): boolean {
  return NETWORK_PATTERNS.some((p) => p.test(code));
}
