import { Server, Eye, MousePointer2, Code2, ArrowRight, ShieldCheck, ShieldAlert, Lock, CheckCircle2 } from 'lucide-react';
import { Badge } from '../components/Badge';
import { SwimlaneDiagram, type FlowDef } from '../components/SwimlaneDiagram';

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

/* ─── section 1: capability & world model ───────────────────── */

const ZONES = [
  {
    icon: Server,
    title: 'Background Worker',
    subtitle: 'no page contact',
    access: 'Never touches the page. Talks to Chrome APIs directly.',
    steps: ['navigate', 'cookie'],
    tone: 'border-sky-500/40 bg-sky-500/[0.04]',
  },
  {
    icon: Eye,
    title: 'ISOLATED Content Script',
    subtitle: 'DOM only',
    access: "Shares the live page DOM, but can't see the page's own JavaScript variables or in-memory state.",
    steps: ['dom_read', 'dom_write', 'fetch'],
    tone: 'border-emerald-500/40 bg-emerald-500/[0.04]',
  },
  {
    icon: Code2,
    title: 'MAIN Page World',
    subtitle: 'full page access',
    access: 'Runs in the exact same JS realm as the website itself. Anything the page can do, this can do too.',
    steps: ['js_evaluate'],
    tone: 'border-red-500/40 bg-red-500/[0.04]',
  },
];

const CAPABILITY_ROWS = [
  { cap: 'navigate', zone: 'Background', risk: 'info', desc: 'Open a URL and wait for the page to finish loading.' },
  { cap: 'dom_read', zone: 'ISOLATED', risk: 'info', desc: 'Read text and structure out of the page. Never modifies anything.' },
  { cap: 'dom_write', zone: 'ISOLATED', risk: 'warning', desc: 'Click, type, and interact with page elements.' },
  { cap: 'cookie_read', zone: 'Background / ISOLATED', risk: 'warning', desc: "Reuse the browser's existing session to call an API or read a cookie value." },
  { cap: 'js_evaluate', zone: 'MAIN', risk: 'error', desc: 'Run arbitrary JavaScript in the page: the escape hatch for sites with no simpler path. Least constrained, used as a last resort.' },
] as const;

/* ─── section 2: connector pipeline lifecycle ───────────────── */

const LIFECYCLE_FLOW: FlowDef = {
  title: 'What happens when you run a command',
  lanes: [
    { id: 'client', label: 'CLI / GUI', color: 'client' },
    { id: 'daemon', label: 'Daemon', color: 'daemon' },
    { id: 'extension', label: 'Extension', color: 'extension' },
    { id: 'browser', label: 'Browser Tab', color: 'browser' },
  ],
  steps: [
    { type: 'arrow', from: 'client', to: 'daemon', label: 'cg run site/command' },
    { type: 'action', lane: 'daemon', label: 'check auth + declared domains + capabilities' },
    { type: 'arrow', from: 'daemon', to: 'extension', label: 'send the pipeline' },
    { type: 'arrow', from: 'extension', to: 'browser', label: 'run each step in your open tab' },
    { type: 'arrow', from: 'browser', to: 'extension', label: 'page data' },
    { type: 'arrow', from: 'extension', to: 'daemon', label: 'structured rows' },
    { type: 'arrow', from: 'daemon', to: 'client', label: 'JSON / table / CSV' },
  ],
};

/* ─── section 3: approval & risk-tiering workflow ───────────── */

const APPROVAL_FLOW: FlowDef = {
  title: 'When a step needs your OK',
  lanes: [
    { id: 'client', label: 'CLI / GUI', color: 'client' },
    { id: 'daemon', label: 'Daemon', color: 'daemon' },
    { id: 'extension', label: 'Extension', color: 'extension' },
  ],
  steps: [
    { type: 'action', lane: 'daemon', label: 'this step needs approval' },
    { type: 'arrow', from: 'daemon', to: 'client', label: 'prompt: "allow this?"' },
    { type: 'arrow', from: 'daemon', to: 'extension', label: 'also notify the extension' },
    { type: 'arrow', from: 'client', to: 'daemon', label: 'you say yes or no' },
    { type: 'action', lane: 'daemon', label: 'whichever answers first wins' },
    { type: 'action', lane: 'daemon', label: 'continue the pipeline, or stop and report why' },
  ],
};

const RISK_TIERS = [
  { label: 'Low', variant: 'success', desc: 'Runs automatically. Reading data, navigating pages.', icon: CheckCircle2 },
  { label: 'Medium', variant: 'warning', desc: 'Runs automatically, but every use is logged to the audit trail.', icon: ShieldCheck },
  { label: 'High', variant: 'error', desc: "Pauses for a yes/no, unless you've pre-approved that specific connector.", icon: ShieldAlert },
] as const;

/* ─── page ─────────────────────────────────────────────────── */

export default function Concepts() {
  return (
    <div className="max-w-4xl mx-auto pb-20">
      <h2 className="font-display text-xl font-bold uppercase tracking-[0.06em] mb-1">Concepts</h2>
      <p className="text-sm opacity-60 mb-10">
        Three ideas worth understanding before you dig deeper into commandGarden.
      </p>

      {/* ── 1. Capability & world model ─────────────────────── */}
      <section id="concepts-worlds" className="mb-16 scroll-mt-4">
        <SectionKicker>Not every step is equally trusted</SectionKicker>
        <h3 className="font-display text-base font-semibold mb-3">Capability &amp; world model</h3>
        <p className="text-sm opacity-70 max-w-[65ch] leading-relaxed mb-6">
          A connector's pipeline is a list of steps: <span className="font-mono text-xs">navigate</span>,{' '}
          <span className="font-mono text-xs">extract</span>, <span className="font-mono text-xs">click</span>, and so
          on. Each step type is only allowed to run in one of three places, and each place can see a little more of
          the page than the last.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
          {ZONES.map((z, i) => (
            <div key={z.title} className="relative">
              <div className={`border p-4 h-full ${z.tone}`}>
                <div className="flex items-center gap-2 mb-2">
                  <z.icon className="w-4 h-4 opacity-50" />
                  <span className="font-display font-semibold text-sm">{z.title}</span>
                </div>
                <Badge size="xs" className="mb-2">{z.subtitle}</Badge>
                <p className="text-xs opacity-60 leading-relaxed mb-3">{z.access}</p>
                <div className="flex flex-wrap gap-1.5">
                  {z.steps.map((s) => (
                    <span key={s} className="font-mono text-[0.65rem] px-1.5 py-0.5 bg-base-200 border border-base-300">
                      {s}
                    </span>
                  ))}
                </div>
              </div>
              {i < ZONES.length - 1 && (
                <ArrowRight className="hidden md:block w-4 h-4 opacity-30 absolute top-1/2 -right-2 -translate-y-1/2 translate-x-1/2 z-10" />
              )}
            </div>
          ))}
        </div>
        <p className="text-xs opacity-40 mb-8">More access, left to right. Most steps never need the rightmost zone.</p>

        <div className="overflow-x-auto border border-base-300">
          <table className="table table-sm w-full">
            <thead>
              <tr className="bg-base-200">
                <th>Capability</th>
                <th>Runs in</th>
                <th>Risk</th>
                <th>What it does</th>
              </tr>
            </thead>
            <tbody>
              {CAPABILITY_ROWS.map((r) => (
                <tr key={r.cap}>
                  <td className="font-mono text-xs font-semibold">{r.cap}</td>
                  <td className="text-xs opacity-60">{r.zone}</td>
                  <td><Badge variant={r.risk as 'info' | 'warning' | 'error'} size="xs">{r.risk === 'info' ? 'low' : r.risk === 'warning' ? 'medium' : 'high'}</Badge></td>
                  <td className="text-sm opacity-70">{r.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── 2. Connector pipeline lifecycle ─────────────────── */}
      <section id="concepts-lifecycle" className="mb-16 scroll-mt-4">
        <SectionKicker>From command to structured data</SectionKicker>
        <h3 className="font-display text-base font-semibold mb-3">Connector pipeline lifecycle</h3>
        <p className="text-sm opacity-70 max-w-[65ch] leading-relaxed mb-6">
          A connector is a YAML file describing a pipeline. Running it walks the same four hops every time, whether
          you typed the command or an AI agent did.
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-[1.3fr_1fr] gap-4 mb-2">
          <SwimlaneDiagram flow={LIFECYCLE_FLOW} />
          <div>
            <h4 className="font-semibold text-sm mb-3">A minimal connector pipeline</h4>
            <CodeBlock>{`pipeline:
  - step: navigate
    url: "https://example.com/tickets"
  - step: wait
    selector: ".ticket-row"
  - step: extract
    selector: ".ticket-row"
    fields:
      id: ".ticket-id"
      title: ".ticket-title"`}</CodeBlock>
            <p className="text-xs opacity-50 mt-2">
              Each <span className="font-mono">step</span> above maps to one hop in the diagram: navigate opens the
              tab, wait confirms it loaded, extract reads structured rows back out.
            </p>
          </div>
        </div>
      </section>

      {/* ── 3. Approval & risk-tiering workflow ─────────────── */}
      <section id="concepts-approval" className="scroll-mt-4">
        <SectionKicker>Not everything runs unattended</SectionKicker>
        <h3 className="font-display text-base font-semibold mb-3">Approval &amp; risk-tiering workflow</h3>
        <p className="text-sm opacity-70 max-w-[65ch] leading-relaxed mb-6">
          Every capability has a risk tier. Low and medium tiers run without interruption. High-risk steps pause and
          wait for a human to say yes, either in the CLI or as a Chrome notification.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8">
          {RISK_TIERS.map((t, i) => (
            <div key={t.label} className="relative">
              <div className="border border-base-300 p-4 h-full">
                <div className="flex items-center gap-2 mb-2">
                  <t.icon className="w-4 h-4 opacity-50" />
                  <Badge variant={t.variant} size="xs">{t.label}</Badge>
                </div>
                <p className="text-xs opacity-60 leading-relaxed">{t.desc}</p>
              </div>
              {i < RISK_TIERS.length - 1 && (
                <ArrowRight className="hidden sm:block w-4 h-4 opacity-30 absolute top-1/2 -right-2 -translate-y-1/2 translate-x-1/2 z-10" />
              )}
            </div>
          ))}
        </div>

        <SwimlaneDiagram flow={APPROVAL_FLOW} />

        <div className="mt-6 border border-primary/20 bg-primary/[0.03] p-4 flex items-center gap-3">
          <Lock className="w-4 h-4 text-primary shrink-0" />
          <p className="text-sm opacity-70">
            No credentials are ever stored to make this work. Approval just gates whether an already-authenticated
            step is allowed to run.
          </p>
        </div>
      </section>
    </div>
  );
}
