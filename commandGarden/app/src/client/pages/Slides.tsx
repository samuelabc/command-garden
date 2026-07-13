import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Globe, XCircle, AlertCircle, Lock, Bot,
  Terminal, Server, Shield, Database,
  Layout, FileText, Eye, Fingerprint, EyeOff,
  BookOpen, ChevronLeft, ChevronRight, Snail, Coins,
} from 'lucide-react';
import { Badge } from '../components/Badge';

/* ─── slide shell ──────────────────────────────────────────── */

function SlideShell({
  children,
  kicker,
  title,
}: {
  children: React.ReactNode;
  kicker: string;
  title: string;
}) {
  return (
    <div className="h-full flex flex-col justify-center px-8 sm:px-16 lg:px-24 max-w-6xl mx-auto mt-16 w-full">
      <div className="font-mono text-xs font-medium opacity-40 uppercase tracking-[0.12em] mb-3">
        {kicker}
      </div>
      <h2
        className="font-display text-3xl sm:text-4xl font-bold uppercase tracking-[0.04em] mb-10"
        style={{ textWrap: 'balance' } as React.CSSProperties}
      >
        {title}
      </h2>
      {children}
    </div>
  );
}

/* ─── slide 1: the problem ─────────────────────────────────── */

const PROBLEMS = [
  {
    icon: Globe,
    headline: 'Browsers are the primary data interface',
    body: 'The data you need lives in SaaS dashboards and internal portals, not in APIs. If it\'s behind a login, agents can\'t see it.',
    color: 'text-primary',
    border: 'border-primary/20',
  },
  {
    icon: XCircle,
    headline: 'APIs are limited and often unavailable',
    body: 'Most internal tools don\'t have APIs. When one exists, you need service accounts, OAuth flows, and IT approval before seeing a single row.',
    color: 'text-error',
    border: 'border-error/20',
  },
  {
    icon: Lock,
    headline: 'Authentication blocks automation',
    body: 'SSO, MFA, session cookies, corporate proxies. You\'re already logged in. The automation isn\'t.',
    color: 'text-warning',
    border: 'border-warning/20',
  },
  {
    icon: AlertCircle,
    headline: 'AI browser automation is slow and burns tokens',
    body: 'Agents re-parse the full page on every call to figure out what\'s on screen, even when the layout hasn\'t changed.',
    color: 'text-secondary',
    border: 'border-secondary/20',
  },
];

function SlideProblem() {
  return (
    <SlideShell kicker="Where the data actually lives" title="The Problem">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {PROBLEMS.map(({ icon: Icon, headline, body, color, border }) => (
          <div key={headline} className={`border ${border} p-6 flex gap-4`}>
            <Icon className={`w-5 h-5 shrink-0 mt-0.5 ${color}`} />
            <div>
              <h3 className="font-display font-semibold text-base mb-2">{headline}</h3>
              <p className="text-sm opacity-60 leading-relaxed">{body}</p>
            </div>
          </div>
        ))}
      </div>
      <p className="text-sm opacity-40 mt-8 max-w-[65ch]">
        That parsing only needs to happen once.
      </p>
    </SlideShell>
  );
}

/* ─── slide 2: the solution? ──────────────────────────────── */

const EXISTING_SOLUTION = [
  {
    icon: Bot,
    headline: 'Use AI to navigate the browser',
    body: 'Playwright, Puppeteer, or an LLM-driven agent opens a headless browser and clicks through pages like a user would.',
    color: 'text-primary',
    border: 'border-primary/20',
  },
  {
    icon: Lock,
    headline: 'Blocked by authentication',
    body: 'Headless browsers start logged out. SSO, MFA, and session cookies don\'t carry over. You\'re back to storing credentials or managing auth flows.',
    color: 'text-error',
    border: 'border-error/20',
  },
  {
    icon: Snail,
    headline: 'Slow and fragile',
    body: 'Each run launches a browser, waits for renders, retries on flaky selectors. A single DOM change can break the whole flow.',
    color: 'text-warning',
    border: 'border-warning/20',
  },
  {
    icon: Coins,
    headline: 'High token consumption',
    body: 'The agent sends page snapshots to an LLM to decide what to click next. Every interaction costs tokens, even for pages it\'s seen before.',
    color: 'text-secondary',
    border: 'border-secondary/20',
  },
  {
    icon: EyeOff,
    headline: 'Limited visibility into actions',
    body: 'No audit trail. You can\'t see which pages were visited, what data was read, or whether the agent went somewhere it shouldn\'t have.',
    color: 'text-error',
    border: 'border-error/20',
  },
];

function SlideSolution() {
  return (
    <SlideShell kicker="The existing approach" title='The "Solution"?'>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* First card spans full width as the premise */}
        {[EXISTING_SOLUTION[0]].map(({ icon: Icon, headline, body, color, border }) => (
          <div key={headline} className={`border ${border} p-6 flex gap-4 md:col-span-2`}>
            <Icon className={`w-5 h-5 shrink-0 mt-0.5 ${color}`} />
            <div>
              <h3 className="font-display font-semibold text-base mb-2">{headline}</h3>
              <p className="text-sm opacity-60 leading-relaxed">{body}</p>
            </div>
          </div>
        ))}
        {EXISTING_SOLUTION.slice(1).map(({ icon: Icon, headline, body, color, border }) => (
          <div key={headline} className={`border ${border} p-6 flex gap-4`}>
            <Icon className={`w-5 h-5 shrink-0 mt-0.5 ${color}`} />
            <div>
              <h3 className="font-display font-semibold text-base mb-2">{headline}</h3>
              <p className="text-sm opacity-60 leading-relaxed">{body}</p>
            </div>
          </div>
        ))}
      </div>
    </SlideShell>
  );
}

/* ─── slide 3: batteries included ──────────────────────────── */

const BATTERIES = [
  {
    icon: Terminal,
    title: 'CLI',
    mono: 'cg run · cg list · cg inspect',
    desc: 'Same command for humans and agents. One call in, structured JSON out.',
  },
  {
    icon: Server,
    title: 'Daemon',
    mono: 'Fastify :9091',
    desc: 'Validates auth, loads the connector registry, routes requests, writes audit log.',
  },
  {
    icon: Globe,
    title: 'Chrome Extension',
    mono: 'Manifest V3',
    desc: 'Runs inside your authenticated browser. Reads cookies, DOM, and network responses.',
  },
  {
    icon: Layout,
    title: 'App Server + GUI',
    mono: 'React SPA :9092',
    desc: 'Dashboard, app pages, connector browser, config management. All on localhost.',
  },
  {
    icon: FileText,
    title: 'Connectors',
    mono: '13 YAML pipelines',
    desc: 'Declarative recipes: navigate → wait → extract → map. No code unless declared.',
  },
  {
    icon: BookOpen,
    title: 'Skills',
    mono: 'cg skill · connector-authoring',
    desc: 'Agents discover, inspect, and run connectors. Two bundled skills ship with the CLI.',
  },
  {
    icon: Database,
    title: 'Audit Log',
    mono: 'SQLite',
    desc: 'Every execution logged: connector, domains, timing, approvals, row counts. Audit-or-fail.',
  },
  {
    icon: Shield,
    title: 'Security Controls',
    mono: '7 capabilities · 3 risk tiers',
    desc: 'Domain-scoped allowlists, step-by-step approval gates, per-session auth tokens.',
  },
];

const CAPABILITIES = [
  { name: 'navigate', risk: 'low' as const },
  { name: 'dom_read', risk: 'low' as const },
  { name: 'cookie_read', risk: 'medium' as const },
  { name: 'dom_write', risk: 'medium' as const },
  { name: 'intercept_response', risk: 'medium' as const },
  { name: 'cookie_write', risk: 'high' as const },
  { name: 'js_evaluate', risk: 'high' as const },
];

const riskVariant: Record<string, 'success' | 'warning' | 'error'> = {
  low: 'success',
  medium: 'warning',
  high: 'error',
};

function SlideBatteries() {
  return (
    <SlideShell kicker="Everything ships together" title="Batteries Included">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {BATTERIES.map(({ icon: Icon, title, mono, desc }) => (
          <div key={title} className="border border-base-300 p-4 flex flex-col">
            <div className="flex items-center gap-2 mb-2">
              <Icon className="w-4 h-4 shrink-0 opacity-40" />
              <span className="font-display font-semibold text-sm">{title}</span>
            </div>
            <span className="font-mono text-[0.65rem] opacity-35 mb-2 leading-tight">{mono}</span>
            <p className="text-xs opacity-55 leading-relaxed mt-auto">{desc}</p>
          </div>
        ))}
      </div>

      {/* Capability risk tiers strip */}
      <div className="border border-base-300 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Fingerprint className="w-4 h-4 opacity-40" />
          <span className="font-display font-semibold text-sm">Capability risk tiers</span>
          <Eye className="w-3.5 h-3.5 opacity-30 ml-auto" />
          <span className="text-[0.6rem] font-mono opacity-30">approval gate per step</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {CAPABILITIES.map(({ name, risk }) => (
            <Badge key={name} variant={riskVariant[risk]} size="xs">
              {name} <span className="opacity-50 ml-1">{risk}</span>
            </Badge>
          ))}
        </div>
      </div>
    </SlideShell>
  );
}

/* ─── slide deck ───────────────────────────────────────────── */

const SLIDES = [SlideProblem, SlideSolution, SlideBatteries];

export default function Slides() {
  const [current, setCurrent] = useState(0);
  const [transitioning, setTransitioning] = useState(false);
  const navigate = useNavigate();
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const goTo = useCallback((next: number) => {
    if (next < 0 || next >= SLIDES.length || next === current) return;
    setTransitioning(true);
    timeoutRef.current = setTimeout(() => {
      setCurrent(next);
      setTransitioning(false);
    }, 150);
  }, [current]);

  useEffect(() => () => clearTimeout(timeoutRef.current), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); goTo(current + 1); }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); goTo(current - 1); }
      if (e.key === 'Escape') navigate('/');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goTo, current, navigate]);

  const Slide = SLIDES[current];

  return (
    <div className="fixed inset-0 z-50 bg-base-100 flex flex-col select-none">
      {/* Slide content */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div
          className={`min-h-full flex transition-opacity duration-150 ${
            transitioning ? 'opacity-0' : 'opacity-100'
          }`}
        >
          <Slide />
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between px-6 py-3 border-t border-base-300 bg-base-100">
        <button
          className="btn btn-ghost btn-sm gap-1 font-mono text-xs"
          onClick={() => goTo(current - 1)}
          disabled={current === 0}
        >
          <ChevronLeft className="w-4 h-4" /> Prev
        </button>

        <div className="flex items-center gap-2">
          {SLIDES.map((_, i) => (
            <button
              key={i}
              onClick={() => goTo(i)}
              className={`w-2 h-2 transition-colors ${
                i === current ? 'bg-primary' : 'bg-base-300 hover:bg-base-content/20'
              }`}
              aria-label={`Slide ${i + 1}`}
            />
          ))}
          <span className="font-mono text-[0.65rem] opacity-30 ml-2">
            {current + 1} / {SLIDES.length}
          </span>
        </div>

        <button
          className="btn btn-ghost btn-sm gap-1 font-mono text-xs"
          onClick={() => goTo(current + 1)}
          disabled={current === SLIDES.length - 1}
        >
          Next <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
