# commandGarden — Landing Page Script

Content script for the commandGarden overview / marketing / landing page in the GUI. Each section defines the headline, body copy, and supporting content. No visual design — this is the narrative blueprint.

---

## Section 1: Hero

**Headline:**
> Turn any website into a CLI command.

**Subheadline:**
> commandGarden reuses your existing browser sessions to extract structured data from authenticated websites — no API keys, no service accounts, no tokens burned. One command. Structured output. Every time.

**CTA:** `npm install -g @commandgarden/cli` / "Get Started"

---

## Section 2: The Problem

**Section title:** "The real-world gap"

### Pain point 1 — AI agents need to interact with the real world

AI agents are powerful at reasoning and code generation, but they hit a wall when they need data from real-world systems: internal portals, enterprise tools, SaaS dashboards. These are the systems where actual work happens.

### Pain point 2 — APIs are the exception, not the rule

Not every site provides an API. When one exists, you often need a service account, manage secrets and certificates, and handle OAuth flows. Worse, the API may not expose the functionality you actually need — the data visible in the UI simply isn't available programmatically.

### Pain point 3 — Browser automation is expensive

AI agents do have browser tools (Playwright, Puppeteer, etc.), but driving a browser step-by-step is slow, fragile, and token-intensive. The agent must:
- Navigate pages, wait for loads, find elements
- Parse unstructured HTML into usable data
- Handle auth redirects, popups, and dynamic content
- Spend thousands of tokens per interaction just to understand what's on screen

### Pain point 4 — Current integration approaches fall short

| Approach | What it does well | Where it struggles |
|---|---|---|
| **AI Skills** (browser-driving skills) | Flexible, can do anything visible in the browser | Loose return format. AI must parse raw page data every time. Requires agent operation. Burns tokens per call. |
| **MCP Servers** | Stronger contract, typed schemas | Limited to what the MCP server exposes. Agent must manage auth tokens. Requires agent operation. Burns tokens per call. |
| **Direct browser tools** | Full control of the browser | Extremely slow. Thousands of tokens per page. Fragile selectors. No caching or structure. |

All three share the same fundamental problem: **the AI agent is doing the parsing work, every single time, burning tokens to understand page structure that hasn't changed.**

---

## Section 3: The Solution

**Section title:** "How commandGarden works"

**Lead copy:**
> commandGarden takes a different approach. Instead of making the AI agent figure out each website every time, we pre-define extraction recipes — called **connectors** — that know exactly how to navigate a site and return structured data. The AI agent (or human user) just calls a CLI command and gets clean JSON back. Zero tokens spent on parsing. Zero credentials to manage.

### Key insight 1 — Reuse your browser session

Many enterprise sites sit behind SSO, MFA, or corporate proxies. commandGarden doesn't store or transmit your credentials. Instead, it talks to a Chrome extension that runs in your already-authenticated browser. If you can see the data in Chrome, commandGarden can extract it.

### Key insight 2 — Fixed-format parsing, done locally

Each connector defines a pipeline — navigate, wait, extract, map — that produces the same structured output every time. The parsing logic runs locally in the browser extension and daemon. No data leaves your machine. No AI tokens are consumed for data extraction. Good for privacy, good for cost.

### Key insight 3 — One CLI for humans and AI agents

`cg run timetracking/report --month 2026-06 --format json` — the same command works whether a human types it in a terminal or an AI agent calls it via a skill. Structured JSON output with declared columns, every time.

### Comparison table

| | commandGarden | AI Skills | MCP Servers |
|---|---|---|---|
| **Return format** | Fixed schema, declared columns | Loose, varies per run | Typed schema |
| **Parsing cost** | Zero tokens (local pipeline) | Tokens per call (AI parses page) | Tokens per call (AI processes response) |
| **Auth handling** | Reuses browser session | Agent must navigate login flows | Agent manages tokens/secrets |
| **Processing** | Local only (browser + daemon) | Cloud/agent-side | Server-side |
| **Privacy** | Data stays on your machine | Data passes through AI | Data passes through server |
| **Coverage** | Any website you can see in Chrome | Any website (but expensive) | Only what the server exposes |
| **Integration** | CLI + skills + MCP (complementary) | Standalone | Standalone |

**Key message:** commandGarden isn't a replacement for skills or MCP — it's the engine underneath. The `cg` skill lets AI agents call commandGarden commands with zero browser automation overhead. MCP servers can wrap `cg` commands for typed integration. commandGarden handles the heavy lifting locally; skills and MCP provide the integration layer.

---

## Section 4: Architecture

**Section title:** "Built for security and efficiency"

**Lead copy:**
> Every component exists for a specific reason. Here's why.

### Component breakdown

**CLI (`cg`)** — The contact point for humans and AI agents. We wanted a single, efficient interface that returns structured data in a fixed format. The CLI gives both human users and AI agents a consistent way to interact with real-world systems. One command, one JSON output.

**Chrome Extension** — We need to reuse your existing browser session. The extension runs inside Chrome where you're already logged in — it accesses cookies, intercepts network responses, and reads page data using the same authentication your browser already has. No credentials stored.

**Connectors (YAML)** — We want to define once how to extract data from a site, and reuse it forever. Connectors are declarative YAML files that describe a pipeline: navigate → wait → extract → map. The same operations, the same data format, every time. No code execution in the default mode — the safest connectors use only DOM reads and cookie-authenticated fetch calls.

**Daemon (Fastify server)** — The daemon is the orchestrator. It validates every command against declared domains and capabilities before relaying to the extension. It runs on `localhost:9091` — never exposed to the network.

**Configuration file** — Security policy belongs in a file you control. The config defines which domains are allowed, which capabilities require approval, and which connectors are trusted. High-risk operations (JavaScript evaluation, cookie writes) are blocked by default until explicitly approved.

**Audit Log (SQLite)** — Every command execution is logged: what connector ran, which domains were accessed, how many rows returned, how long each pipeline step took. Sensitive values (passwords, tokens, API keys) are automatically redacted. The audit trail is local — same privacy model as the rest of the system.

**App Server + GUI** — For users who prefer a visual interface, the app server provides a React SPA with dedicated app pages, connector browsing, audit log viewing, and configuration management. The GUI uses the same API as the CLI — no special access.

### Architecture diagram (content reference)

```
CLI / GUI  →  Daemon (localhost)  ←→  Chrome Extension  →  Browser Tab
                  ↕                                            ↕
            Audit Log (SQLite)                          Your authenticated
            App DB (SQLite)                             browser session
            Config (YAML)
```

---

## Section 5: Built-in Apps

**Section title:** "Ready-to-use tools"

**Lead copy:**
> commandGarden ships with connectors and dedicated app pages for common enterprise tasks. Each one runs entirely on your local machine using your browser session.

### App cards (each card: icon, title, one-liner, connector key)

1. **Time Tracking** — Monthly timetracking report with project breakdown, summary cards, and grouped-by-project table. `cg run timetracking/report --month 2026-06`

2. **Room Availability** — Meeting room free/busy timeline from Outlook Scheduling Assistant. Select a room, pick a date, see availability blocks. `cg run teams/room-availability --room "MBTMY The Vista"`

3. **Dev Journal** — Auto-generated daily development journal from your Git commits and Jira tickets. `cg run ado/git-commits` + `cg run jira/my-tickets`

4. **Saba Training** — Pending training courses from your Saba Learning portal. `cg run saba/pending-training`

5. **Security News** — Aggregated security feed from Socket.dev, Wiz, and tl;dr sec with source indicators and date filtering. `cg run socket/security-news`

6. **Trusted Peer Expiry** — TokenMaster client trust relationships with expiry tracking. `cg run tokenmaster/clients-list` + `cg run tokenmaster/client-trustedby`

7. **GCS Knowledge Base** — Browse and read internal security documentation, converted to Markdown. `cg run gcs/kb-pages` + `cg run gcs/kb-content --path ...`

**Key message:** Each app page combines multiple connector calls into a cohesive, purpose-built interface. The GUI handles orchestration, caching, and presentation — the connectors provide the raw data.

---

## Section 6: Happy Path

**Section title:** "How it works in practice"

### Human user flow

```
1. Install:     npm install -g @commandgarden/cli
2. Start:       cg up
3. Load ext:    Chrome → chrome://extensions → Load unpacked → chrome/dist/
4. Verify:      cg daemon status → "Daemon: running, Extension: connected"
5. Browse:      cg list → see all available connectors
6. Run:         cg run timetracking/report --month 2026-06 --format table
7. Get data:    Structured table printed to terminal — done in seconds
```

Or open the GUI at `http://127.0.0.1:9092` and use the visual interface: click a connector, fill in the form, see the results.

### AI agent flow

```
1. Agent loads the `cg` skill (skills/cg/SKILL.md)
2. Agent calls: cg daemon status → confirms system is ready
3. Agent calls: cg list → discovers available connectors
4. Agent calls: cg inspect timetracking/report → sees args and columns
5. Agent calls: cg run timetracking/report --month 2026-06 --format json
6. Agent parses JSON: { ok: true, rowCount: 42, data: [...] }
7. Agent uses structured data directly — no page parsing, no token cost
```

**Key message:** Same tool, same connectors, same output format. The AI agent doesn't need to drive a browser, parse HTML, or manage authentication. It just calls `cg run` and gets structured JSON back. The skill wrapping `cg` gives the agent all the context it needs: which connectors exist, what arguments they take, what columns they return.

---

## Section 7: Security

**Section title:** "Security by design"

**Lead copy:**
> commandGarden handles sensitive enterprise data. Every design decision prioritizes security and privacy.

### Security features

**No credentials stored or transmitted.** commandGarden never sees your password. It reuses the session cookies and tokens already present in your Chrome browser. Nothing is stored on disk, nothing is sent to external servers.

**Domain-scoped permissions.** Every connector declares exactly which domains it will access. The daemon validates each request — if a connector tries to reach a domain not in its declaration, the command is blocked. No ambient access.

**Capability declarations.** Connectors declare what they need: `navigate`, `dom_read`, `cookie_read`, `js_evaluate`, etc. High-risk capabilities (`js_evaluate`, `cookie_write`) are blocked by default. You must explicitly approve each connector that uses them.

**Step-by-step approval.** For sensitive operations, pipeline steps can be configured to pause and wait for your confirmation before executing. You approve in the CLI terminal or via a Chrome extension notification. Either surface works — whichever you respond to first resolves the gate.

**Local-only processing.** The daemon runs on `localhost:9091`. The app server runs on `localhost:9092`. No ports are exposed to the network. All data processing happens on your machine.

**Declarative connectors — no code execution by default.** Most connectors are pure YAML: navigate, wait, extract, map. No JavaScript evaluation, no arbitrary code. The safest connectors (`cookie_read` + `fetch`) never even touch the DOM.

**Comprehensive audit trail.** Every command execution is logged to a local SQLite database: connector name, domains accessed, row count, step-by-step timing, approval decisions. Sensitive argument values (tokens, passwords, API keys) are automatically redacted. The audit system is fail-safe — if the log is unavailable, commands are blocked entirely.

**Per-session auth tokens.** Communication between CLI/GUI and daemon uses a session token generated on daemon startup and stored with owner-only file permissions. The Chrome extension verifies its own extension ID in every WebSocket message.

### What we don't do

- We don't store credentials
- We don't transmit data to external servers
- We don't execute arbitrary code by default
- We don't grant ambient access to all websites
- We don't skip logging, ever

---

## Section 8: Get Started

**Section title:** "Get started in 60 seconds"

```bash
# Install
npm install -g @commandgarden/cli

# Start the daemon and GUI
cg up

# Load the Chrome extension
# Chrome → chrome://extensions → Developer mode → Load unpacked → chrome/dist/

# Run your first connector
cg run socket/security-news --format table
```

**Links:**
- GitHub repository
- npm package: `@commandgarden/cli`
- Documentation: Architecture, API Reference, Connector Authoring Guide
- Skills: `cg` skill for AI agents, connector-authoring skill for creating new connectors

---

## Section 9: Write Your Own Connector

**Section title:** "Extend to any website"

**Body copy:**
> commandGarden ships with built-in connectors, but the real power is creating your own. If you can see it in Chrome, you can turn it into a CLI command.

**Steps (brief):**
1. Create a YAML file in `~/.commandgarden/connectors/`
2. Declare the domain, capabilities, arguments, and columns
3. Define a pipeline: navigate → wait → extract/fetch → map
4. Validate with `cg validate my-connector.yaml`
5. Run: `cg run mysite/my-command --format json`

**Key message:** No JavaScript required for most connectors. The declarative YAML format covers DOM extraction, cookie-authenticated API calls, network interception, and data transformation. For complex cases, `js_evaluate` is available with explicit approval.

---

## Page flow summary

| # | Section | Purpose | Emotional beat |
|---|---|---|---|
| 1 | Hero | Hook — what it is in one line | Curiosity |
| 2 | The Problem | Why this matters — pain points | Recognition ("I've hit this wall") |
| 3 | The Solution | How it works + comparison | Relief ("this solves it cleanly") |
| 4 | Architecture | Why each component exists | Trust ("thoughtfully designed") |
| 5 | Built-in Apps | What you get out of the box | Desire ("I want this") |
| 6 | Happy Path | How to use it (human + AI) | Confidence ("I can do this") |
| 7 | Security | Why you can trust it | Assurance ("this is safe") |
| 8 | Get Started | Install and run | Action |
| 9 | Extend | Write your own connectors | Empowerment |
