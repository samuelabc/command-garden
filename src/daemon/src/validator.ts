import type { ConnectorDef } from '@commandgarden/shared';
import { requiredApprovals, hasAllApprovals } from '@commandgarden/shared';
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

  const required = requiredApprovals(connector.capabilities, config.security.highRiskCapabilities);
  const approved = config.security.approvedHighRisk[connectorKey] ?? [];
  if (!hasAllApprovals(required, approved)) {
    const unapproved = required.filter(c => !approved.includes(c));
    return {
      ok: false,
      denialReason: `Connector "${connectorKey}" uses unapproved high-risk capabilities: [${unapproved.join(', ')}]`,
    };
  }

  return { ok: true, connector };
}
