import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Badge } from '../components/Badge';
import { SwimlaneDiagram, type FlowDef } from '../components/SwimlaneDiagram';

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

const FLOWS: FlowDef[] = [
  {
    title: 'Command execution (CLI path)',
    lanes: [
      { id: 'cli', label: 'CLI', color: 'client' },
      { id: 'daemon', label: 'Daemon :9091', color: 'daemon' },
      { id: 'ext', label: 'Extension', color: 'extension' },
      { id: 'browser', label: 'Browser Tab', color: 'browser' },
    ],
    steps: [
      { type: 'arrow', from: 'cli', to: 'daemon', label: 'POST /api/run (HTTP)' },
      { type: 'action', lane: 'daemon', label: 'validate token + CSRF' },
      { type: 'action', lane: 'daemon', label: 'check connector, domains, capabilities' },
      { type: 'action', lane: 'daemon', label: 'audit: command.start' },
      { type: 'action', lane: 'daemon', label: 'split pipeline (extension vs daemon steps)' },
      { type: 'arrow', from: 'daemon', to: 'ext', label: 'relay extension steps (WS)' },
      { type: 'arrow', from: 'ext', to: 'browser', label: 'execute pipeline steps' },
      { type: 'arrow', from: 'browser', to: 'ext', label: 'page data' },
      { type: 'arrow', from: 'ext', to: 'daemon', label: 'results (WS)' },
      { type: 'action', lane: 'daemon', label: 'run daemon-side steps (transform, map)' },
      { type: 'action', lane: 'daemon', label: 'audit: command.success / error' },
      { type: 'arrow', from: 'daemon', to: 'cli', label: 'structured data response' },
    ],
  },
  {
    title: 'Command execution (GUI path)',
    lanes: [
      { id: 'gui', label: 'GUI', color: 'client' },
      { id: 'app', label: 'App Server :9092', color: 'daemon' },
      { id: 'daemon', label: 'Daemon :9091', color: 'daemon' },
    ],
    steps: [
      { type: 'arrow', from: 'gui', to: 'app', label: 'POST /api/run (HTTP)' },
      { type: 'arrow', from: 'app', to: 'daemon', label: 'proxy to daemon (HTTP)' },
      { type: 'action', lane: 'daemon', label: 'validate, execute, audit (same as CLI path)' },
      { type: 'arrow', from: 'daemon', to: 'app', label: 'structured data' },
      { type: 'arrow', from: 'app', to: 'gui', label: 'enriched response' },
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
      { type: 'action', lane: 'daemon', label: 'detect approval-required capability' },
      { type: 'arrow', from: 'daemon', to: 'client', label: 'HTTP 202 + requestId' },
      { type: 'arrow', from: 'daemon', to: 'client', label: 'approval prompt (SSE)' },
      { type: 'arrow', from: 'daemon', to: 'ext', label: 'approval notification (WS)' },
      { type: 'arrow', from: 'client', to: 'daemon', label: 'POST /api/approval' },
      { type: 'arrow', from: 'ext', to: 'daemon', label: 'resolve via WS' },
      { type: 'action', lane: 'daemon', label: 'first responder wins → continue or abort' },
      { type: 'action', lane: 'daemon', label: 'audit: approval.granted / rejected' },
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

      {/* Architecture diagram */}
      <div id="arch-diagram" className="border border-base-300 p-5 mb-8 overflow-x-auto scroll-mt-4">
        <svg viewBox="0 0 780 300" className="w-full text-base-content" style={{ minWidth: 620 }}>
          <defs>
            <marker id="arch-ah" viewBox="0 0 10 8" refX="10" refY="4" markerWidth="7" markerHeight="5" orient="auto">
              <path d="M0 0L10 4L0 8z" fill="currentColor" fillOpacity={0.5} />
            </marker>
            <marker id="arch-ah-rev" viewBox="0 0 10 8" refX="0" refY="4" markerWidth="7" markerHeight="5" orient="auto">
              <path d="M10 0L0 4L10 8z" fill="currentColor" fillOpacity={0.5} />
            </marker>
          </defs>

          {/* ── CLI Client ── */}
          <rect x={15} y={8} width={120} height={50} rx={3}
            fill="rgba(56,189,248,0.15)" stroke="rgba(56,189,248,0.6)" strokeWidth={1} />
          <text x={75} y={29} textAnchor="middle" fill="currentColor" fontSize={11} fontWeight={600}>CLI Client</text>
          <text x={75} y={44} textAnchor="middle" fill="currentColor" fontSize={9} opacity={0.6}
            fontFamily="ui-monospace,monospace">Node.js</text>

          {/* ── GUI ── */}
          <rect x={15} y={120} width={120} height={50} rx={3}
            fill="rgba(56,189,248,0.15)" stroke="rgba(56,189,248,0.6)" strokeWidth={1} />
          <text x={75} y={141} textAnchor="middle" fill="currentColor" fontSize={11} fontWeight={600}>GUI</text>
          <text x={75} y={156} textAnchor="middle" fill="currentColor" fontSize={9} opacity={0.6}
            fontFamily="ui-monospace,monospace">React SPA</text>

          {/* ── App Server ── */}
          <rect x={190} y={120} width={145} height={50} rx={3}
            fill="rgba(251,191,36,0.15)" stroke="rgba(251,191,36,0.6)" strokeWidth={1} />
          <text x={262} y={141} textAnchor="middle" fill="currentColor" fontSize={11} fontWeight={600}>App Server</text>
          <text x={262} y={156} textAnchor="middle" fill="currentColor" fontSize={9} opacity={0.6}
            fontFamily="ui-monospace,monospace">Fastify :9092</text>

          {/* ── Daemon (hub, larger) ── */}
          <rect x={395} y={10} width={160} height={84} rx={3}
            fill="rgba(251,191,36,0.15)" stroke="rgba(251,191,36,0.7)" strokeWidth={1.5} />
          <text x={475} y={38} textAnchor="middle" fill="currentColor" fontSize={13} fontWeight={700}>Daemon</text>
          <text x={475} y={56} textAnchor="middle" fill="currentColor" fontSize={9} opacity={0.6}
            fontFamily="ui-monospace,monospace">Fastify :9091</text>
          <text x={475} y={78} textAnchor="middle" fill="currentColor" fontSize={8} opacity={0.45}
            fontFamily="ui-monospace,monospace">auth · registry · audit</text>

          {/* ── Extension ── */}
          <rect x={615} y={20} width={150} height={60} rx={3}
            fill="rgba(52,211,153,0.15)" stroke="rgba(52,211,153,0.6)" strokeWidth={1} />
          <text x={690} y={44} textAnchor="middle" fill="currentColor" fontSize={11} fontWeight={600}>Extension</text>
          <text x={690} y={62} textAnchor="middle" fill="currentColor" fontSize={9} opacity={0.6}
            fontFamily="ui-monospace,monospace">Chrome MV3</text>

          {/* ── Browser Tab ── */}
          <rect x={630} y={200} width={130} height={50} rx={3}
            fill="rgba(167,139,250,0.15)" stroke="rgba(167,139,250,0.6)" strokeWidth={1} />
          <text x={695} y={221} textAnchor="middle" fill="currentColor" fontSize={11} fontWeight={600}>Browser Tab</text>
          <text x={695} y={237} textAnchor="middle" fill="currentColor" fontSize={9} opacity={0.6}
            fontFamily="ui-monospace,monospace">target page</text>

          {/* ── Data stores ── */}

          {/* App DB */}
          <rect x={195} y={240} width={100} height={36} rx={3}
            fill="currentColor" fillOpacity={0.08} stroke="currentColor" strokeOpacity={0.25} strokeWidth={1} />
          <text x={245} y={257} textAnchor="middle" fill="currentColor" fontSize={9} fontWeight={500} opacity={0.65}>App DB</text>
          <text x={245} y={269} textAnchor="middle" fill="currentColor" fontSize={8} opacity={0.45}
            fontFamily="ui-monospace,monospace">SQLite</text>

          {/* Audit Log */}
          <rect x={390} y={200} width={105} height={36} rx={3}
            fill="currentColor" fillOpacity={0.08} stroke="currentColor" strokeOpacity={0.25} strokeWidth={1} />
          <text x={442} y={217} textAnchor="middle" fill="currentColor" fontSize={9} fontWeight={500} opacity={0.65}>Audit Log</text>
          <text x={442} y={229} textAnchor="middle" fill="currentColor" fontSize={8} opacity={0.45}
            fontFamily="ui-monospace,monospace">SQLite</text>

          {/* Config */}
          <rect x={500} y={200} width={85} height={36} rx={3}
            fill="currentColor" fillOpacity={0.08} stroke="currentColor" strokeOpacity={0.25} strokeWidth={1} />
          <text x={542} y={217} textAnchor="middle" fill="currentColor" fontSize={9} fontWeight={500} opacity={0.65}>Config</text>
          <text x={542} y={229} textAnchor="middle" fill="currentColor" fontSize={8} opacity={0.45}
            fontFamily="ui-monospace,monospace">YAML</text>

          {/* Session Token */}
          <rect x={75} y={200} width={105} height={36} rx={3}
            fill="currentColor" fillOpacity={0.08} stroke="currentColor" strokeOpacity={0.25} strokeWidth={1} />
          <text x={127} y={217} textAnchor="middle" fill="currentColor" fontSize={9} fontWeight={500} opacity={0.65}>Session Token</text>
          <text x={127} y={229} textAnchor="middle" fill="currentColor" fontSize={8} opacity={0.45}
            fontFamily="ui-monospace,monospace">file</text>

          {/* ═══ Connection arrows ═══ */}

          {/* CLI → Daemon (direct HTTP) */}
          <line x1={137} y1={33} x2={393} y2={45}
            stroke="currentColor" strokeOpacity={0.35} markerEnd="url(#arch-ah)" />
          <text x={255} y={28} textAnchor="middle" fill="currentColor" fontSize={8} opacity={0.6}
            fontFamily="ui-monospace,monospace">HTTP :9091</text>

          {/* GUI → App Server */}
          <line x1={137} y1={145} x2={188} y2={145}
            stroke="currentColor" strokeOpacity={0.35} markerEnd="url(#arch-ah)" />

          {/* App Server → Daemon (proxy) */}
          <line x1={337} y1={138} x2={393} y2={78}
            stroke="currentColor" strokeOpacity={0.35} markerEnd="url(#arch-ah)" />
          <text x={354} y={97} textAnchor="middle" fill="currentColor" fontSize={8} opacity={0.6}
            fontFamily="ui-monospace,monospace">proxy</text>

          {/* Daemon ↔ Extension (WebSocket) */}
          <line x1={557} y1={50} x2={613} y2={50}
            stroke="currentColor" strokeOpacity={0.4} strokeWidth={1.5}
            markerEnd="url(#arch-ah)" markerStart="url(#arch-ah-rev)" />
          <text x={585} y={40} textAnchor="middle" fill="currentColor" fontSize={8} opacity={0.6}
            fontFamily="ui-monospace,monospace">WebSocket</text>

          {/* Extension → Browser Tab */}
          <line x1={695} y1={82} x2={695} y2={198}
            stroke="currentColor" strokeOpacity={0.35} markerEnd="url(#arch-ah)" />
          <text x={720} y={132} fill="currentColor" fontSize={8} opacity={0.55}
            fontFamily="ui-monospace,monospace">Content</text>
          <text x={720} y={144} fill="currentColor" fontSize={8} opacity={0.55}
            fontFamily="ui-monospace,monospace">Scripts</text>
          <text x={720} y={160} fill="currentColor" fontSize={8} opacity={0.55}
            fontFamily="ui-monospace,monospace">+ CDP</text>

          {/* App Server ↓ App DB (dashed) */}
          <line x1={245} y1={172} x2={245} y2={238}
            stroke="currentColor" strokeOpacity={0.2} strokeDasharray="3 2" />

          {/* Daemon ↓ Audit Log (dashed) */}
          <line x1={442} y1={96} x2={442} y2={198}
            stroke="currentColor" strokeOpacity={0.2} strokeDasharray="3 2" />

          {/* Daemon ↓ Config (dashed) */}
          <line x1={520} y1={96} x2={542} y2={198}
            stroke="currentColor" strokeOpacity={0.2} strokeDasharray="3 2" />

          {/* Session Token read by CLI + App Server (dashed) */}
          <line x1={75} y1={60} x2={110} y2={198}
            stroke="currentColor" strokeOpacity={0.18} strokeDasharray="3 2" />
          <line x1={200} y1={172} x2={155} y2={198}
            stroke="currentColor" strokeOpacity={0.18} strokeDasharray="3 2" />
        </svg>
      </div>

      {/* Components */}
      <h3 id="arch-components" className="font-display text-base font-semibold mb-3 scroll-mt-4">Components</h3>
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
      <h3 id="arch-stores" className="font-display text-base font-semibold mb-3 scroll-mt-4">Data Stores</h3>
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
      <h3 id="arch-flows" className="font-display text-base font-semibold mb-3 scroll-mt-4">Data Flows</h3>
      <p className="text-sm opacity-60 mb-4">
        For a plain-language walkthrough of these same flows, see{' '}
        <Link to="/concepts" className="text-primary hover:underline inline-flex items-center gap-1">
          Concepts <ArrowRight className="w-3 h-3" />
        </Link>.
      </p>
      <div className="space-y-4 mb-8">
        {FLOWS.map((f) => (
          <SwimlaneDiagram key={f.title} flow={f} />
        ))}
      </div>

      {/* Security model */}
      <h3 id="arch-security" className="font-display text-base font-semibold mb-3 scroll-mt-4">Security Model</h3>
      <div className="border border-base-300 p-4 mb-8">
        <ul className="space-y-2">
          <li className="text-sm opacity-70"><span className="font-semibold opacity-100">Session token</span> — generated on daemon start, stored at ~/.commandgarden/session-token. Every API call (except /api/status) requires Bearer auth + X-CommandGarden CSRF header.</li>
          <li className="text-sm opacity-70"><span className="font-semibold opacity-100">Domain guard</span> — connector YAML declares allowed domains. Extension refuses to run on undeclared domains.</li>
          <li className="text-sm opacity-70"><span className="font-semibold opacity-100">Capability gating</span> — each pipeline step requires declared capabilities. High-risk capabilities (js_evaluate, cdp_attach, state_mutate, network_egress) require per-capability approval.</li>
          <li className="text-sm opacity-70"><span className="font-semibold opacity-100">Audit-or-fail</span> — if the audit store is unavailable, commands are blocked.</li>
          <li className="text-sm opacity-70"><span className="font-semibold opacity-100">No credentials stored</span> — commandGarden reuses existing Chrome sessions. No passwords or cookies are persisted.</li>
          <li className="text-sm opacity-70"><span className="font-semibold opacity-100">Localhost only</span> — daemon and app server bind to 127.0.0.1 by default.</li>
        </ul>
      </div>

      {/* Workspace packages */}
      <h3 id="arch-packages" className="font-display text-base font-semibold mb-3 scroll-mt-4">Workspace Packages</h3>
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
      <h3 id="arch-build" className="font-display text-base font-semibold mb-3 scroll-mt-4">Build Order</h3>
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
