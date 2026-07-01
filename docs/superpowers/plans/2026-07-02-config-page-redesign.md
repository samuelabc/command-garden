# Config Page Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the Config page from a generic YAML-field editor into a task-oriented settings page with validation, connector security management, raw YAML editor, and sticky save bar. Add approval badges/actions to the Connectors page.

**Architecture:** The app server enriches `/api/connectors` responses with security flags by cross-referencing the daemon's config. The Config page fetches both config and connectors in parallel. The Connectors page fetches config on mount for the write path. No new API endpoints; no daemon changes.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, DaisyUI, Fastify, Vitest

## Global Constraints

- No new npm dependencies
- DaisyUI component classes for all UI elements (badges, inputs, buttons, toggles)
- All config writes use existing `POST /api/config` with `{key, value}` — one call per changed key
- The `yaml` package is already in `app/package.json` for YAML parsing in the raw editor
- Tests use Vitest with the existing mock pattern in `routes.test.ts`
- Follow existing code style: functional components, `useCallback` for handlers, `api.*` client methods

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `app/src/server/routes/connectors.ts` | Modify | Add security flag enrichment (`isHighRisk`, `isApproved`, `isAutoApproved`) |
| `app/src/server/routes/routes.test.ts` | Modify | Add test for connector security enrichment |
| `app/src/client/api.ts` | Modify | Add 3 fields to `Connector` interface |
| `app/src/client/pages/Config.tsx` | Rewrite | Task-oriented sections, connector security table, raw YAML editor, sticky save bar |
| `app/src/client/pages/Connectors.tsx` | Modify | Add approval badges and inline "Approve" action |

---

### Task 1: Connector Security Enrichment (Server + API Interface)

**Files:**
- Modify: `app/src/server/routes/connectors.ts:9-18`
- Modify: `app/src/server/routes/routes.test.ts:41-56`
- Modify: `app/src/client/api.ts:30-38`

**Interfaces:**
- Consumes: `DaemonClient.get('/api/config')` returning `{ ok: boolean; config: { security?: { highRiskCapabilities?: string[]; approvedHighRisk?: string[]; autoApproveConnectors?: string[] } } }`
- Produces: Each connector in `/api/connectors` response gains `isHighRisk: boolean`, `isApproved: boolean`, `isAutoApproved: boolean`

- [ ] **Step 1: Write the failing test for connector security enrichment**

Add to `app/src/server/routes/routes.test.ts` inside the `GET /api/connectors` describe block:

```typescript
    it('enriches connectors with security flags from config', async () => {
      (daemon.get as ReturnType<typeof vi.fn>)
        .mockImplementation((path: string) => {
          if (path === '/api/connectors') {
            return Promise.resolve({
              ok: true,
              connectors: [
                { key: 'timetracking/report', description: 'test', access: 'read', domains: [], capabilities: ['navigate', 'js_evaluate'] },
                { key: 'safe/connector', description: 'safe', access: 'read', domains: [], capabilities: ['navigate'] },
              ],
            });
          }
          if (path === '/api/config') {
            return Promise.resolve({
              ok: true,
              config: {
                security: {
                  highRiskCapabilities: ['js_evaluate', 'cookie_write'],
                  approvedHighRisk: ['timetracking/report'],
                  autoApproveConnectors: ['timetracking/report'],
                },
              },
            });
          }
          return Promise.resolve({ ok: true });
        });
      const resp = await app.inject({ method: 'GET', url: '/api/connectors' });
      const body = JSON.parse(resp.payload);
      expect(body.connectors[0].isHighRisk).toBe(true);
      expect(body.connectors[0].isApproved).toBe(true);
      expect(body.connectors[0].isAutoApproved).toBe(true);
      expect(body.connectors[1].isHighRisk).toBe(false);
      expect(body.connectors[1].isApproved).toBe(false);
      expect(body.connectors[1].isAutoApproved).toBe(false);
    });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -w app -- --reporter=verbose 2>&1 | head -40`

Expected: FAIL — `isHighRisk` is `undefined`

- [ ] **Step 3: Update the existing connectors test to mock both daemon calls**

The existing test at line 42–55 uses `mockResolvedValueOnce` for a single `daemon.get` call, but now the route calls `daemon.get` twice (connectors + config). Update it:

```typescript
    it('proxies and enriches connector list', async () => {
      (daemon.get as ReturnType<typeof vi.fn>)
        .mockImplementation((path: string) => {
          if (path === '/api/connectors') {
            return Promise.resolve({
              ok: true,
              connectors: [
                { key: 'timetracking/report', description: 'test', access: 'read', domains: [], capabilities: [] },
              ],
            });
          }
          if (path === '/api/config') {
            return Promise.resolve({
              ok: true,
              config: { security: { highRiskCapabilities: ['js_evaluate', 'cookie_write'], approvedHighRisk: [], autoApproveConnectors: [] } },
            });
          }
          return Promise.resolve({ ok: true });
        });
      const resp = await app.inject({ method: 'GET', url: '/api/connectors' });
      expect(resp.statusCode).toBe(200);
      const body = JSON.parse(resp.payload);
      expect(body.connectors).toHaveLength(1);
      expect(body.connectors[0].hasAppPage).toBe(true);
      expect(body.connectors[0].appRoute).toBe('/apps/timetracking');
    });
```

- [ ] **Step 4: Implement connector security enrichment in the server route**

Replace the `app.get('/api/connectors', ...)` handler in `app/src/server/routes/connectors.ts`:

```typescript
export function connectorRoutes(app: FastifyInstance, daemon: DaemonClient): void {
  app.get('/api/connectors', async () => {
    const [connectorData, configData] = await Promise.all([
      daemon.get<{ ok: boolean; connectors: Record<string, unknown>[] }>('/api/connectors'),
      daemon.get<{ ok: boolean; config: Record<string, Record<string, unknown>> }>('/api/config'),
    ]);

    const security = (configData.config?.security ?? {}) as Record<string, unknown>;
    const highRiskCaps = new Set((security.highRiskCapabilities as string[] | undefined) ?? ['js_evaluate', 'cookie_write']);
    const approvedHighRisk = new Set((security.approvedHighRisk as string[] | undefined) ?? []);
    const autoApproveConnectors = new Set((security.autoApproveConnectors as string[] | undefined) ?? []);

    const enriched = connectorData.connectors.map((c: Record<string, unknown>) => {
      const key = c.key as string;
      const capabilities = (c.capabilities as string[]) ?? [];
      return {
        ...c,
        hasAppPage: key in APP_ROUTES,
        appRoute: APP_ROUTES[key] ?? null,
        isHighRisk: capabilities.some(cap => highRiskCaps.has(cap)),
        isApproved: approvedHighRisk.has(key),
        isAutoApproved: autoApproveConnectors.has(key),
      };
    });
    return { ok: true, connectors: enriched };
  });

  app.get('/api/connectors/:site/:name', async (req) => {
    const { site, name } = req.params as { site: string; name: string };
    return daemon.get(`/api/connectors/${site}/${name}`);
  });
}
```

- [ ] **Step 5: Update the Connector interface in api.ts**

Add the three new fields to the `Connector` interface in `app/src/client/api.ts`:

```typescript
export interface Connector {
  key: string;
  description: string;
  access: string;
  domains: string[];
  capabilities: string[];
  hasAppPage: boolean;
  appRoute: string | null;
  isHighRisk: boolean;
  isApproved: boolean;
  isAutoApproved: boolean;
}
```

- [ ] **Step 6: Run all tests to verify everything passes**

Run: `npm test -w app -- --reporter=verbose 2>&1 | head -60`

Expected: All tests PASS including both connector enrichment tests

- [ ] **Step 7: Commit**

```bash
git add app/src/server/routes/connectors.ts app/src/server/routes/routes.test.ts app/src/client/api.ts
git commit -m "feat(app): enrich connectors with security flags from config"
```

---

### Task 2: Config Page Rewrite

**Files:**
- Rewrite: `app/src/client/pages/Config.tsx`

**Interfaces:**
- Consumes: `api.getConfig()` returning `{ ok, config }`, `api.getConnectors()` returning `{ ok, connectors: Connector[] }`, `api.setConfig(key, value)` for saves
- Produces: Fully functional Config page with 5 sections, raw YAML editor, sticky save bar

This is the largest task. The file is a full rewrite (current: 140 lines, new: ~400 lines). The steps below break the implementation into logical chunks but all go into the same file.

- [ ] **Step 1: Write the Config page shell with data loading and state management**

Replace `app/src/client/pages/Config.tsx` entirely. Start with the state setup, data loading, dirty tracking, and save/discard logic:

```tsx
import { useEffect, useState, useCallback, useMemo } from 'react';
import { stringify as stringifyYaml, parse as parseYaml } from 'yaml';
import { api, type Connector } from '../api';
import { Spinner } from '../components/Spinner';

const RESTART_REQUIRED_KEYS = new Set(['daemon.host', 'daemon.port', 'app.port']);

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
      highRiskCapabilities: (s.highRiskCapabilities as string[]) ?? ['js_evaluate', 'cookie_write'],
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
      .catch(() => {})
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

  // Helper to update a single field in edited state
  const set = useCallback(<S extends keyof ConfigState>(section: S, key: keyof ConfigState[S], value: ConfigState[S][typeof key]) => {
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

  if (loading) return <Spinner label="Loading configuration..." />;

  if (!edited || !saved) {
    return (
      <div className="max-w-3xl">
        <h2 className="text-2xl font-bold mb-6">Configuration</h2>
        <div className="bg-base-200 rounded-lg p-6 text-center">
          <p className="text-sm opacity-60 mb-2">No configuration found.</p>
          <p className="text-xs opacity-40">Make sure the daemon is running. Configuration will appear here automatically.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl pb-20">
      <h2 className="text-2xl font-bold mb-6">Configuration</h2>

      {restartBanner && (
        <div className="alert alert-warning mb-6">
          <span>Some changes require a daemon restart to take effect. Restart with: <code className="font-mono text-sm">cg down && cg up</code></span>
          <button className="btn btn-sm btn-ghost" onClick={() => setRestartBanner(false)}>Dismiss</button>
        </div>
      )}

      <div className="space-y-6">
        <ServerSection config={edited} set={set} />
        <ConnectorSecuritySection config={edited} connectors={connectors} set={set} addToArray={addToArray} removeFromArray={removeFromArray} />
        <ConnectorSourcesSection config={edited} addToArray={addToArray} removeFromArray={removeFromArray} />
        <AuditSection config={edited} set={set} />
        <OutputSection config={edited} set={set} />
      </div>

      {/* Raw Config Editor */}
      <div className="mt-6">
        <button className="btn btn-sm btn-ghost gap-1" onClick={handleRawOpen}>
          {rawOpen ? '▾' : '▸'} Raw Configuration (YAML)
        </button>
        {rawOpen && (
          <div className="mt-2 bg-base-200 rounded-lg p-4">
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
        <div className="fixed bottom-0 left-60 right-0 bg-base-200 border-t border-base-300 px-6 py-3 flex items-center justify-between z-50">
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
```

- [ ] **Step 2: Write the Server section component**

Append to the same file, below the `Config` component:

```tsx
function SectionCard({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="bg-base-200 rounded-lg p-5">
      <h3 className="font-semibold mb-1">{title}</h3>
      <p className="text-xs opacity-50 mb-4">{description}</p>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Field({ label, help, restart, children }: { label: string; help: string; restart?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-48 shrink-0 pt-2">
        <label className="text-sm font-medium">{label}</label>
        {restart && (
          <span className="ml-1.5 tooltip tooltip-right" data-tip="Requires daemon restart">
            <span className="text-xs opacity-40">⟳</span>
          </span>
        )}
        <p className="text-xs opacity-40 mt-0.5">{help}</p>
      </div>
      <div className="flex-1">{children}</div>
    </div>
  );
}

function ServerSection({ config, set }: {
  config: ConfigState;
  set: <S extends keyof ConfigState>(section: S, key: keyof ConfigState[S], value: ConfigState[S][keyof ConfigState[S]]) => void;
}) {
  return (
    <SectionCard title="Server" description="Daemon and app server binding configuration">
      <Field label="Daemon Host" help="IP address the daemon binds to" restart>
        <input type="text" className="input input-bordered input-sm w-full" value={config.daemon.host}
          onChange={e => set('daemon', 'host', e.target.value)} />
      </Field>
      <Field label="Daemon Port" help="Port the daemon listens on" restart>
        <input type="number" className="input input-bordered input-sm w-full" min={1024} max={65535}
          value={config.daemon.port} onChange={e => set('daemon', 'port', Number(e.target.value))} />
      </Field>
      <Field label="GUI Port" help="Port the GUI app server listens on" restart>
        <input type="number" className="input input-bordered input-sm w-full" min={1024} max={65535}
          value={config.app.port} onChange={e => set('app', 'port', Number(e.target.value))} />
      </Field>
    </SectionCard>
  );
}
```

- [ ] **Step 3: Write the Connector Security section component**

Append to the same file:

```tsx
function ConnectorSecuritySection({ config, connectors, set, addToArray, removeFromArray }: {
  config: ConfigState;
  connectors: Connector[];
  set: <S extends keyof ConfigState>(section: S, key: keyof ConfigState[S], value: ConfigState[S][keyof ConfigState[S]]) => void;
  addToArray: (section: keyof ConfigState, key: string, value: string) => void;
  removeFromArray: (section: keyof ConfigState, key: string, value: string) => void;
}) {
  const [addCapInput, setAddCapInput] = useState('');
  const [addApprovalInput, setAddApprovalInput] = useState('');

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
                          <span key={cap} className={`badge badge-xs ${highRiskCaps.has(cap) ? 'badge-warning' : ''}`}>{cap}</span>
                        ))}
                      </div>
                    </td>
                    <td>{isHighRisk ? <span className="badge badge-warning badge-xs">High</span> : <span className="opacity-40">—</span>}</td>
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
        <div className="flex flex-wrap gap-1 mb-1">
          {config.security.highRiskCapabilities.map(cap => (
            <span key={cap} className="badge badge-sm gap-1">
              {cap}
              <button className="text-xs opacity-50 hover:opacity-100" onClick={() => removeFromArray('security', 'highRiskCapabilities', cap)}>&times;</button>
            </span>
          ))}
        </div>
        <div className="flex gap-1">
          <input type="text" className="input input-bordered input-xs flex-1" placeholder="Capability name"
            value={addCapInput} onChange={e => setAddCapInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && addCapInput.trim()) { addToArray('security', 'highRiskCapabilities', addCapInput.trim()); setAddCapInput(''); } }} />
          <button className="btn btn-xs btn-ghost" onClick={() => { if (addCapInput.trim()) { addToArray('security', 'highRiskCapabilities', addCapInput.trim()); setAddCapInput(''); } }}>Add</button>
        </div>
      </Field>

      <Field label="Step Approval Required" help="Capabilities that pause for user confirmation at each pipeline step">
        <div className="flex flex-wrap gap-1 mb-1">
          {config.security.approvalRequired.map(cap => (
            <span key={cap} className="badge badge-sm gap-1">
              {cap}
              <button className="text-xs opacity-50 hover:opacity-100" onClick={() => removeFromArray('security', 'approvalRequired', cap)}>&times;</button>
            </span>
          ))}
        </div>
        <div className="flex gap-1">
          <input type="text" className="input input-bordered input-xs flex-1" placeholder="Capability name"
            value={addApprovalInput} onChange={e => setAddApprovalInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && addApprovalInput.trim()) { addToArray('security', 'approvalRequired', addApprovalInput.trim()); setAddApprovalInput(''); } }} />
          <button className="btn btn-xs btn-ghost" onClick={() => { if (addApprovalInput.trim()) { addToArray('security', 'approvalRequired', addApprovalInput.trim()); setAddApprovalInput(''); } }}>Add</button>
        </div>
      </Field>

      <Field label="Approval Timeout (seconds)" help="How long to wait for approval before aborting the pipeline">
        <input type="number" className="input input-bordered input-sm w-full" min={1} max={600}
          value={Math.round(config.security.approvalTimeoutMs / 1000)}
          onChange={e => set('security', 'approvalTimeoutMs', Number(e.target.value) * 1000)} />
      </Field>

      <Field label="Extension ID" help="Chrome extension ID for origin validation. Leave blank to accept any extension.">
        <input type="text" className="input input-bordered input-sm w-full" placeholder="Leave blank for any"
          value={config.security.extensionId} onChange={e => set('security', 'extensionId', e.target.value)} />
      </Field>
    </SectionCard>
  );
}
```

- [ ] **Step 4: Write the remaining section components**

Append to the same file:

```tsx
function ConnectorSourcesSection({ config, addToArray, removeFromArray }: {
  config: ConfigState;
  addToArray: (section: keyof ConfigState, key: string, value: string) => void;
  removeFromArray: (section: keyof ConfigState, key: string, value: string) => void;
}) {
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

function AuditSection({ config, set }: {
  config: ConfigState;
  set: <S extends keyof ConfigState>(section: S, key: keyof ConfigState[S], value: ConfigState[S][keyof ConfigState[S]]) => void;
}) {
  return (
    <SectionCard title="Audit & Retention" description="Audit log storage and cleanup settings">
      <Field label="Retention Period" help="Days to keep audit log entries before cleanup">
        <input type="number" className="input input-bordered input-sm w-full" min={1} max={3650}
          value={config.audit.retentionDays} onChange={e => set('audit', 'retentionDays', Number(e.target.value))} />
      </Field>
      <Field label="Database Path" help="Path to the audit SQLite database. Change only if you need a custom location.">
        <input type="text" className="input input-bordered input-sm w-full font-mono opacity-60"
          value={config.audit.dbPath} onChange={e => set('audit', 'dbPath', e.target.value)} />
      </Field>
    </SectionCard>
  );
}

function OutputSection({ config, set }: {
  config: ConfigState;
  set: <S extends keyof ConfigState>(section: S, key: keyof ConfigState[S], value: ConfigState[S][keyof ConfigState[S]]) => void;
}) {
  return (
    <SectionCard title="Output Defaults" description="Default formatting for CLI output">
      <Field label="Default Output Format" help="Format used when no --format flag is specified">
        <select className="select select-bordered select-sm w-full" value={config.output.defaultFormat}
          onChange={e => set('output', 'defaultFormat', e.target.value)}>
          <option value="table">table</option>
          <option value="json">json</option>
          <option value="csv">csv</option>
        </select>
      </Field>
    </SectionCard>
  );
}
```

- [ ] **Step 5: Verify the Config page builds without TypeScript errors**

Run: `npx tsc --noEmit -p app/tsconfig.json 2>&1 | head -20`

Expected: No errors (or only pre-existing ones unrelated to Config.tsx)

- [ ] **Step 6: Manual smoke test**

Start the dev server: `cd app && npm run dev`

Open `http://127.0.0.1:5173/config`. Verify:
- Five section cards render with labels and descriptions
- Connector security table shows loaded connectors with toggles
- Tag chips render for array fields with working add/remove
- Sticky save bar appears when any field is edited
- Discard resets all fields
- Save persists changes (check with `cg config show`)
- Raw YAML editor expands, shows current state, "Apply to form" works
- Restart banner appears after saving port/host changes

- [ ] **Step 7: Commit**

```bash
git add app/src/client/pages/Config.tsx
git commit -m "feat(app): redesign Config page with task-oriented sections, validation, and raw YAML editor"
```

---

### Task 3: Connectors Page Approval Badges & Actions

**Files:**
- Modify: `app/src/client/pages/Connectors.tsx`

**Interfaces:**
- Consumes: `Connector.isHighRisk`, `Connector.isApproved` from Task 1 enrichment; `api.getConfig()` and `api.setConfig()` for the approve action
- Produces: Connectors page with approval status badges and inline "Approve" button

- [ ] **Step 1: Add config state and approve handler to Connectors page**

Update `app/src/client/pages/Connectors.tsx`. Add state for the config's `approvedHighRisk` array and an approve handler:

```tsx
import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api, type Connector } from '../api';
import { Spinner } from '../components/Spinner';

export default function Connectors() {
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [approvedHighRisk, setApprovedHighRisk] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [approvingKey, setApprovingKey] = useState<string | null>(null);

  const load = useCallback(() => {
    Promise.all([api.getConnectors(), api.getConfig()])
      .then(([connRes, configRes]) => {
        setConnectors(connRes.connectors);
        const security = (configRes.config.security ?? {}) as Record<string, unknown>;
        setApprovedHighRisk((security.approvedHighRisk as string[]) ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleApprove = useCallback(async (connectorKey: string) => {
    setApprovingKey(connectorKey);
    try {
      const updated = [...approvedHighRisk, connectorKey];
      await api.setConfig('security.approvedHighRisk', JSON.stringify(updated));
      load();
    } catch {
      // error is shown via connector state not updating
    } finally {
      setApprovingKey(null);
    }
  }, [approvedHighRisk, load]);

  if (loading) return <Spinner label="Loading connectors..." />;

  return (
    <div className="max-w-4xl">
      <h2 className="text-2xl font-bold mb-6">Connectors</h2>
      {connectors.length === 0 ? (
        <div className="bg-base-200 rounded-lg p-6 text-center">
          <p className="text-sm opacity-60 mb-1">No connectors loaded</p>
          <p className="text-xs opacity-40">Check the daemon is running and connectors are installed in ~/.commandgarden/connectors/</p>
        </div>
      ) : (
        <div className="space-y-3">
          {connectors.map((c) => {
            const [site, name] = c.key.split('/');
            return (
              <div key={c.key} className="bg-base-200 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="font-mono font-semibold">{c.key}</span>
                    <span className="badge badge-sm">{c.access}</span>
                    {c.capabilities.map((cap) => (
                      <span key={cap} className="badge badge-warning badge-sm">{cap}</span>
                    ))}
                    {c.isHighRisk && c.isApproved && (
                      <span className="badge badge-success badge-sm badge-outline">Approved</span>
                    )}
                    {c.isHighRisk && !c.isApproved && (
                      <span className="badge badge-warning badge-sm">Blocked — requires approval</span>
                    )}
                  </div>
                  <p className="text-sm opacity-60 mt-1">{c.description}</p>
                  {c.domains.length > 0 && (
                    <div className="text-xs opacity-40 mt-1">Domains: {c.domains.join(', ')}</div>
                  )}
                </div>
                <div className="flex gap-2 ml-4 shrink-0">
                  {c.isHighRisk && !c.isApproved && (
                    <button
                      className="btn btn-sm btn-warning btn-outline"
                      disabled={approvingKey === c.key}
                      onClick={() => handleApprove(c.key)}
                    >
                      {approvingKey === c.key ? 'Approving...' : 'Approve'}
                    </button>
                  )}
                  {c.hasAppPage && c.appRoute && (
                    <Link to={c.appRoute} className="btn btn-sm btn-primary">Open App</Link>
                  )}
                  <Link to={`/connectors/${site}/${name}`} className="btn btn-sm btn-ghost">Run</Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Manual smoke test**

With the dev server running, open `http://127.0.0.1:5173/connectors`. Verify:
- High-risk connectors show "Blocked — requires approval" (amber) or "Approved" (green) badge
- Non-high-risk connectors show no extra badge
- "Approve" button appears for blocked connectors, saves immediately, and badge updates to "Approved"
- Existing "Open App" and "Run" buttons still work

- [ ] **Step 3: Commit**

```bash
git add app/src/client/pages/Connectors.tsx
git commit -m "feat(app): add approval badges and inline approve action to Connectors page"
```
