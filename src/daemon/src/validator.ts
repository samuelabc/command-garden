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
    const approved = config.security.approvedHighRisk[connectorKey] ?? [];
    const unapproved = usesHighRisk.filter(c => !approved.includes(c));
    if (unapproved.length > 0) {
      return {
        ok: false,
        denialReason: `Connector "${connectorKey}" uses unapproved high-risk capabilities: [${unapproved.join(', ')}]`,
      };
    }
  }

  return { ok: true, connector };
}
