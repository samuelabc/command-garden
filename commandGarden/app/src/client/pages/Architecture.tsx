import { Badge } from '../components/Badge';

const LAYERS = [
  {
    name: 'CLI Client',
    tech: 'Node.js / Commander.js',
    port: null,
    desc: 'Terminal interface. Sends commands to the Daemon over HTTP, formats output as table / JSON / CSV.',
    pkg: '@commandgarden/cli',
  },
  {
    name: 'GUI',
    tech: 'React SPA / Vite / Tailwind / DaisyUI',
    port: null,
    desc: 'Browser-based interface. Talks to the App Server — never to the Daemon directly.',
    pkg: null,
  },
  {
    name: 'App Server',
    tech: 'Fastify / SQLite',
    port: '9092',
    desc: 'GUI backend. Proxies Daemon calls, enriches responses, and owns app-specific state (preferences, cached reports, goals).',
    pkg: '@commandgarden/app',
  },
  {
    name: 'Daemon',
    tech: 'Fastify / WebSocket / SQLite',
    port: '9091',
    desc: 'Core service. Validates auth and capabilities, loads connectors, relays pipelines to the Chrome Extension, writes audit log.',
    pkg: '@commandgarden/daemon',
  },
  {
    name: 'Chrome Extension',
    tech: 'MV3 / TypeScript / Service Worker',
    port: null,
    desc: 'Runs connector pipelines inside browser tabs via content scripts and CDP. Connects to the Daemon via WebSocket.',
    pkg: null,
  },
];

const DATA_STORES = [
  { name: 'Audit Log', tech: 'SQLite', path: '~/.commandgarden/audit.db', desc: 'Every command execution, denial, auth failure, and config change.' },
  { name: 'App DB', tech: 'SQLite', path: '~/.commandgarden/app.db', desc: 'Preferences, cached reports, goals, and saved views.' },
  { name: 'Config', tech: 'YAML', path: '~/.commandgarden/config.yaml', desc: 'Daemon + security + connector + audit settings.' },
  { name: 'Session Token', tech: 'File', path: '~/.commandgarden/session-token', desc: 'Bearer token generated on daemon start. CLI and App Server read it for auth.' },
];

interface Lane { id: string; label: string; color: string }
interface ArrowStep { type: 'arrow'; from: string; to: string; label: string }
interface ActionStep { type: 'action'; lane: string; label: string }
type FlowStep = ArrowStep | ActionStep;
interface FlowDef { title: string; lanes: Lane[]; steps: FlowStep[] }

const LANE_HEADER: Record<string, string> = {
  client: 'border-sky-500/50 bg-sky-500/10 text-sky-700 dark:text-sky-400',
  daemon: 'border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400',
  extension: 'border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  browser: 'border-violet-500/50 bg-violet-500/10 text-violet-700 dark:text-violet-400',
};

const LANE_LINE: Record<string, string> = {
  client: 'bg-sky-400/20',
  daemon: 'bg-amber-400/20',
  extension: 'bg-emerald-400/20',
  browser: 'bg-violet-400/20',
};

const FLOWS: FlowDef[] = [
  {
    title: 'Command execution',
    lanes: [
      { id: 'client', label: 'CLI / GUI', color: 'client' },
      { id: 'daemon', label: 'Daemon', color: 'daemon' },
      { id: 'ext', label: 'Extension', color: 'extension' },
      { id: 'browser', label: 'Browser Tab', color: 'browser' },
    ],
    steps: [
      { type: 'arrow', from: 'client', to: 'daemon', label: 'POST /api/run' },
      { type: 'action', lane: 'daemon', label: 'validate auth + CSRF' },
      { type: 'action', lane: 'daemon', label: 'check connector & capabilities' },
      { type: 'action', lane: 'daemon', label: 'audit: command.start' },
      { type: 'action', lane: 'daemon', label: 'split pipeline' },
      { type: 'arrow', from: 'daemon', to: 'ext', label: 'relay steps (WS)' },
      { type: 'arrow', from: 'ext', to: 'browser', label: 'run pipeline' },
      { type: 'arrow', from: 'browser', to: 'ext', label: 'page data' },
      { type: 'arrow', from: 'ext', to: 'daemon', label: 'results (WS)' },
      { type: 'action', lane: 'daemon', label: 'server-side steps' },
      { type: 'action', lane: 'daemon', label: 'audit: success / error' },
      { type: 'arrow', from: 'daemon', to: 'client', label: 'structured data' },
    ],
  },
  {
    title: 'Step approval flow',
    lanes: [
      { id: 'client', label: 'CLI / GUI', color: 'client' },
      { id: 'daemon', label: 'Daemon', color: 'daemon' },
      { id: 'ext', label: 'Extension', color: 'extension' },
    ],
    steps: [
      { type: 'action', lane: 'daemon', label: 'detect approval-required step' },
      { type: 'arrow', from: 'daemon', to: 'client', label: 'HTTP 202 + requestId' },
      { type: 'arrow', from: 'daemon', to: 'client', label: 'prompt (SSE)' },
      { type: 'arrow', from: 'daemon', to: 'ext', label: 'notification' },
      { type: 'arrow', from: 'client', to: 'daemon', label: 'first responder resolves' },
      { type: 'action', lane: 'daemon', label: 'continue or abort pipeline' },
      { type: 'action', lane: 'daemon', label: 'audit: granted / rejected' },
    ],
  },
  {
    title: 'Extension connection',
    lanes: [
      { id: 'ext', label: 'Extension', color: 'extension' },
      { id: 'daemon', label: 'Daemon', color: 'daemon' },
    ],
    steps: [
      { type: 'arrow', from: 'ext', to: 'daemon', label: 'WS connect :9091' },
      { type: 'action', lane: 'daemon', label: 'validate origin' },
      { type: 'action', lane: 'daemon', label: 'attach WS relay' },
      { type: 'action', lane: 'ext', label: 'ready for commands' },
      { type: 'arrow', from: 'ext', to: 'daemon', label: 'heartbeat' },
    ],
  },
];

function SwimlaneDiagram({ flow }: { flow: FlowDef }) {
  const { lanes, steps, title } = flow;
  const n = lanes.length;
  const colTpl = `repeat(${n}, 1fr)`;

  return (
    <div className="border border-base-300 p-4 overflow-x-auto">
      <h4 className="font-semibold text-sm mb-3">{title}</h4>
      <div style={{ minWidth: n * 130 }}>
        {/* Lane headers */}
        <div className="grid" style={{ gridTemplateColumns: colTpl }}>
          {lanes.map((l) => (
            <div key={l.id} className="flex justify-center">
              <span className={`px-2 py-1 text-[0.65rem] font-mono font-semibold border ${LANE_HEADER[l.color]}`}>
                {l.label}
              </span>
            </div>
          ))}
        </div>

        {/* Diagram body */}
        <div className="relative py-1">
          {/* Vertical lane lines */}
          <div className="absolute inset-0 grid pointer-events-none" style={{ gridTemplateColumns: colTpl }}>
            {lanes.map((l) => (
              <div key={l.id} className="flex justify-center">
                <div className={`w-0.5 h-full ${LANE_LINE[l.color]}`} />
              </div>
            ))}
          </div>

          {/* Steps */}
          <div className="relative">
            {steps.map((step, i) => {
              if (step.type === 'action') {
                const laneIdx = lanes.findIndex((l) => l.id === step.lane);
                const center = ((laneIdx + 0.5) / n) * 100;
                return (
                  <div key={i} className="relative" style={{ height: 26 }}>
                    <div
                      className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 z-10"
                      style={{ left: `${center}%` }}
                    >
                      <span className="block px-2 py-0.5 text-[0.6rem] font-mono bg-base-200/90 border border-base-300/60 text-base-content/60 whitespace-nowrap">
                        {step.label}
                      </span>
                    </div>
                  </div>
                );
              }

              const fromIdx = lanes.findIndex((l) => l.id === step.from);
              const toIdx = lanes.findIndex((l) => l.id === step.to);
              const fromCenter = ((fromIdx + 0.5) / n) * 100;
              const toCenter = ((toIdx + 0.5) / n) * 100;
              const leftPct = Math.min(fromCenter, toCenter);
              const widthPct = Math.abs(toCenter - fromCenter);
              const goesRight = fromIdx < toIdx;

              return (
                <div key={i} className="relative" style={{ height: 30 }}>
                  {/* Line */}
                  <div
                    className="absolute top-1/2 h-px bg-base-content/20"
                    style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                  />
                  {/* Source dot */}
                  <div
                    className="absolute top-1/2 w-1.5 h-1.5 rounded-full bg-base-content/30 -translate-x-1/2 -translate-y-1/2"
                    style={{ left: `${fromCenter}%` }}
                  />
                  {/* Arrowhead */}
                  <div
                    className="absolute top-1/2 -translate-y-1/2 text-[0.55rem] leading-none text-base-content/40"
                    style={{
                      left: `${toCenter}%`,
                      transform: `translate(${goesRight ? '-100%' : '0'}, -50%)`,
                    }}
                  >
                    {goesRight ? '▸' : '◂'}
                  </div>
                  {/* Label */}
                  <div
                    className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 z-10"
                    style={{ left: `${(fromCenter + toCenter) / 2}%` }}
                  >
                    <span className="px-1.5 py-px text-[0.6rem] font-mono bg-base-100 text-base-content/60 whitespace-nowrap">
                      {step.label}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

const WORKSPACE_PACKAGES = [
  { name: 'shared', desc: 'Connector schema (Zod), protocol messages, audit events, expression parser, pipeline definitions', published: false },
  { name: 'daemon', desc: 'HTTP + WebSocket server, auth, connector registry, capability validation, audit store, WebSocket relay', published: false },
  { name: 'cli', desc: 'CLI client (Commander.js) — run, list, inspect, validate, daemon/gui management, audit queries, config', published: true },
  { name: 'chrome', desc: 'Chrome MV3 extension — service worker, content scripts, domain guard, pipeline step execution engine', published: false },
  { name: 'app', desc: 'Web GUI — Fastify app server + React SPA (Vite, Tailwind, DaisyUI)', published: false },
  { name: 'connectors', desc: 'Built-in YAML connector definitions', published: false },
];

export default function Architecture() {
  return (
    <div className="max-w-4xl mx-auto">
      <h2 className="font-display text-xl font-bold uppercase tracking-[0.06em] mb-1">Architecture</h2>
      <p className="text-sm opacity-60 mb-6">How commandGarden's components fit together.</p>

      {/* ASCII diagram */}
      <div className="border border-base-300 bg-base-200/30 p-4 mb-8 overflow-x-auto">
        <pre className="font-mono text-xs leading-relaxed whitespace-pre opacity-80">{`┌──────────────┐       HTTP        ┌──────────────┐     WebSocket     ┌────────────────────┐
│  CLI Client  │ ────────────────→ │    Daemon    │ ←───────────────→ │  Chrome Extension  │
│  (Node.js)   │  localhost:9091   │  (Fastify)   │                   │  (MV3, TypeScript) │
└──────────────┘                   └──────────────┘                   └────────────────────┘
                                     ↑         │                         │            │
                                     │         │               Content   │    CDP     │
┌──────────────┐   ┌──────────────┐  │         │               Scripts   │  (debugger)│
│  GUI (React) │──→│  App Server  │──┘         │                         ↓            ↓
│  SPA         │   │  (Fastify)   │            │               ┌────────────────────────┐
└──────────────┘   │  :9092       │            │               │      Browser Tab       │
                   └──────────────┘            │               │  (target web page)     │
                          │                    │               └────────────────────────┘
                   ┌──────────────┐    ┌──────────────┐
                   │   App DB     │    │  Audit Log   │
                   │   (SQLite)   │    │  (SQLite)    │
                   └──────────────┘    └──────────────┘`}</pre>
      </div>

      {/* Components */}
      <h3 className="font-display text-base font-semibold mb-3">Components</h3>
      <div className="space-y-2 mb-8">
        {LAYERS.map((l) => (
          <div key={l.name} className="border border-base-300 p-4">
            <div className="flex items-center gap-3 flex-wrap mb-1">
              <span className="font-semibold">{l.name}</span>
              <Badge size="xs">{l.tech}</Badge>
              {l.port && <Badge variant="info" size="xs">:{l.port}</Badge>}
              {l.pkg && <Badge variant="secondary" size="xs">{l.pkg}</Badge>}
            </div>
            <p className="text-sm opacity-60">{l.desc}</p>
          </div>
        ))}
      </div>

      {/* Data stores */}
      <h3 className="font-display text-base font-semibold mb-3">Data Stores</h3>
      <div className="overflow-x-auto border border-base-300 mb-8">
        <table className="table table-sm w-full">
          <thead>
            <tr className="bg-base-200">
              <th>Store</th>
              <th>Format</th>
              <th>Path</th>
              <th>Purpose</th>
            </tr>
          </thead>
          <tbody>
            {DATA_STORES.map((s) => (
              <tr key={s.name} className="hover:bg-base-200">
                <td className="font-semibold text-sm">{s.name}</td>
                <td><Badge size="xs">{s.tech}</Badge></td>
                <td className="font-mono text-xs opacity-60">{s.path}</td>
                <td className="text-sm opacity-60">{s.desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Data flows */}
      <h3 className="font-display text-base font-semibold mb-3">Data Flows</h3>
      <div className="space-y-4 mb-8">
        {FLOWS.map((f) => (
          <SwimlaneDiagram key={f.title} flow={f} />
        ))}
      </div>

      {/* Security model */}
      <h3 className="font-display text-base font-semibold mb-3">Security Model</h3>
      <div className="border border-base-300 p-4 mb-8">
        <ul className="space-y-2">
          <li className="text-sm opacity-70"><span className="font-semibold opacity-100">Session token</span> — generated on daemon start, stored at ~/.commandgarden/session-token. Every API call (except /api/status) requires Bearer auth + X-CommandGarden CSRF header.</li>
          <li className="text-sm opacity-70"><span className="font-semibold opacity-100">Domain guard</span> — connector YAML declares allowed domains. Extension refuses to run on undeclared domains.</li>
          <li className="text-sm opacity-70"><span className="font-semibold opacity-100">Capability gating</span> — each pipeline step requires a declared capability. High-risk capabilities (js_evaluate, cookie_write) require explicit approval.</li>
          <li className="text-sm opacity-70"><span className="font-semibold opacity-100">Audit-or-fail</span> — if the audit store is unavailable, commands are blocked.</li>
          <li className="text-sm opacity-70"><span className="font-semibold opacity-100">No credentials stored</span> — commandGarden reuses existing Chrome sessions. No passwords or cookies are persisted.</li>
          <li className="text-sm opacity-70"><span className="font-semibold opacity-100">Localhost only</span> — daemon and app server bind to 127.0.0.1 by default.</li>
        </ul>
      </div>

      {/* Workspace packages */}
      <h3 className="font-display text-base font-semibold mb-3">Workspace Packages</h3>
      <div className="overflow-x-auto border border-base-300 mb-8">
        <table className="table table-sm w-full">
          <thead>
            <tr className="bg-base-200">
              <th>Package</th>
              <th>Description</th>
              <th>Published</th>
            </tr>
          </thead>
          <tbody>
            {WORKSPACE_PACKAGES.map((p) => (
              <tr key={p.name} className="hover:bg-base-200">
                <td className="font-mono text-sm font-semibold">{p.name}</td>
                <td className="text-sm opacity-60">{p.desc}</td>
                <td>
                  {p.published
                    ? <Badge variant="success" size="xs">npm</Badge>
                    : <Badge size="xs">bundled</Badge>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Build order */}
      <h3 className="font-display text-base font-semibold mb-3">Build Order</h3>
      <div className="border border-base-300 p-4">
        <div className="flex flex-wrap items-center gap-2 font-mono text-sm">
          {['shared', 'daemon', 'cli', 'chrome', 'app'].map((pkg, i) => (
            <span key={pkg} className="flex items-center gap-2">
              <span className="px-2 py-1 border border-base-300 bg-base-200">{pkg}</span>
              {i < 4 && <span className="opacity-40">→</span>}
            </span>
          ))}
        </div>
        <p className="text-sm opacity-60 mt-2">Run <code className="font-mono text-xs bg-base-200 px-1 py-0.5">npm run build</code> from the commandGarden root to build all packages in dependency order.</p>
      </div>
    </div>
  );
}
