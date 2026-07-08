import { Link } from 'react-router-dom';
import { Terminal, Globe, FileText, Server, Shield, Database, Layout, Clock, DoorOpen, BookOpen, GraduationCap, Newspaper, KeyRound, Library, ArrowRight } from 'lucide-react';

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

/* ─── page ─────────────────────────────────────────────────── */

export default function Overview() {
  return (
    <div className="max-w-4xl mx-auto pb-20">

      {/* ── Section 1: Hero ─────────────────────────────────── */}
      <section className="pt-8 pb-16 border-b border-base-300">
        <h1
          className="font-display text-3xl sm:text-4xl font-bold tracking-tight leading-tight mb-4"
          style={{ textWrap: 'balance' } as React.CSSProperties}
        >
          Turn any website into a CLI command.
        </h1>
        <p className="text-base sm:text-lg opacity-70 max-w-[65ch] mb-8 leading-relaxed" style={{ textWrap: 'pretty' } as React.CSSProperties}>
          commandGarden reuses your existing browser sessions to extract structured data from authenticated websites — no API keys, no service accounts, no tokens burned. One command. Structured output. Every time.
        </p>
        <CodeBlock>{`npm install -g @commandgarden/cli`}</CodeBlock>
      </section>

      {/* ── Section 2: The Problem ──────────────────────────── */}
      <section className="py-16 border-b border-base-300">
        <SectionKicker>The real-world gap</SectionKicker>
        <h2 className="font-display text-xl font-bold uppercase tracking-[0.06em] mb-8">The Problem</h2>

        <div className="space-y-8 mb-10">
          <div>
            <h3 className="font-display font-semibold mb-2">AI agents need to interact with the real world</h3>
            <p className="text-sm opacity-70 max-w-[65ch] leading-relaxed">
              AI agents are powerful at reasoning and code generation, but they hit a wall when they need data from real-world systems: internal portals, enterprise tools, SaaS dashboards. These are the systems where actual work happens.
            </p>
          </div>

          <div>
            <h3 className="font-display font-semibold mb-2">APIs are the exception, not the rule</h3>
            <p className="text-sm opacity-70 max-w-[65ch] leading-relaxed">
              Not every site provides an API. When one exists, you often need a service account, manage secrets and certificates, and handle OAuth flows. Worse, the API may not expose the functionality you actually need — the data visible in the UI simply isn't available programmatically.
            </p>
          </div>

          <div>
            <h3 className="font-display font-semibold mb-2">Browser automation is expensive</h3>
            <p className="text-sm opacity-70 max-w-[65ch] leading-relaxed">
              AI agents do have browser tools (Playwright, Puppeteer, etc.), but driving a browser step-by-step is slow, fragile, and token-intensive. The agent must navigate pages, parse unstructured HTML, handle auth redirects, and spend thousands of tokens per interaction just to understand what's on screen.
            </p>
          </div>
        </div>

        <h3 className="font-display font-semibold text-sm mb-3">Current approaches fall short</h3>
        <div className="overflow-x-auto border border-base-300">
          <table className="table table-sm w-full">
            <thead>
              <tr className="bg-base-200">
                <th>Approach</th>
                <th>Strength</th>
                <th>Limitation</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="font-mono text-sm">AI Skills</td>
                <td className="text-sm opacity-70">Flexible, can do anything visible in the browser</td>
                <td className="text-sm opacity-70">Loose return format. AI parses raw page data every time. Burns tokens per call.</td>
              </tr>
              <tr>
                <td className="font-mono text-sm">MCP Servers</td>
                <td className="text-sm opacity-70">Stronger contract, typed schemas</td>
                <td className="text-sm opacity-70">Limited to what the server exposes. Agent manages auth tokens. Burns tokens per call.</td>
              </tr>
              <tr>
                <td className="font-mono text-sm">Browser tools</td>
                <td className="text-sm opacity-70">Full control of the browser</td>
                <td className="text-sm opacity-70">Extremely slow. Thousands of tokens per page. Fragile selectors.</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-sm opacity-50 mt-4 max-w-[65ch]">
          All three share the same fundamental problem: the AI agent is doing the parsing work, every single time, burning tokens to understand page structure that hasn't changed.
        </p>
      </section>

      {/* ── Section 3: The Solution ─────────────────────────── */}
      <section className="py-16 border-b border-base-300">
        <SectionKicker>How commandGarden works</SectionKicker>
        <h2 className="font-display text-xl font-bold uppercase tracking-[0.06em] mb-4">The Solution</h2>
        <p className="text-sm opacity-70 max-w-[65ch] leading-relaxed mb-10">
          Instead of making the AI agent figure out each website every time, we pre-define extraction recipes — called <strong className="text-base-content">connectors</strong> — that know exactly how to navigate a site and return structured data. The AI agent (or human user) just calls a CLI command and gets clean JSON back. Zero tokens spent on parsing. Zero credentials to manage.
        </p>

        <div className="space-y-8 mb-12">
          <div className="flex gap-4">
            <Globe className="w-5 h-5 shrink-0 mt-0.5 text-primary" />
            <div>
              <h3 className="font-display font-semibold mb-1">Reuse your browser session</h3>
              <p className="text-sm opacity-70 max-w-[60ch] leading-relaxed">
                commandGarden talks to a Chrome extension that runs in your already-authenticated browser. If you can see the data in Chrome, commandGarden can extract it. No credentials stored or transmitted.
              </p>
            </div>
          </div>

          <div className="flex gap-4">
            <FileText className="w-5 h-5 shrink-0 mt-0.5 text-primary" />
            <div>
              <h3 className="font-display font-semibold mb-1">Fixed-format parsing, done locally</h3>
              <p className="text-sm opacity-70 max-w-[60ch] leading-relaxed">
                Each connector defines a pipeline that produces the same structured output every time. The parsing logic runs locally in the extension and daemon. No data leaves your machine. No AI tokens consumed.
              </p>
            </div>
          </div>

          <div className="flex gap-4">
            <Terminal className="w-5 h-5 shrink-0 mt-0.5 text-primary" />
            <div>
              <h3 className="font-display font-semibold mb-1">One CLI for humans and AI agents</h3>
              <p className="text-sm opacity-70 max-w-[60ch] leading-relaxed mb-3">
                The same command works whether a human types it or an AI agent calls it via a skill. Structured JSON output with declared columns, every time.
              </p>
              <CodeBlock>{`cg run timetracking/report --month 2026-06 --format json`}</CodeBlock>
            </div>
          </div>
        </div>

        {/* Comparison table */}
        <h3 className="font-display font-semibold text-sm mb-3">How it compares</h3>
        <div className="overflow-x-auto border border-base-300">
          <table className="table table-sm w-full">
            <thead>
              <tr className="bg-base-200">
                <th></th>
                <th>commandGarden</th>
                <th>AI Skills</th>
                <th>MCP Servers</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['Return format', 'Fixed schema, declared columns', 'Loose, varies per run', 'Typed schema'],
                ['Parsing cost', 'Zero tokens (local pipeline)', 'Tokens per call', 'Tokens per call'],
                ['Auth handling', 'Reuses browser session', 'Agent navigates login flows', 'Agent manages tokens'],
                ['Processing', 'Local only', 'Cloud / agent-side', 'Server-side'],
                ['Privacy', 'Data stays on your machine', 'Data passes through AI', 'Data passes through server'],
                ['Coverage', 'Any website you can see', 'Any website (expensive)', 'Only what server exposes'],
              ].map(([label, cg, skills, mcp]) => (
                <tr key={label}>
                  <td className="font-mono text-xs font-medium">{label}</td>
                  <td className="text-sm text-primary font-medium">{cg}</td>
                  <td className="text-sm opacity-60">{skills}</td>
                  <td className="text-sm opacity-60">{mcp}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-sm opacity-50 mt-4 max-w-[65ch]">
          commandGarden isn't a replacement for skills or MCP — it's the engine underneath. The <span className="font-mono">cg</span> skill lets AI agents call commandGarden commands with zero overhead. Skills and MCP provide the integration layer; commandGarden handles the heavy lifting locally.
        </p>
      </section>

      {/* ── Section 4: Architecture ─────────────────────────── */}
      <section className="py-16 border-b border-base-300">
        <SectionKicker>Built for security and efficiency</SectionKicker>
        <h2 className="font-display text-xl font-bold uppercase tracking-[0.06em] mb-4">Architecture</h2>
        <p className="text-sm opacity-70 max-w-[65ch] leading-relaxed mb-10">
          Every component exists for a specific reason.
        </p>

        <div className="space-y-6 mb-10">
          {[
            {
              icon: Terminal,
              title: 'CLI',
              mono: 'cg',
              desc: 'The contact point for humans and AI agents. One command, one JSON output. Works the same whether typed in a terminal or called by a skill.',
            },
            {
              icon: Globe,
              title: 'Chrome Extension',
              mono: null,
              desc: 'Runs inside Chrome where you\'re already logged in. Accesses cookies, intercepts network responses, and reads page data using your existing authentication.',
            },
            {
              icon: FileText,
              title: 'Connectors',
              mono: 'YAML',
              desc: 'Declarative pipelines that define how to extract data from a site. Navigate → wait → extract → map. Same operations, same format, every time. No code execution by default.',
            },
            {
              icon: Server,
              title: 'Daemon',
              mono: 'localhost:9091',
              desc: 'The orchestrator. Validates every command against declared domains and capabilities before relaying to the extension. Never exposed to the network.',
            },
            {
              icon: Shield,
              title: 'Configuration',
              mono: 'config.yaml',
              desc: 'Security policy you control. Defines which domains are allowed, which capabilities require approval, and which connectors are trusted.',
            },
            {
              icon: Database,
              title: 'Audit Log',
              mono: 'SQLite',
              desc: 'Every command execution is logged: connector, domains, row count, step timing, approval decisions. Sensitive values automatically redacted.',
            },
            {
              icon: Layout,
              title: 'App Server + GUI',
              mono: 'localhost:9092',
              desc: 'React SPA with dedicated app pages, connector browsing, audit log, and configuration management. Uses the same API as the CLI.',
            },
          ].map(({ icon: Icon, title, mono, desc }) => (
            <div key={title} className="flex gap-4">
              <Icon className="w-4 h-4 shrink-0 mt-1 opacity-40" />
              <div>
                <div className="flex items-baseline gap-2 mb-1">
                  <span className="font-display font-semibold text-sm">{title}</span>
                  {mono && <span className="font-mono text-xs opacity-40">{mono}</span>}
                </div>
                <p className="text-sm opacity-70 max-w-[60ch] leading-relaxed">{desc}</p>
              </div>
            </div>
          ))}
        </div>

        <CodeBlock>{`CLI / GUI  →  Daemon (localhost)  ←→  Chrome Extension  →  Browser Tab
                  ↕                                            ↕
            Audit Log (SQLite)                          Your authenticated
            App DB (SQLite)                             browser session
            Config (YAML)`}</CodeBlock>
      </section>

      {/* ── Section 5: Built-in Apps ────────────────────────── */}
      <section className="py-16 border-b border-base-300">
        <SectionKicker>Ready-to-use tools</SectionKicker>
        <h2 className="font-display text-xl font-bold uppercase tracking-[0.06em] mb-4">Built-in Apps</h2>
        <p className="text-sm opacity-70 max-w-[65ch] leading-relaxed mb-8">
          commandGarden ships with connectors and dedicated app pages for common enterprise tasks. Each one runs entirely on your local machine using your browser session.
        </p>

        <div className="space-y-1">
          {([
            { icon: Clock, title: 'Time Tracking', desc: 'Monthly report with project breakdown and summary cards', route: '/apps/timetracking', cmd: 'cg run timetracking/report --month 2026-06' },
            { icon: DoorOpen, title: 'Room Availability', desc: 'Meeting room free/busy timeline from Outlook Scheduling Assistant', route: '/apps/rooms', cmd: 'cg run teams/room-availability --room "The Vista"' },
            { icon: BookOpen, title: 'Dev Journal', desc: 'Auto-generated daily journal from Git commits and Jira tickets', route: '/apps/journal', cmd: 'cg run ado/git-commits' },
            { icon: GraduationCap, title: 'Saba Training', desc: 'Pending training courses from your Saba Learning portal', route: '/apps/saba', cmd: 'cg run saba/pending-training' },
            { icon: Newspaper, title: 'Security News', desc: 'Aggregated feed from Socket.dev, Wiz, and tl;dr sec', route: '/apps/security-news', cmd: 'cg run socket/security-news' },
            { icon: KeyRound, title: 'Trusted Peer Expiry', desc: 'TokenMaster client trust relationships with expiry tracking', route: '/apps/trusted-peer-expiry', cmd: 'cg run tokenmaster/clients-list' },
            { icon: Library, title: 'GCS Knowledge Base', desc: 'Browse and read internal security docs, converted to Markdown', route: null, cmd: 'cg run gcs/kb-pages' },
          ] as const).map(({ icon: Icon, title, desc, route, cmd }) => (
            <div key={title} className="border border-base-300 p-4 flex flex-col sm:flex-row sm:items-center gap-3">
              <Icon className="w-4 h-4 shrink-0 opacity-40" />
              <div className="flex-1 min-w-0">
                <span className="font-display font-semibold text-sm">{title}</span>
                <span className="text-sm opacity-50 ml-2">{desc}</span>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="font-mono text-xs opacity-30 hidden lg:inline">{cmd}</span>
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
          Each app page combines multiple connector calls into a cohesive interface. The GUI handles orchestration, caching, and presentation — the connectors provide the raw data.
        </p>
      </section>

      {/* ── Section 6: Happy Path ───────────────────────────── */}
      <section className="py-16 border-b border-base-300">
        <SectionKicker>How it works in practice</SectionKicker>
        <h2 className="font-display text-xl font-bold uppercase tracking-[0.06em] mb-8">Happy Path</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h3 className="font-display font-semibold text-sm mb-3">Human user</h3>
            <CodeBlock>{`# Install
npm install -g @commandgarden/cli

# Start everything
cg up

# Load extension in Chrome
chrome://extensions → Load unpacked

# Verify
cg daemon status

# Run a connector
cg run timetracking/report \\
  --month 2026-06 --format table`}</CodeBlock>
            <p className="text-xs opacity-50 mt-3">
              Or open the GUI at <span className="font-mono">localhost:9092</span> and use the visual interface.
            </p>
          </div>

          <div>
            <h3 className="font-display font-semibold text-sm mb-3">AI agent</h3>
            <CodeBlock>{`# Agent loads the cg skill
# Then calls:

cg daemon status
# → confirms system is ready

cg list
# → discovers available connectors

cg inspect timetracking/report
# → sees args and columns

cg run timetracking/report \\
  --month 2026-06 --format json
# → { ok: true, rowCount: 42, data: [...] }`}</CodeBlock>
            <p className="text-xs opacity-50 mt-3">
              No page parsing, no token cost. Structured JSON back in seconds.
            </p>
          </div>
        </div>
      </section>

      {/* ── Section 7: Security ─────────────────────────────── */}
      <section className="py-16 border-b border-base-300">
        <SectionKicker>Security by design</SectionKicker>
        <h2 className="font-display text-xl font-bold uppercase tracking-[0.06em] mb-4">Security</h2>
        <p className="text-sm opacity-70 max-w-[65ch] leading-relaxed mb-10">
          commandGarden handles sensitive enterprise data. Every design decision prioritizes security and privacy.
        </p>

        <div className="space-y-6 mb-10">
          {[
            { title: 'No credentials stored or transmitted', desc: 'Reuses session cookies and tokens already present in your Chrome browser. Nothing stored on disk, nothing sent to external servers.' },
            { title: 'Domain-scoped permissions', desc: 'Every connector declares exactly which domains it will access. The daemon validates each request — if a connector tries to reach an undeclared domain, the command is blocked.' },
            { title: 'Capability declarations', desc: 'Connectors declare what they need: navigate, dom_read, cookie_read, js_evaluate. High-risk capabilities are blocked by default until explicitly approved.' },
            { title: 'Step-by-step approval', desc: 'Sensitive operations can pause and wait for your confirmation. Approve in the CLI terminal or via Chrome extension notification.' },
            { title: 'Local-only processing', desc: 'Daemon on localhost:9091, app server on localhost:9092. No ports exposed to the network. All processing happens on your machine.' },
            { title: 'Declarative connectors', desc: 'Most connectors are pure YAML: navigate, wait, extract, map. No JavaScript evaluation, no arbitrary code by default.' },
            { title: 'Comprehensive audit trail', desc: 'Every execution is logged to local SQLite: connector name, domains accessed, row count, step timing, approval decisions. Sensitive values are automatically redacted.' },
            { title: 'Per-session auth tokens', desc: 'CLI-to-daemon communication uses a session token generated on startup with owner-only file permissions. The extension verifies its own ID in every message.' },
          ].map(({ title, desc }) => (
            <div key={title}>
              <h3 className="font-display font-semibold text-sm mb-1">{title}</h3>
              <p className="text-sm opacity-70 max-w-[60ch] leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>

        <div className="border border-base-300 bg-base-200/50 p-5">
          <h3 className="font-mono text-xs font-medium opacity-50 uppercase tracking-wide mb-3">What we don't do</h3>
          <div className="space-y-1.5 text-sm opacity-70">
            <p>We don't store credentials.</p>
            <p>We don't transmit data to external servers.</p>
            <p>We don't execute arbitrary code by default.</p>
            <p>We don't grant ambient access to all websites.</p>
            <p>We don't skip logging, ever.</p>
          </div>
        </div>
      </section>

      {/* ── Section 8: Get Started ──────────────────────────── */}
      <section className="py-16 border-b border-base-300">
        <h2 className="font-display text-xl font-bold uppercase tracking-[0.06em] mb-4">Get started in 60 seconds</h2>

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
          <Link to="/api-reference" className="font-mono text-xs text-primary hover:underline flex items-center gap-1">
            API &amp; CLI Reference <ArrowRight className="w-3 h-3" />
          </Link>
          <Link to="/skills" className="font-mono text-xs text-primary hover:underline flex items-center gap-1">
            Skills <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      </section>

      {/* ── Section 9: Extend ───────────────────────────────── */}
      <section className="pt-16">
        <SectionKicker>Extend to any website</SectionKicker>
        <h2 className="font-display text-xl font-bold uppercase tracking-[0.06em] mb-4">Write Your Own Connector</h2>
        <p className="text-sm opacity-70 max-w-[65ch] leading-relaxed mb-8">
          commandGarden ships with built-in connectors, but the real power is creating your own. If you can see it in Chrome, you can turn it into a CLI command.
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
          No JavaScript required for most connectors. The declarative YAML format covers DOM extraction, cookie-authenticated API calls, network interception, and data transformation.
        </p>
      </section>

    </div>
  );
}
