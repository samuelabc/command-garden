// Capabilities
export {
  CAPABILITIES,
  type Capability,
  type RiskLevel,
  CAPABILITY_RISK,
  HIGH_RISK_CAPABILITIES,
  isCapability,
} from './capabilities.js';

// Pipeline steps
export {
  PIPELINE_STEP_TYPES,
  type PipelineStepType,
  STEP_CAPABILITY_MAP,
  pipelineStepSchema,
  type PipelineStep,
  type NavigateStep,
  type WaitStep,
  type ExtractStep,
  type ClickStep,
  type TypeStep,
  type InterceptStep,
  type CookieStep,
  type FetchStep,
  type MapStep,
  type FilterStep,
  type SetStep,
} from './pipeline.js';

// Connector schema
export {
  connectorSchema,
  type ConnectorDef,
  type ConnectorArg,
  type ConnectorColumn,
} from './connector.js';

// YAML loader
export {
  parseConnectorYaml,
  validateConnectorSemantics,
  type LoadError,
} from './loader.js';

// Expression engine
export {
  tokenize,
  parse,
  evaluate,
  interpolate,
  BUILT_IN_FILTERS,
  type Token,
  type TokenType,
  type Expr,
  type ExprContext,
  type FilterFn,
} from './expression/index.js';

// Protocol
export {
  type RunCommandRequest,
  type RunCommandResponse,
  type ExtensionRequest,
  type ExtensionResponse,
  isRunCommandRequest,
  isExtensionResponse,
} from './protocol.js';

// Audit events
export {
  AUDIT_EVENT_TYPES,
  type AuditEvent,
  type AuditEventType,
  createAuditEvent,
} from './events.js';
