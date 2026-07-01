import { useEffect, useState, useCallback, useMemo } from 'react';
import { stringify as stringifyYaml, parse as parseYaml } from 'yaml';
import { api, type Connector } from '../api';
import { Badge } from '../components/Badge';
import { Spinner } from '../components/Spinner';
const RESTART_REQUIRED_KEYS = new Set(['daemon.host', 'daemon.port', 'app.port']);
const DEFAULT_HIGH_RISK_CAPABILITIES = ['js_evaluate', 'cookie_write'] as const;

interface ConfigState {
  daemon: { host: string; port: number };
  security: {
    extensionId: string;
    highRiskCapabilities: string[];
    approvedHighRisk: string[];
    approvalRequired: string[];
    autoApproveConnectors: string[];
    approvalTimeoutMs: number;
  };
  connectors: { paths: string[] };
  audit: { retentionDays: number; dbPath: string };
  output: { defaultFormat: string };
  app: { port: number };
}

interface FormActions {
  updateField: <S extends keyof ConfigState>(section: S, key: keyof ConfigState[S], value: ConfigState[S][keyof ConfigState[S]]) => void;
  addToArray: (section: keyof ConfigState, key: string, value: string) => void;
  removeFromArray: (section: keyof ConfigState, key: string, value: string) => void;
}

function configFromRaw(raw: Record<string, Record<string, unknown>>): ConfigState {
  const d = raw.daemon ?? {};
  const s = raw.security ?? {};
  const c = raw.connectors ?? {};
  const a = raw.audit ?? {};
  const o = raw.output ?? {};
  const ap = raw.app ?? {};
  return {
    daemon: { host: String(d.host ?? '127.0.0.1'), port: Number(d.port ?? 19825) },
    security: {
      extensionId: String(s.extensionId ?? ''),
      highRiskCapabilities: (s.highRiskCapabilities as string[]) ?? [...DEFAULT_HIGH_RISK_CAPABILITIES],
      approvedHighRisk: (s.approvedHighRisk as string[]) ?? [],
      approvalRequired: (s.approvalRequired as string[]) ?? [],
      autoApproveConnectors: (s.autoApproveConnectors as string[]) ?? [],
      approvalTimeoutMs: Number(s.approvalTimeoutMs ?? 120000),
    },
    connectors: { paths: (c.paths as string[]) ?? ['./connectors', '~/.commandgarden/connectors'] },
    audit: { retentionDays: Number(a.retentionDays ?? 90), dbPath: String(a.dbPath ?? '~/.commandgarden/audit.db') },
    output: { defaultFormat: String(o.defaultFormat ?? 'table') },
    app: { port: Number(ap.port ?? 19826) },
  };
}

function configToFlat(config: ConfigState): Record<string, unknown> {
  return {
    daemon: { ...config.daemon },
    security: { ...config.security },
    connectors: { ...config.connectors },
    audit: { ...config.audit },
    output: { ...config.output },
    app: { ...config.app },
  };
}

export default function Config() {
  const [saved, setSaved] = useState<ConfigState | null>(null);
  const [edited, setEdited] = useState<ConfigState | null>(null);
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [restartBanner, setRestartBanner] = useState(false);
  const [rawYaml, setRawYaml] = useState('');
  const [rawOpen, setRawOpen] = useState(false);
  const [rawError, setRawError] = useState('');

  useEffect(() => {
    Promise.all([api.getConfig(), api.getConnectors()])
      .then(([configRes, connRes]) => {
        const state = configFromRaw(configRes.config);
        setSaved(state);
        setEdited(structuredClone(state));
        setConnectors(connRes.connectors);
      })
      .catch(() => {
        setSaved(null);
        setEdited(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const isDirty = useMemo(() => {
    if (!saved || !edited) return false;
    return JSON.stringify(saved) !== JSON.stringify(edited);
  }, [saved, edited]);

  const changedCount = useMemo(() => {
    if (!saved || !edited) return 0;
    let count = 0;
    for (const section of Object.keys(edited) as (keyof ConfigState)[]) {
      const s = saved[section] as Record<string, unknown>;
      const e = edited[section] as Record<string, unknown>;
      for (const key of Object.keys(e)) {
        if (JSON.stringify(s[key]) !== JSON.stringify(e[key])) count++;
      }
    }
    return count;
  }, [saved, edited]);

  const handleSave = useCallback(async () => {
    if (!saved || !edited) return;
    if (!edited.daemon.host.trim()) {
      setToast({ type: 'error', msg: 'Daemon host cannot be empty.' });
      return;
    }
    setSaving(true);
    setToast(null);
    let needsRestart = false;
    try {
      for (const section of Object.keys(edited) as (keyof ConfigState)[]) {
        const s = saved[section] as Record<string, unknown>;
        const e = edited[section] as Record<string, unknown>;
        for (const key of Object.keys(e)) {
          const newVal = JSON.stringify(e[key]);
          const oldVal = JSON.stringify(s[key] ?? null);
          if (newVal !== oldVal) {
            const configKey = `${section}.${key}`;
            const val = e[key];
            let strVal: string;
            if (configKey === 'security.approvalTimeoutMs') {
              strVal = String(val);
            } else if (Array.isArray(val)) {
              strVal = JSON.stringify(val);
            } else {
              strVal = String(val);
            }
            await api.setConfig(configKey, strVal);
            if (RESTART_REQUIRED_KEYS.has(configKey)) needsRestart = true;
          }
        }
      }
      setSaved(structuredClone(edited));
      setToast({ type: 'success', msg: 'Configuration saved.' });
      if (needsRestart) setRestartBanner(true);
    } catch (e) {
      setToast({ type: 'error', msg: e instanceof Error ? e.message : 'Save failed' });
    } finally {
      setSaving(false);
      setTimeout(() => setToast(null), 3000);
    }
  }, [saved, edited]);

  const handleDiscard = useCallback(() => {
    if (saved) setEdited(structuredClone(saved));
  }, [saved]);

  const handleRawOpen = useCallback(() => {
    if (!rawOpen && edited) {
      setRawYaml(stringifyYaml(configToFlat(edited)));
      setRawError('');
    }
    setRawOpen(!rawOpen);
  }, [rawOpen, edited]);

  const handleRawApply = useCallback(() => {
    try {
      const parsed = parseYaml(rawYaml) as Record<string, Record<string, unknown>>;
      if (!parsed || typeof parsed !== 'object') throw new Error('Invalid YAML');
      setEdited(configFromRaw(parsed));
      setRawError('');
    } catch (e) {
      setRawError(e instanceof Error ? e.message : 'Invalid YAML');
    }
  }, [rawYaml]);

  const updateField = useCallback(<S extends keyof ConfigState>(section: S, key: keyof ConfigState[S], value: ConfigState[S][typeof key]) => {
    setEdited(prev => {
      if (!prev) return prev;
      return { ...prev, [section]: { ...prev[section], [key]: value } };
    });
  }, []);

  const addToArray = useCallback((section: keyof ConfigState, key: string, value: string) => {
    setEdited(prev => {
      if (!prev) return prev;
      const sectionObj = prev[section] as Record<string, unknown>;
      const arr = (sectionObj[key] as string[]) ?? [];
      if (arr.includes(value)) return prev;
      return { ...prev, [section]: { ...sectionObj, [key]: [...arr, value] } };
    });
  }, []);

  const removeFromArray = useCallback((section: keyof ConfigState, key: string, value: string) => {
    setEdited(prev => {
      if (!prev) return prev;
      const sectionObj = prev[section] as Record<string, unknown>;
      const arr = (sectionObj[key] as string[]) ?? [];
      return { ...prev, [section]: { ...sectionObj, [key]: arr.filter(v => v !== value) } };
    });
  }, []);

  const formActions = useMemo(() => ({ updateField, addToArray, removeFromArray }), [updateField, addToArray, removeFromArray]);

  if (loading) return <Spinner label="Loading configuration..." />;

  if (!edited || !saved) {
    return (
      <div className="max-w-3xl mx-auto">
        <h2 className="font-display text-xl font-bold uppercase tracking-[0.06em] mb-5">Configuration</h2>
        <div className="border border-base-300 p-6 text-center">
          <p className="text-sm opacity-50 mb-2">No configuration found.</p>
          <p className="font-mono text-xs opacity-30">Make sure the daemon is running. Configuration will appear here automatically.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto pb-20">
      <h2 className="font-display text-xl font-bold uppercase tracking-[0.06em] mb-5">Configuration</h2>

      {restartBanner && (
        <div className="alert alert-warning mb-6">
          <span>Some changes require a daemon restart to take effect. Restart with: <code className="font-mono text-sm">cg down && cg up</code></span>
          <button className="btn btn-sm btn-ghost" onClick={() => setRestartBanner(false)}>Dismiss</button>
        </div>
      )}

      <div className="space-y-8">
        <ServerSection config={edited} actions={formActions} />
        <ConnectorSecuritySection config={edited} connectors={connectors} actions={formActions} />
        <ConnectorSourcesSection config={edited} actions={formActions} />
        <AuditSection config={edited} actions={formActions} />
        <OutputSection config={edited} actions={formActions} />
      </div>

      {/* Raw Config Editor */}
      <div className="mt-8">
        <button className="btn btn-sm btn-ghost gap-1" onClick={handleRawOpen}>
          {rawOpen ? '▾' : '▸'} Raw Configuration (YAML)
        </button>
        {rawOpen && (
          <div className="mt-2 border border-base-300 p-4">
            <textarea
              className="textarea textarea-bordered w-full font-mono text-sm"
              rows={16}
              value={rawYaml}
              onChange={e => setRawYaml(e.target.value)}
            />
            {rawError && <p className="text-error text-sm mt-1">{rawError}</p>}
            <button className="btn btn-sm btn-ghost mt-2" onClick={handleRawApply}>Apply to form</button>
          </div>
        )}
      </div>

      {/* Sticky save footer */}
      {isDirty && (
        <div className="fixed bottom-0 left-0 md:left-56 right-0 bg-base-100 border-t border-base-300 px-6 py-3 flex items-center justify-between z-50">
          <span className="text-sm opacity-60">{changedCount} unsaved {changedCount === 1 ? 'change' : 'changes'}</span>
          <div className="flex items-center gap-3">
            {toast && (
              <span className={`text-sm ${toast.type === 'success' ? 'text-success' : 'text-error'}`}>{toast.msg}</span>
            )}
            <button className="btn btn-sm btn-ghost" onClick={handleDiscard}>Discard</button>
            <button className="btn btn-sm btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : 'Save changes'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function SectionCard({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="border border-base-300 p-5">
      <h3 className="font-display font-semibold mb-1">{title}</h3>
      <p className="text-xs opacity-40 mb-5">{description}</p>
      <div className="space-y-5">{children}</div>
    </div>
  );
}

function Field({ label, help, restart, children }: { label: string; help: string; restart?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-4">
        <div className="w-48 shrink-0">
          <label className="font-mono text-[0.7rem] font-medium uppercase tracking-wide">{label}</label>
          {restart && (
            <span className="ml-1.5 tooltip tooltip-right" data-tip="Requires daemon restart">
              <span className="text-xs opacity-40">⟳</span>
            </span>
          )}
        </div>
        <div className="flex-1">{children}</div>
      </div>
      <p className="text-xs opacity-40 mt-1 max-w-[12rem]">{help}</p>
    </div>
  );
}

function ServerSection({ config, actions }: { config: ConfigState; actions: FormActions }) {
  const { updateField } = actions;
  return (
    <SectionCard title="Server" description="Daemon and app server binding configuration">
      <Field label="Daemon Host" help="IP address the daemon binds to" restart>
        <input type="text" className="input input-bordered input-sm w-full" required value={config.daemon.host}
          onChange={e => updateField('daemon', 'host', e.target.value)} />
      </Field>
      <Field label="Daemon Port" help="Port the daemon listens on" restart>
        <input type="number" className="input input-bordered input-sm w-full" min={1024} max={65535}
          value={config.daemon.port} onChange={e => updateField('daemon', 'port', Number(e.target.value))} />
      </Field>
      <Field label="GUI Port" help="Port the GUI app server listens on" restart>
        <input type="number" className="input input-bordered input-sm w-full" min={1024} max={65535}
          value={config.app.port} onChange={e => updateField('app', 'port', Number(e.target.value))} />
      </Field>
    </SectionCard>
  );
}

function TagEditor({ values, onAdd, onRemove, placeholder }: {
  values: string[];
  onAdd: (value: string) => void;
  onRemove: (value: string) => void;
  placeholder: string;
}) {
  const [input, setInput] = useState('');
  return (
    <>
      <div className="flex flex-wrap gap-1 mb-1">
        {values.map(v => (
          <Badge key={v} size="sm" className="gap-1">
            {v}
            <button className="text-xs opacity-50 hover:opacity-100" onClick={() => onRemove(v)}>&times;</button>
          </Badge>
        ))}
      </div>
      <div className="flex gap-1">
        <input type="text" className="input input-bordered input-xs flex-1" placeholder={placeholder}
          value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && input.trim()) { onAdd(input.trim()); setInput(''); } }} />
        <button className="btn btn-xs btn-ghost" onClick={() => { if (input.trim()) { onAdd(input.trim()); setInput(''); } }}>Add</button>
      </div>
    </>
  );
}

function ConnectorSecuritySection({ config, connectors, actions }: {
  config: ConfigState;
  connectors: Connector[];
  actions: FormActions;
}) {
  const { updateField, addToArray, removeFromArray } = actions;
  const highRiskCaps = new Set(config.security.highRiskCapabilities);

  return (
    <SectionCard title="Connector Security" description="Manage which connectors are approved and which capabilities require approval">
      {/* Per-connector table */}
      {connectors.length > 0 && (
        <div className="overflow-x-auto mb-4">
          <table className="table table-sm">
            <thead>
              <tr>
                <th>Connector</th>
                <th>Capabilities</th>
                <th>Risk</th>
                <th>Approved</th>
                <th>Auto-Approve</th>
              </tr>
            </thead>
            <tbody>
              {connectors.map(c => {
                const isHighRisk = c.capabilities.some(cap => highRiskCaps.has(cap));
                const isApproved = config.security.approvedHighRisk.includes(c.key);
                const isAutoApproved = config.security.autoApproveConnectors.includes(c.key);
                return (
                  <tr key={c.key}>
                    <td className="font-mono text-sm">{c.key}</td>
                    <td>
                      <div className="flex flex-wrap gap-1">
                        {c.capabilities.map(cap => (
                          <Badge key={cap} variant={highRiskCaps.has(cap) ? 'warning' : 'neutral'} size="xs">{cap}</Badge>
                        ))}
                      </div>
                    </td>
                    <td>{isHighRisk ? <Badge variant="warning" size="xs">High</Badge> : <span className="opacity-40">—</span>}</td>
                    <td>
                      {isHighRisk ? (
                        <input type="checkbox" className="toggle toggle-sm toggle-success" checked={isApproved}
                          onChange={() => isApproved
                            ? removeFromArray('security', 'approvedHighRisk', c.key)
                            : addToArray('security', 'approvedHighRisk', c.key)} />
                      ) : <span className="opacity-40">—</span>}
                    </td>
                    <td>
                      <input type="checkbox" className="toggle toggle-sm" checked={isAutoApproved}
                        title="Skip approval prompts — pipeline steps execute without confirmation"
                        onChange={() => isAutoApproved
                          ? removeFromArray('security', 'autoApproveConnectors', c.key)
                          : addToArray('security', 'autoApproveConnectors', c.key)} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Capability-level policy */}
      <Field label="High-Risk Capabilities" help="Capabilities that require connector-level approval before first use">
        <TagEditor
          values={config.security.highRiskCapabilities}
          onAdd={v => addToArray('security', 'highRiskCapabilities', v)}
          onRemove={v => removeFromArray('security', 'highRiskCapabilities', v)}
          placeholder="Capability name"
        />
      </Field>

      <Field label="Step Approval Required" help="Capabilities that pause for user confirmation at each pipeline step">
        <TagEditor
          values={config.security.approvalRequired}
          onAdd={v => addToArray('security', 'approvalRequired', v)}
          onRemove={v => removeFromArray('security', 'approvalRequired', v)}
          placeholder="Capability name"
        />
      </Field>

      <Field label="Approval Timeout (seconds)" help="How long to wait for approval before aborting the pipeline">
        <input type="number" className="input input-bordered input-sm w-full" min={1} max={600}
          value={Math.round(config.security.approvalTimeoutMs / 1000)}
          onChange={e => updateField('security', 'approvalTimeoutMs', Number(e.target.value) * 1000)} />
      </Field>

      <Field label="Extension ID" help="Chrome extension ID for origin validation. Leave blank to accept any extension.">
        <input type="text" className="input input-bordered input-sm w-full" placeholder="Leave blank for any"
          value={config.security.extensionId} onChange={e => updateField('security', 'extensionId', e.target.value)} />
      </Field>
    </SectionCard>
  );
}

function ConnectorSourcesSection({ config, actions }: { config: ConfigState; actions: FormActions }) {
  const { addToArray, removeFromArray } = actions;
  const [addPath, setAddPath] = useState('');
  return (
    <SectionCard title="Connector Sources" description="Directories to scan for connector YAML files">
      <div className="space-y-1">
        {config.connectors.paths.map((p, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="font-mono text-sm flex-1">{p}</span>
            <button className="btn btn-xs btn-ghost opacity-50 hover:opacity-100" onClick={() => removeFromArray('connectors', 'paths', p)}>&times;</button>
          </div>
        ))}
      </div>
      <div className="flex gap-1 mt-2">
        <input type="text" className="input input-bordered input-xs flex-1 font-mono" placeholder="~/path/to/connectors"
          value={addPath} onChange={e => setAddPath(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && addPath.trim()) { addToArray('connectors', 'paths', addPath.trim()); setAddPath(''); } }} />
        <button className="btn btn-xs btn-ghost" onClick={() => { if (addPath.trim()) { addToArray('connectors', 'paths', addPath.trim()); setAddPath(''); } }}>Add path</button>
      </div>
      <p className="text-xs opacity-40 mt-1">Use <code>~/</code> for home directory paths. Relative paths resolve from the install directory.</p>
    </SectionCard>
  );
}

function AuditSection({ config, actions }: { config: ConfigState; actions: FormActions }) {
  const { updateField } = actions;
  return (
    <SectionCard title="Audit & Retention" description="Audit log storage and cleanup settings">
      <Field label="Retention Period" help="Days to keep audit log entries before cleanup">
        <input type="number" className="input input-bordered input-sm w-full" min={1} max={3650}
          value={config.audit.retentionDays} onChange={e => updateField('audit', 'retentionDays', Number(e.target.value))} />
      </Field>
      <Field label="Database Path" help="Path to the audit SQLite database. Change only if you need a custom location.">
        <input type="text" className="input input-bordered input-sm w-full font-mono opacity-60"
          value={config.audit.dbPath} onChange={e => updateField('audit', 'dbPath', e.target.value)} />
      </Field>
    </SectionCard>
  );
}

function OutputSection({ config, actions }: { config: ConfigState; actions: FormActions }) {
  const { updateField } = actions;
  return (
    <SectionCard title="Output Defaults" description="Default formatting for CLI output">
      <Field label="Default Output Format" help="Format used when no --format flag is specified">
        <select className="select select-bordered select-sm w-full" value={config.output.defaultFormat}
          onChange={e => updateField('output', 'defaultFormat', e.target.value)}>
          <option value="table">table</option>
          <option value="json">json</option>
          <option value="csv">csv</option>
        </select>
      </Field>
    </SectionCard>
  );
}
