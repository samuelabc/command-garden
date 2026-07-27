// Capabilities
export {
  CAPABILITIES,
  type Capability,
  type RiskLevel,
  CAPABILITY_RISK,
  HIGH_RISK_CAPABILITIES,
  isCapability,
  requiredApprovals,
  hasAllApprovals,
} from './capabilities.js';

// Pipeline steps
export {
  PIPELINE_STEP_TYPES,
  type PipelineStepType,
  STEP_CAPABILITY_MAP,
  inferStepCapabilities,
  type EvalAnalysis,
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
  type ExtractTreeStep,
  type ClickAllStep,
  type ExtractHtmlStep,
  type TransformStep,
  type JsEvaluateStep,
  DAEMON_STEPS,
  type DaemonStepType,
  splitPipeline,
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
  type SemanticValidationOptions,
} from './loader.js';

// Eval static analysis
export {
  detectNetworkEgress,
} from './eval-analyzer.js';

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
  type ApprovalConfig,
  type ExtensionRequest,
  type ExtensionResponse,
  type ApprovalRequest,
  type ApprovalResponse,
  isRunCommandRequest,
  isExtensionResponse,
  isApprovalRequest,
  isApprovalResponse,
} from './protocol.js';

// Audit events
export {
  AUDIT_EVENT_TYPES,
  type AuditEvent,
  type AuditEventType,
  type StepSummary,
  createAuditEvent,
  redactArgs,
} from './events.js';

// Fan-out
export {
  applyArgDefaults,
  expandFanOut,
  validateEnumArgs,
  type FanOutResult,
} from './fan-out.js';

// Daemon client
export {
  DaemonClient,
  DaemonHttpError,
  readToken,
} from './daemon-client.js';
