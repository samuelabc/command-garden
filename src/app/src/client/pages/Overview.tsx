import { Link } from 'react-router-dom';
import { Terminal, Globe, FileText, Server, Shield, Database, Layout, Clock, DoorOpen, BookOpen, Newspaper, KeyRound, Library, ArrowRight, Lock, Eye, Fingerprint, ScrollText, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import { Badge } from '../components/Badge';

/* ─── tiny helpers ─────────────────────────────────────────── */

function SectionKicker({ children }: { children: React.ReactNode }) {
  return (
    <div className="font-mono text-[0.6rem] font-medium opacity-40 uppercase tracking-[0.12em] mb-2">
      {children}
    </div>
  );
}

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="bg-base-200 border border-base-300 p-4 overflow-x-auto text-sm font-mono leading-relaxed">
      <code>{children}</code>
    </pre>
  );
}

type CellStatus = 'success' | 'warning' | 'error';

const statusIcon: Record<CellStatus, typeof CheckCircle2> = {
  success: CheckCircle2,
  warning: AlertCircle,
  error: XCircle,
};

const statusColor: Record<CellStatus, string> = {
  success: 'text-emerald-600 dark:text-emerald-400',
  warning: 'text-amber-600 dark:text-amber-400',
  error: 'text-red-600 dark:text-red-400',
};

function CompareCell({ label, status }: { label: string; status: CellStatus }) {
  const Icon = statusIcon[status];
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${statusColor[status]}`}>
      <Icon className="w-3.5 h-3.5 shrink-0" />
      {label}
    </span>
  );
}

const COMPARE_ROWS = [
  { label: 'Return format', cg: { label: 'Fixed schema', status: 'success' }, skills: { label: 'Loose, varies', status: 'warning' }, mcp: { label: 'Typed schema', status: 'success' } },
  { label: 'Parsing cost', cg: { label: 'Zero tokens', status: 'success' }, skills: { label: 'Tokens/call', status: 'error' }, mcp: { label: 'Tool-call overhead', status: 'warning' } },
  { label: 'Auth handling', cg: { label: 'Browser required', status: 'warning' }, skills: { label: 'Agent navigates', status: 'error' }, mcp: { label: 'Server-configured', status: 'success' } },
  { label: 'Processing', cg: { label: 'Local only', status: 'success' }, skills: { label: 'Cloud/agent', status: 'warning' }, mcp: { label: 'Server-side', status: 'warning' } },
  { label: 'Privacy', cg: { label: 'Stays on machine', status: 'success' }, skills: { label: 'Through AI', status: 'error' }, mcp: { label: 'Through server', status: 'warning' } },
  { label: 'Coverage', cg: { label: 'Any website', status: 'success' }, skills: { label: 'Any (expensive)', status: 'warning' }, mcp: { label: 'Server-limited', status: 'warning' } },
] as const satisfies { label: string; cg: { label: string; status: CellStatus }; skills: { label: string; status: CellStatus }; mcp: { label: string; status: CellStatus } }[];

/* ─── page ─────────────────────────────────────────────────── */

export default function Overview() {
  return (
    <div className="max-w-4xl mx-auto pb-20">

      {/* ── Section 1: Hero ─────────────────────────────────── */}
      <section className="pt-8 pb-16 border-b border-base-300">
        <SectionKicker>For engineers tired of copy-pasting from internal portals</SectionKicker>
        <h1
          className="font-display text-3xl sm:text-4xl font-bold tracking-tight leading-tight mb-3"
          style={{ textWrap: 'balance' } as React.CSSProperties}
        >
          Turn any website into a CLI command.
        </h1>
        <p className="text-base sm:text-lg opacity-70 max-w-[65ch] mb-8 leading-relaxed" style={{ textWrap: 'pretty' } as React.CSSProperties}>
          commandGarden reuses your existing browser sessions to extract structured data from authenticated websites. You're already logged in; it just reads what's on screen.
        </p>

        {/* Mini-flow diagram */}
        <div className="flex flex-wrap items-center gap-2 mb-8 font-mono text-xs">
          {[
            { label: 'cg run', color: 'border-sky-500/50 bg-sky-500/10 text-sky-700 dark:text-sky-400' },
            { label: 'Daemon', color: 'border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400' },
            { label: 'Chrome Extension', color: 'border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' },
            { label: 'Browser Tab', color: 'border-violet-500/50 bg-violet-500/10 text-violet-700 dark:text-violet-400' },
            { label: 'Structured JSON', color: 'border-primary/50 bg-primary/10 text-primary' },
          ].map((item, i) => (
            <span key={item.label} className="flex items-center gap-2">
              <span className={`px-2.5 py-1 border font-semibold ${item.color}`}>{item.label}</span>
              {i < 4 && <span className="opacity-30">→</span>}
            </span>
          ))}
        </div>

        <CodeBlock>{`npm install -g @commandgarden/cli`}</CodeBlock>
      </section>

      {/* ── Section 2: The Problem ──────────────────────────── */}
      <section id="why-problem" className="py-16 border-b border-base-300 scroll-mt-4">
        <SectionKicker>Where the data actually lives</SectionKicker>
        <h2 className="font-display text-xl font-bold uppercase tracking-[0.06em] mb-8">Why agents can't reach your data</h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          <div className="border border-base-300 p-5">
            <div className="flex items-center gap-2 mb-3">
              <Globe className="w-4 h-4 text-primary" />
              <h3 className="font-display font-semibold text-sm">Real-world data lives in browsers</h3>
            </div>
            <p className="text-sm opacity-70 leading-relaxed">
              AI agents can't reach data inside enterprise tools and SaaS dashboards. Those pages need a logged-in session, and the agent doesn't have one.
            </p>
          </div>

          <div className="border border-base-300 p-5">
            <div className="flex items-center gap-2 mb-3">
              <XCircle className="w-4 h-4 text-error" />
              <h3 className="font-display font-semibold text-sm">APIs are the exception</h3>
            </div>
            <p className="text-sm opacity-70 leading-relaxed">
              Most sites don't provide APIs. When one exists, you need service accounts and OAuth flows before you see a single row of data. What's visible in the UI often has no programmatic equivalent.
            </p>
          </div>

          <div className="border border-base-300 p-5">
            <div className="flex items-center gap-2 mb-3">
              <AlertCircle className="w-4 h-4 text-warning" />
              <h3 className="font-display font-semibold text-sm">Browser automation is expensive</h3>
            </div>
            <p className="text-sm opacity-70 leading-relaxed">
              Agent-driven browser tools burn tokens on every interaction just to work out what's on screen, even when the layout hasn't changed since the last run.
            </p>
          </div>
        </div>

        <p className="text-sm opacity-50 max-w-[65ch]">
          Skills, MCP servers, and browser agents all re-parse page structure on every call. That parsing only needs to happen once.
        </p>
      </section>

      {/* ── Section 3: The Solution ─────────────────────────── */}
      <section id="why-solution" className="py-16 border-b border-base-300 scroll-mt-4">
        <SectionKicker>How commandGarden works</SectionKicker>
        <h2 className="font-display text-xl font-bold uppercase tracking-[0.06em] mb-4">Connectors</h2>
        <p className="text-sm opacity-70 max-w-[65ch] leading-relaxed mb-10">
          commandGarden replaces ad-hoc browser automation with <strong className="text-base-content">connectors</strong>: YAML recipes that already encode how to navigate a site and what to pull off the page. An agent runs one CLI command and gets back a fixed schema instead of re-parsing the page. Click the same connector in the GUI and you get the same rows.
        </p>

        {/* Before / After — strikethrough reduction */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">

          {/* Left: Without commandGarden */}
          <div className="border border-error/20 bg-error/[0.03] p-5">
            <div className="font-mono text-[0.6rem] font-medium text-error/60 uppercase tracking-[0.12em] mb-4">Without commandGarden</div>
            <div className="space-y-0">
              {[
                { label: 'Task received', note: 'agent or human', struck: false },
                { label: 'Launch browser', note: 'headless instance', struck: true },
                { label: 'Navigate + Wait', note: 'auth redirects', struck: true },
                { label: 'Parse HTML', note: 'tokens for structure', struck: true },
                { label: 'Extract Data', note: 'tokens for content', struck: true },
                { label: 'Loose output', note: 'varies per run', struck: false },
              ].map((s, i) => (
                <div key={i}>
                  <div className={`flex items-center gap-2.5 ${s.struck ? 'opacity-40 line-through decoration-error/50' : ''}`}>
                    <span className={`w-5 h-5 border flex items-center justify-center font-mono text-[0.6rem] shrink-0 ${
                      s.struck
                        ? 'border-error/20 text-error/40'
                        : 'border-error/30 bg-error/10 text-error/60'
                    }`}>{i + 1}</span>
                    <span className="text-sm font-medium">{s.label}</span>
                    <span className="text-xs opacity-40 font-mono">{s.note}</span>
                  </div>
                  {i < 5 && <div className={`ml-2.5 w-px h-2 ${s.struck ? 'bg-error/15' : 'bg-error/20'}`} />}
                </div>
              ))}
            </div>
          </div>

          {/* Right: With commandGarden */}
          <div className="border border-primary/20 bg-primary/[0.03] p-5 flex flex-col">
            <div className="font-mono text-[0.6rem] font-medium text-primary/60 uppercase tracking-[0.12em] mb-4">With commandGarden</div>
            <div className="space-y-0">
              {[
                { label: 'Task received', note: 'agent or human' },
                { label: 'cg run site/command', note: 'one call, CLI or GUI', accent: true },
                { label: 'Structured JSON', note: 'fixed schema' },
              ].map((s, i) => (
                <div key={i}>
                  <div className="flex items-center gap-2.5">
                    <span className="w-5 h-5 border border-primary/30 bg-primary/10 flex items-center justify-center font-mono text-[0.6rem] text-primary/60 shrink-0">{i + 1}</span>
                    <span className={`text-sm font-medium ${'accent' in s && s.accent ? 'text-primary font-semibold' : ''}`}>{s.label}</span>
                    <span className="text-xs opacity-40 font-mono">{s.note}</span>
                  </div>
                  {i < 2 && <div className="ml-2.5 w-px h-2 bg-primary/20" />}
                </div>
              ))}
            </div>

          </div>
        </div>

        {/* Shared footer strip */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-14">
          <div className="flex items-center gap-2">
            <Badge variant="error" size="xs">thousands of tokens</Badge>
            <span className="text-xs opacity-50">per interaction</span>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="success" size="xs">0 tokens</Badge>
            <span className="text-xs opacity-50">parsing done locally</span>
          </div>
        </div>

        {/* Value props */}
        <div className="space-y-8 mb-12">
          <div className="flex gap-4">
            <Globe className="w-5 h-5 shrink-0 mt-0.5 text-primary" />
            <div>
              <h3 className="font-display font-semibold mb-1">Reuse your browser session</h3>
              <p className="text-sm opacity-70 max-w-[60ch] leading-relaxed">
                A Chrome extension runs inside your already-authenticated browser. No separate login, no stored credentials.
              </p>
            </div>
          </div>

          <div className="flex gap-4">
            <FileText className="w-5 h-5 shrink-0 mt-0.5 text-primary" />
            <div>
              <h3 className="font-display font-semibold mb-1">Fixed-format parsing, done locally</h3>
              <p className="text-sm opacity-70 max-w-[60ch] leading-relaxed">
                Each connector defines a pipeline that produces the same output shape on every run. Parsing happens in the extension and daemon. Nothing leaves your machine.
              </p>
            </div>
          </div>

          <div className="flex gap-4">
            <Terminal className="w-5 h-5 shrink-0 mt-0.5 text-primary" />
            <div>
              <h3 className="font-display font-semibold mb-1">CLI for agents, GUI for humans</h3>
              <p className="text-sm opacity-70 max-w-[60ch] leading-relaxed mb-3">
                Agents call connectors through the CLI and get a fixed JSON schema. The GUI runs those same connectors with the same arguments, so you get the same rows without opening a terminal.
              </p>
              <CodeBlock>{`cg run timetracking/report --month 2026-06`}</CodeBlock>
            </div>
          </div>
        </div>

        {/* Comparison table */}
        <h3 className="font-display font-semibold text-sm mb-3">How it compares</h3>
        <div className="overflow-x-auto border border-base-300">
          <table className="table table-sm w-full">
            <thead>
              <tr className="bg-base-200">
                <th className="sticky left-0 z-10 bg-base-200"></th>
                <th className="bg-primary/10 border-x border-primary/20 text-primary">commandGarden</th>
                <th>AI Skills</th>
                <th>MCP Servers</th>
              </tr>
            </thead>
            <tbody>
              {COMPARE_ROWS.map((row) => (
                <tr key={row.label}>
                  <td className="sticky left-0 z-10 bg-base-100 font-mono text-xs font-medium border-r border-base-300">{row.label}</td>
                  <td className="bg-primary/5 border-x border-primary/20"><CompareCell {...row.cg} /></td>
                  <td><CompareCell {...row.skills} /></td>
                  <td><CompareCell {...row.mcp} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-sm opacity-50 mt-4 max-w-[65ch]">
          Skills and MCP provide the integration layer; commandGarden does the extraction and parsing locally. The <span className="font-mono">cg</span> skill lets AI agents call commandGarden commands directly.
        </p>
      </section>

      {/* ── Section 4: Architecture ─────────────────────────── */}
      <section id="why-architecture" className="py-16 border-b border-base-300 bg-base-200/30 -mx-4 px-4 md:-mx-5 md:px-5 scroll-mt-4">
        <div className="max-w-4xl mx-auto">
        <SectionKicker>Nothing leaves localhost</SectionKicker>
        <h2 className="font-display text-xl font-bold uppercase tracking-[0.06em] mb-4">Architecture</h2>
        <p className="text-sm opacity-70 max-w-[65ch] leading-relaxed mb-8">
          Here's what each piece does.
        </p>

        {/* SVG Architecture Diagram */}
        <div className="border border-base-300 bg-base-100 p-5 mb-8 overflow-x-auto">
          <svg viewBox="0 0 700 260" className="w-full text-base-content" style={{ minWidth: 560 }}>
            <defs>
              <marker id="why-ah" viewBox="0 0 10 8" refX="10" refY="4" markerWidth="7" markerHeight="5" orient="auto">
                <path d="M0 0L10 4L0 8z" fill="currentColor" fillOpacity={0.5} />
              </marker>
              <marker id="why-ah-rev" viewBox="0 0 10 8" refX="0" refY="4" markerWidth="7" markerHeight="5" orient="auto">
                <path d="M10 0L0 4L10 8z" fill="currentColor" fillOpacity={0.5} />
              </marker>
            </defs>

            {/* CLI Client */}
            <rect x={10} y={10} width={110} height={46} rx={0}
              fill="rgba(56,189,248,0.15)" stroke="rgba(56,189,248,0.6)" strokeWidth={1} />
            <text x={65} y={30} textAnchor="middle" fill="currentColor" fontSize={11} fontWeight={600}>CLI</text>
            <text x={65} y={44} textAnchor="middle" fill="currentColor" fontSize={8} opacity={0.6}
              fontFamily="ui-monospace,monospace">cg run ...</text>

            {/* GUI */}
            <rect x={10} y={80} width={110} height={46} rx={0}
              fill="rgba(56,189,248,0.15)" stroke="rgba(56,189,248,0.6)" strokeWidth={1} />
            <text x={65} y={100} textAnchor="middle" fill="currentColor" fontSize={11} fontWeight={600}>GUI</text>
            <text x={65} y={114} textAnchor="middle" fill="currentColor" fontSize={8} opacity={0.6}
              fontFamily="ui-monospace,monospace">React SPA</text>

            {/* App Server */}
            <rect x={160} y={80} width={120} height={46} rx={0}
              fill="rgba(251,191,36,0.15)" stroke="rgba(251,191,36,0.6)" strokeWidth={1} />
            <text x={220} y={100} textAnchor="middle" fill="currentColor" fontSize={10} fontWeight={600}>App Server</text>
            <text x={220} y={114} textAnchor="middle" fill="currentColor" fontSize={8} opacity={0.6}
              fontFamily="ui-monospace,monospace">:9092</text>

            {/* Daemon */}
            <rect x={320} y={15} width={150} height={76} rx={0}
              fill="rgba(251,191,36,0.15)" stroke="rgba(251,191,36,0.7)" strokeWidth={1.5} />
            <text x={395} y={40} textAnchor="middle" fill="currentColor" fontSize={13} fontWeight={700}>Daemon</text>
            <text x={395} y={56} textAnchor="middle" fill="currentColor" fontSize={8} opacity={0.6}
              fontFamily="ui-monospace,monospace">Fastify :9091</text>
            <text x={395} y={78} textAnchor="middle" fill="currentColor" fontSize={7} opacity={0.45}
              fontFamily="ui-monospace,monospace">auth · registry · audit</text>

            {/* Extension */}
            <rect x={520} y={20} width={130} height={55} rx={0}
              fill="rgba(52,211,153,0.15)" stroke="rgba(52,211,153,0.6)" strokeWidth={1} />
            <text x={585} y={42} textAnchor="middle" fill="currentColor" fontSize={11} fontWeight={600}>Extension</text>
            <text x={585} y={58} textAnchor="middle" fill="currentColor" fontSize={8} opacity={0.6}
              fontFamily="ui-monospace,monospace">Chrome MV3</text>

            {/* Browser Tab */}
            <rect x={530} y={160} width={120} height={46} rx={0}
              fill="rgba(167,139,250,0.15)" stroke="rgba(167,139,250,0.6)" strokeWidth={1} />
            <text x={590} y={180} textAnchor="middle" fill="currentColor" fontSize={11} fontWeight={600}>Browser Tab</text>
            <text x={590} y={194} textAnchor="middle" fill="currentColor" fontSize={8} opacity={0.6}
              fontFamily="ui-monospace,monospace">target page</text>

            {/* Data stores */}
            <rect x={310} y={170} width={90} height={30} rx={0}
              fill="currentColor" fillOpacity={0.08} stroke="currentColor" strokeOpacity={0.25} strokeWidth={1} />
            <text x={355} y={188} textAnchor="middle" fill="currentColor" fontSize={8} fontWeight={500} opacity={0.65}>Audit Log</text>

            <rect x={410} y={170} width={80} height={30} rx={0}
              fill="currentColor" fillOpacity={0.08} stroke="currentColor" strokeOpacity={0.25} strokeWidth={1} />
            <text x={450} y={188} textAnchor="middle" fill="currentColor" fontSize={8} fontWeight={500} opacity={0.65}>Config</text>

            <rect x={160} y={170} width={90} height={30} rx={0}
              fill="currentColor" fillOpacity={0.08} stroke="currentColor" strokeOpacity={0.25} strokeWidth={1} />
            <text x={205} y={188} textAnchor="middle" fill="currentColor" fontSize={8} fontWeight={500} opacity={0.65}>App DB</text>

            {/* Arrows */}
            {/* CLI → Daemon */}
            <line x1={122} y1={33} x2={318} y2={45}
              stroke="currentColor" strokeOpacity={0.35} markerEnd="url(#why-ah)" />
            <text x={210} y={28} textAnchor="middle" fill="currentColor" fontSize={7} opacity={0.6}
              fontFamily="ui-monospace,monospace">HTTP</text>

            {/* GUI → App Server */}
            <line x1={122} y1={103} x2={158} y2={103}
              stroke="currentColor" strokeOpacity={0.35} markerEnd="url(#why-ah)" />

            {/* App Server → Daemon */}
            <line x1={282} y1={96} x2={318} y2={72}
              stroke="currentColor" strokeOpacity={0.35} markerEnd="url(#why-ah)" />
            <text x={295} y={76} textAnchor="middle" fill="currentColor" fontSize={7} opacity={0.6}
              fontFamily="ui-monospace,monospace">proxy</text>

            {/* Daemon ↔ Extension */}
            <line x1={472} y1={48} x2={518} y2={48}
              stroke="currentColor" strokeOpacity={0.4} strokeWidth={1.5}
              markerEnd="url(#why-ah)" markerStart="url(#why-ah-rev)" />
            <text x={495} y={38} textAnchor="middle" fill="currentColor" fontSize={7} opacity={0.6}
              fontFamily="ui-monospace,monospace">WebSocket</text>

            {/* Extension → Browser Tab */}
            <line x1={590} y1={77} x2={590} y2={158}
              stroke="currentColor" strokeOpacity={0.35} markerEnd="url(#why-ah)" />

            {/* Daemon ↓ stores */}
            <line x1={370} y1={93} x2={365} y2={168}
              stroke="currentColor" strokeOpacity={0.2} strokeDasharray="3 2" />
            <line x1={430} y1={93} x2={445} y2={168}
              stroke="currentColor" strokeOpacity={0.2} strokeDasharray="3 2" />

            {/* App Server ↓ App DB */}
            <line x1={210} y1={128} x2={210} y2={168}
              stroke="currentColor" strokeOpacity={0.2} strokeDasharray="3 2" />
          </svg>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
          {[
            { icon: Terminal, title: 'CLI', mono: 'cg', desc: 'Agent entry point. One command in, JSON out.' },
            { icon: Server, title: 'Daemon', mono: ':9091', desc: 'Validates auth and capabilities, loads connectors, writes audit log.' },
            { icon: Globe, title: 'Extension', mono: 'MV3', desc: 'Runs inside your authenticated Chrome. Accesses cookies and page data.' },
            { icon: FileText, title: 'Connectors', mono: 'YAML', desc: 'Declarative pipelines: navigate → wait → extract → map. No code execution.' },
            { icon: Database, title: 'Audit Log', mono: 'SQLite', desc: 'Every execution logged: connector, domains, timing, approvals.' },
            { icon: Layout, title: 'GUI', mono: ':9092', desc: 'Human entry point. App pages, connector browsing, and config management.' },
          ].map(({ icon: Icon, title, mono, desc }) => (
            <div key={title} className="flex gap-3 p-3 border border-base-300 bg-base-100">
              <Icon className="w-4 h-4 shrink-0 mt-0.5 opacity-40" />
              <div>
                <div className="flex items-baseline gap-1.5 mb-0.5">
                  <span className="font-display font-semibold text-sm">{title}</span>
                  <span className="font-mono text-[0.65rem] opacity-40">{mono}</span>
                </div>
                <p className="text-xs opacity-60 leading-relaxed">{desc}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-4">
          <Link to="/architecture" className="font-mono text-xs text-primary hover:underline flex items-center gap-1">
            Full architecture details <ArrowRight className="w-3 h-3" />
          </Link>
          <Link to="/concepts" className="font-mono text-xs text-primary hover:underline flex items-center gap-1">
            Concepts <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
        </div>
      </section>

      {/* ── Section 5: Built-in Apps ────────────────────────── */}
      <section id="why-apps" className="py-16 border-b border-base-300 scroll-mt-4">
        <SectionKicker>Six apps built on the bundled connectors</SectionKicker>
        <h2 className="font-display text-xl font-bold uppercase tracking-[0.06em] mb-4">Built-in Apps</h2>
        <p className="text-sm opacity-70 max-w-[65ch] leading-relaxed mb-8">
          commandGarden ships with app pages for timesheets, meeting rooms, dev journals, and security feeds. Each runs on your local machine using your browser session.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {([
            { icon: Clock, title: 'Time Tracking', tag: 'Administrative', desc: 'Monthly report with project breakdown and summary cards', route: '/apps/timetracking', cmd: 'timetracking/report' },
            { icon: DoorOpen, title: 'Room Availability', tag: 'Administrative', desc: 'Meeting room free/busy from Outlook Scheduling Assistant', route: '/apps/rooms', cmd: 'teams/room-availability' },
            { icon: BookOpen, title: 'Dev Journal', tag: 'Productivity', desc: 'Auto-generated daily journal from Git commits and Jira tickets', route: '/apps/journal', cmd: 'ado/git-commits' },
            { icon: Newspaper, title: 'Security News', tag: 'Security', desc: 'Aggregated feed from Socket.dev, Wiz, and tl;dr sec', route: '/apps/security-news', cmd: 'socket/security-news' },
            { icon: KeyRound, title: 'Trusted Peer Expiry', tag: 'Productivity', desc: 'TokenMaster client trust relationships with expiry tracking', route: '/apps/trusted-peer-expiry', cmd: 'tokenmaster/clients-list' },
            { icon: Lock, title: 'Client Secret Rotation', tag: 'Productivity', desc: 'TokenMaster client secret age overview with rotation tracking', route: '/apps/client-secret-rotation', cmd: 'tokenmaster/client-details' },
            { icon: Library, title: 'GCS Knowledge Base', tag: 'Security', desc: 'Browse and read internal security docs, converted to Markdown', route: null as string | null, cmd: 'gcs/kb-pages' },
          ]).map(({ icon: Icon, title, tag, desc, route, cmd }) => (
            <div key={title} className="border border-base-300 p-4">
              <div className="flex items-start gap-3 mb-2">
                <Icon className="w-4 h-4 shrink-0 mt-0.5 opacity-40" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-display font-semibold text-sm">{title}</span>
                    <Badge size="xs">{tag}</Badge>
                  </div>
                  <p className="text-xs opacity-60 leading-relaxed">{desc}</p>
                </div>
              </div>
              <div className="flex items-center justify-between mt-3 pt-2 border-t border-base-300/50">
                <span className="font-mono text-[0.65rem] opacity-30">cg run {cmd}</span>
                {route && (
                  <Link to={route} className="font-mono text-xs text-primary hover:underline flex items-center gap-1">
                    Open <ArrowRight className="w-3 h-3" />
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs opacity-40 mt-4 max-w-[65ch]">
          Each app page combines multiple connector calls into a single view. The GUI handles layout and caching; the connectors provide the raw data.
        </p>
      </section>

      {/* ── Section 6: Typical workflow ─────────────────────── */}
      <section id="why-happy-path" className="py-16 border-b border-base-300 scroll-mt-4">
        <h2 className="font-display text-xl font-bold uppercase tracking-[0.06em] mb-8">From install to first result</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Terminal className="w-4 h-4 opacity-40" />
              <h3 className="font-display font-semibold text-sm">Human user</h3>
            </div>
            <div className="space-y-3 mb-4">
              {[
                { step: 'Install', cmd: 'npm install -g @commandgarden/cli' },
                { step: 'Start', cmd: 'cg up' },
                { step: 'Load extension', cmd: 'chrome://extensions → Load unpacked' },
                { step: 'Verify', cmd: 'cg daemon status' },
                { step: 'Run', cmd: 'cg run timetracking/report --month 2026-06' },
              ].map((s, i) => (
                <div key={i}>
                  <div className="flex items-center gap-2.5">
                    <span className="w-5 h-5 border border-base-300 bg-base-200 flex items-center justify-center font-mono text-[0.6rem] opacity-50 shrink-0">{i + 1}</span>
                    <span className="text-xs font-medium opacity-60">{s.step}</span>
                  </div>
                  <div className="ml-[1.875rem] mt-1">
                    <code className="text-xs font-mono bg-base-200 border border-base-300 px-2 py-0.5 opacity-70">{s.cmd}</code>
                  </div>
                  {i < 4 && <div className="ml-2.5 w-px h-2 bg-base-300" />}
                </div>
              ))}
            </div>
            <p className="text-xs opacity-50 ml-[1.875rem]">
              Or run the same connector from the GUI at <span className="font-mono">localhost:9092</span>.
            </p>
          </div>

          <div>
            <div className="flex items-center gap-2 mb-3">
              <Globe className="w-4 h-4 opacity-40" />
              <h3 className="font-display font-semibold text-sm">AI agent</h3>
            </div>
            <div className="space-y-3 mb-4">
              {[
                { step: 'Load skill', cmd: 'cg skill loaded' },
                { step: 'Check status', cmd: 'cg daemon status → ready' },
                { step: 'Discover', cmd: 'cg list → available connectors' },
                { step: 'Inspect', cmd: 'cg inspect timetracking/report → args, columns' },
                { step: 'Run', cmd: 'cg run timetracking/report --format json' },
              ].map((s, i) => (
                <div key={i}>
                  <div className="flex items-center gap-2.5">
                    <span className="w-5 h-5 border border-base-300 bg-base-200 flex items-center justify-center font-mono text-[0.6rem] opacity-50 shrink-0">{i + 1}</span>
                    <span className="text-xs font-medium opacity-60">{s.step}</span>
                  </div>
                  <div className="ml-[1.875rem] mt-1">
                    <code className="text-xs font-mono bg-base-200 border border-base-300 px-2 py-0.5 opacity-70">{s.cmd}</code>
                  </div>
                  {i < 4 && <div className="ml-2.5 w-px h-2 bg-base-300" />}
                </div>
              ))}
            </div>
            <p className="text-xs opacity-50 ml-[1.875rem]">
              Same JSON, same schema as the human path.
            </p>
          </div>
        </div>
      </section>

      {/* ── Section 7: Security ─────────────────────────────── */}
      <section id="why-security" className="py-16 border-b border-base-300 bg-base-200/30 -mx-4 px-4 md:-mx-5 md:px-5 scroll-mt-4">
        <div className="max-w-4xl mx-auto">
        <SectionKicker>Touching enterprise data means no shortcuts</SectionKicker>
        <h2 className="font-display text-xl font-bold uppercase tracking-[0.06em] mb-4">Security</h2>
        <p className="text-sm opacity-70 max-w-[65ch] leading-relaxed mb-8">
          This tool has access to your cookies and session tokens. That's a lot of trust, so the defaults are locked down. You have to open things up explicitly.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
          {[
            { icon: Lock, title: 'No credentials stored', desc: 'Reuses session cookies already in Chrome. Nothing stored on disk, nothing sent externally.' },
            { icon: Shield, title: 'Domain-scoped permissions', desc: 'Connectors declare allowed domains. Undeclared domains are blocked by the daemon.' },
            { icon: Eye, title: 'Capability gating', desc: 'Each step requires declared capabilities. High-risk ops (js_evaluate, cdp_attach, state_mutate, network_egress) need per-capability approval.' },
            { icon: Fingerprint, title: 'Step-by-step approval', desc: 'Sensitive operations pause for confirmation. Approve in CLI or via Chrome notification.' },
            { icon: Server, title: 'Local-only processing', desc: 'Daemon on :9091, app server on :9092. Bound to localhost. No network exposure.' },
            { icon: FileText, title: 'Declarative connectors', desc: 'Pure YAML pipelines. No JavaScript evaluation unless explicitly declared and approved.' },
            { icon: ScrollText, title: 'Audit-or-fail', desc: 'Every execution logged to SQLite. Domains, timing, approvals, row counts. If audit fails, commands are blocked.' },
            { icon: Database, title: 'Per-session auth', desc: 'Session token generated on startup with owner-only permissions. Extension verifies its own ID per message.' },
          ].map(({ icon: Icon, title, desc }) => (
            <div key={title} className="flex gap-3 p-3 border border-base-300 bg-base-100">
              <Icon className="w-4 h-4 shrink-0 mt-0.5 opacity-40" />
              <div>
                <h3 className="font-display font-semibold text-sm mb-0.5">{title}</h3>
                <p className="text-xs opacity-60 leading-relaxed">{desc}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="border border-base-300 bg-base-100 p-5">
          <h3 className="font-mono text-xs font-medium opacity-50 uppercase tracking-wide mb-3">Limitations</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1.5 text-sm opacity-70">
            <p>Only works while browser is open and you're logged in.</p>
            <p>Connectors may break when a site redesigns its HTML/APIs.</p>
            <p>Chrome-based browsers only for now.</p>
            <p>No credential storage, so sessions expire when you log out.</p>
          </div>
        </div>
        </div>
      </section>

      {/* ── Section 8: Get Started ──────────────────────────── */}
      <section id="why-get-started" className="py-16 border-b border-base-300 scroll-mt-4">
        <h2 className="font-display text-xl font-bold uppercase tracking-[0.06em] mb-4">Install and run</h2>

        <CodeBlock>{`# Install
npm install -g @commandgarden/cli

# Start the daemon and GUI
cg up

# Load the Chrome extension
# Chrome → chrome://extensions → Developer mode → Load unpacked

# Run your first connector
cg run socket/security-news --format table`}</CodeBlock>

        <div className="flex flex-wrap gap-4 mt-6">
          <Link to="/guide" className="font-mono text-xs text-primary hover:underline flex items-center gap-1">
            Setup Guide <ArrowRight className="w-3 h-3" />
          </Link>
          <Link to="/architecture" className="font-mono text-xs text-primary hover:underline flex items-center gap-1">
            Architecture <ArrowRight className="w-3 h-3" />
          </Link>
          <Link to="/concepts" className="font-mono text-xs text-primary hover:underline flex items-center gap-1">
            Concepts <ArrowRight className="w-3 h-3" />
          </Link>
          <Link to="/api-reference" className="font-mono text-xs text-primary hover:underline flex items-center gap-1">
            API &amp; CLI Reference <ArrowRight className="w-3 h-3" />
          </Link>
          <Link to="/skills" className="font-mono text-xs text-primary hover:underline flex items-center gap-1">
            Skills <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      </section>

      {/* ── Section 9: Extend ───────────────────────────────── */}
      <section id="why-extend" className="pt-16 scroll-mt-4">
        <SectionKicker>Extend to any website</SectionKicker>
        <h2 className="font-display text-xl font-bold uppercase tracking-[0.06em] mb-4">Write your own connector</h2>
        <p className="text-sm opacity-70 max-w-[65ch] leading-relaxed mb-8">
          The built-in connectors cover common tasks, but you can write your own for any site. If you can see it in Chrome, you can turn it into a CLI command.
        </p>

        <div className="space-y-3 mb-8">
          {[
            ['Create a YAML file', '~/.commandgarden/connectors/'],
            ['Declare the domain, capabilities, arguments, and columns', null],
            ['Define a pipeline', 'navigate → wait → extract/fetch → map'],
            ['Validate', 'cg validate my-connector.yaml'],
            ['Run', 'cg run mysite/my-command --format json'],
          ].map(([label, detail], i) => (
            <div key={i} className="flex gap-3 items-baseline">
              <span className="font-mono text-xs opacity-30 w-4 text-right shrink-0">{i + 1}.</span>
              <div>
                <span className="text-sm font-medium">{label}</span>
                {detail && <span className="font-mono text-xs opacity-40 ml-2">{detail}</span>}
              </div>
            </div>
          ))}
        </div>

        <CodeBlock>{`site: mysite
name: my-command
version: "1.0"
description: "Fetch search results"
access: read

domains:
  - "mysite.example.com"
capabilities:
  - navigate
  - dom_read

args:
  - name: query
    type: string
    required: true

columns:
  - name: title
    type: string
  - name: url
    type: string

pipeline:
  - step: navigate
    url: "https://mysite.example.com/search?q=\${{ args.query }}"
  - step: wait
    selector: ".results"
  - step: extract
    selector: ".results .item"
    fields:
      title: "h3"
      url: "a@href"`}</CodeBlock>

        <p className="text-xs opacity-40 mt-4 max-w-[65ch]">
          Most connectors are pure YAML. The declarative format covers DOM extraction, cookie-authenticated API calls, network interception, and field mapping.
        </p>
      </section>

    </div>
  );
}
