import type { ConnectorDef } from '@commandgarden/shared';

export function buildAllowlistFromConnectors(connectors: ConnectorDef[]): Set<string> {
  const domains = new Set<string>();
  for (const c of connectors) {
    for (const d of c.domains) domains.add(d);
  }
  return domains;
}

export function buildAllowlist(domains: string[]): Set<string> {
  return new Set(domains);
}

export function extractHostname(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

export function isUrlAllowed(url: string, allowlist: Set<string>): boolean {
  const hostname = extractHostname(url);
  if (!hostname) return false;
  return allowlist.has(hostname);
}
