// src/validator.ts
import type { ConnectorDef } from '@commandgarden/shared';
import type { DaemonConfig } from './config.js';
import type { ConnectorRegistry } from './registry.js';

export interface ValidationResult {
  ok: boolean;
  connector?: ConnectorDef;
  denialReason?: string;
}

export function validateCommand(
  connectorKey: string,
  registry: ConnectorRegistry,
  config: DaemonConfig,
): ValidationResult {
  const connector = registry.get(connectorKey);
  if (!connector) {
    return { ok: false, denialReason: `Connector "${connectorKey}" not found` };
  }
  const highRiskCaps = config.security.highRiskCapabilities;
  const usesHighRisk = connector.capabilities.filter(c => highRiskCaps.includes(c));
  if (usesHighRisk.length > 0) {
    const approved = new Set(config.security.approvedHighRisk);
    if (!approved.has(connectorKey)) {
      return {
        ok: false,
        denialReason: `Connector "${connectorKey}" uses high-risk capabilities [${usesHighRisk.join(', ')}] but is not approved`,
      };
    }
  }
  return { ok: true, connector };
}
