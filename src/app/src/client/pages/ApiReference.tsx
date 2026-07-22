import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Badge, type BadgeVariant } from '../components/Badge';

type TabId = 'daemon-api' | 'app-api' | 'cli';

const METHOD_VARIANT: Record<string, BadgeVariant> = {
  GET: 'success',
  POST: 'warning',
  PUT: 'info',
  DELETE: 'error',
  WS: 'secondary',
  SSE: 'secondary',
};

interface Endpoint {
  method: string;
  path: string;
  auth: boolean;
  desc: string;
  params?: string;
  body?: string;
  response?: string;
}

interface CliCmd {
  cmd: string;
  desc: string;
  args?: string;
  opts?: string[];
  example?: string;
}

const DAEMON_ENDPOINTS: Endpoint[] = [
  { method: 'GET', path: '/api/status', auth: false, desc: 'Health check. Returns daemon status, extension connection, and connector count.' },
  { method: 'GET', path: '/api/connectors', auth: true, desc: 'List all loaded connectors with key, description, access, domains, and capabilities.' },
  { method: 'GET', path: '/api/connectors/:site/:name', auth: true, desc: 'Full connector definition including pipeline, args, and columns.', params: 'site, name — connector key segments' },
  { method: 'POST', path: '/api/run', auth: true, desc: 'Execute a connector pipeline. Returns structured data. Returns 202 with requestId if step approval is required.', body: '{ connector: string, args: Record<string, string> }' },
  { method: 'GET', path: '/api/audit', auth: true, desc: 'List audit events with optional filters.', params: 'since?, connector?, type?, limit?' },
  { method: 'GET', path: '/api/audit/:id', auth: true, desc: 'Single audit event with full detail including pipeline steps.' },
  { method: 'GET', path: '/api/config', auth: true, desc: 'Read the full config.yaml as JSON.' },
  { method: 'POST', path: '/api/config', auth: true, desc: 'Set a config value. Key must be section.property format.', body: '{ key: string, value: string }' },
  { method: 'POST', path: '/api/approval', auth: true, desc: 'Resolve a pending step approval.', body: '{ approvalId: string, approved: boolean }' },
  { method: 'SSE', path: '/api/run/events/:requestId', auth: true, desc: 'Server-Sent Events stream for approval-required runs. Sends approval and result events.' },
  { method: 'WS', path: '/ws/extension', auth: false, desc: 'WebSocket endpoint for Chrome Extension. Origin validated against security.extensionId.' },
];

const APP_ENDPOINTS: Endpoint[] = [
  { method: 'GET', path: '/api/status', auth: false, desc: 'Proxied daemon status (same as daemon /api/status).' },
  { method: 'GET', path: '/api/connectors', auth: false, desc: 'Enriched connector list with hasAppPage, appRoute, isHighRisk, isApproved, isAutoApproved.' },
  { method: 'GET', path: '/api/connectors/:site/:name', auth: false, desc: 'Proxied connector detail.' },
  { method: 'POST', path: '/api/run', auth: false, desc: 'Proxied connector execution.' },
  { method: 'GET', path: '/api/audit', auth: false, desc: 'Proxied audit event list.' },
  { method: 'GET', path: '/api/audit/:id', auth: false, desc: 'Proxied single audit event.' },
  { method: 'GET', path: '/api/config', auth: false, desc: 'Proxied config read.' },
  { method: 'POST', path: '/api/config', auth: false, desc: 'Proxied config write.' },
  { method: 'POST', path: '/api/approval', auth: false, desc: 'Proxied approval resolution.' },
  { method: 'GET', path: '/api/preferences', auth: false, desc: 'Read app preferences (SQLite-backed).', response: '{ ok, preferences }' },
  { method: 'PUT', path: '/api/preferences', auth: false, desc: 'Set an app preference.', body: '{ key: string, value: string }' },
  { method: 'GET', path: '/api/goals', auth: false, desc: 'Read goals for a month.', params: 'month (YYYY-MM)' },
  { method: 'POST', path: '/api/goals', auth: false, desc: 'Create or update a goal.', body: '{ month, projectId, activity, targetDays }' },
  { method: 'DELETE', path: '/api/goals/:id', auth: false, desc: 'Delete a goal.' },
  { method: 'GET', path: '/api/timetracking/cache', auth: false, desc: 'Get cached timetracking report for a month.', params: 'month (YYYY-MM)' },
  { method: 'POST', path: '/api/timetracking/cache', auth: false, desc: 'Store timetracking report in cache.', body: '{ month, data }' },
  { method: 'GET', path: '/api/timetracking/projects', auth: false, desc: 'Get cached project/activity list.' },
  { method: 'POST', path: '/api/timetracking/projects', auth: false, desc: 'Store project/activity list in cache.', body: '{ data }' },
  { method: 'POST', path: '/api/journal/generate', auth: false, desc: 'Generate a dev journal for a given week.', body: '{ weekStart: string }' },
  { method: 'GET', path: '/api/security-news/cache', auth: false, desc: 'Get cached security news articles.' },
  { method: 'POST', path: '/api/security-news/cache', auth: false, desc: 'Store security news in cache.', body: '{ data }' },
  { method: 'GET', path: '/api/ai-news/cache', auth: false, desc: 'Get cached AI news articles.' },
  { method: 'POST', path: '/api/ai-news/cache', auth: false, desc: 'Store AI news in cache.', body: '{ data }' },
  { method: 'GET', path: '/api/roles/cache', auth: false, desc: 'Get cached user roles and identity.' },
  { method: 'POST', path: '/api/roles/cache', auth: false, desc: 'Store user roles and identity in cache.', body: '{ userId, uisData, aliceData }' },
];

const CLI_COMMANDS: CliCmd[] = [
  { cmd: 'cg up', desc: 'Start daemon + GUI, open browser.', opts: ['--no-open  Skip opening browser'] },
  { cmd: 'cg down', desc: 'Stop GUI + daemon.' },
  { cmd: 'cg run <connector>', desc: 'Run a connector command.', args: 'Connector key (site/name), plus connector-specific args as --key value', opts: ['-f, --format <format>  Output format: table, json, csv (default: table)'], example: 'cg run timetracking/report --month 2026-07 --format json' },
  { cmd: 'cg list', desc: 'List all installed connectors with access, domains, and capabilities.' },
  { cmd: 'cg inspect <connector>', desc: 'Show full details of a connector (args, columns, pipeline).', example: 'cg inspect teams/room-availability' },
  { cmd: 'cg validate <file>', desc: 'Validate a connector YAML file against the schema.', example: 'cg validate connectors/my-connector.yaml' },
  { cmd: 'cg daemon status', desc: 'Check if the daemon is running.' },
  { cmd: 'cg daemon start', desc: 'Start the daemon in background.' },
  { cmd: 'cg daemon stop', desc: 'Stop the daemon.' },
  { cmd: 'cg gui', desc: 'Start the GUI app server (foreground by default).', opts: ['-b, --background  Run in background', '--no-open  Skip opening browser'] },
  { cmd: 'cg gui stop', desc: 'Stop the GUI app server.' },
  { cmd: 'cg gui status', desc: 'Check if the GUI is running.' },
  { cmd: 'cg audit list', desc: 'List recent audit events.', opts: ['--since <duration>  Time window (e.g. 7d, 2w, 12h)', '--connector <pattern>  Filter by connector (e.g. test/*)', '--type <pattern>  Filter by event type (e.g. auth.failed)', '--limit <n>  Max events (default: 100)'] },
  { cmd: 'cg audit show <id>', desc: 'Show full details of a single audit event including pipeline steps.' },
  { cmd: 'cg audit export', desc: 'Export audit events.', opts: ['--format <format>  Export format: json, csv (default: json)', '--since <duration>  Time window', '--connector <pattern>  Filter', '--type <pattern>  Filter'] },
  { cmd: 'cg config show', desc: 'Show current config.yaml contents.' },
  { cmd: 'cg config set <key> <value>', desc: 'Set a config value (section.property format).', example: 'cg config set daemon.port 9999' },
  { cmd: 'cg extension setup', desc: 'Show extension path and instructions for Chrome installation.' },
];

const PIPELINE_STEPS: { step: string; capability: string; desc: string }[] = [
  { step: 'navigate', capability: 'navigate', desc: 'Open a URL in the browser tab' },
  { step: 'wait', capability: 'navigate', desc: 'Wait for a selector or timeout' },
  { step: 'extract', capability: 'dom_read', desc: 'Read data from DOM elements' },
  { step: 'extract_tree', capability: 'dom_read', desc: 'Recursive DOM tree walk with ancestry' },
  { step: 'extract_html', capability: 'dom_read', desc: 'Capture element HTML as a variable' },
  { step: 'click', capability: 'dom_write', desc: 'Click an element' },
  { step: 'click_all', capability: 'dom_write', desc: 'Click all matching elements (with re-scan loop)' },
  { step: 'type', capability: 'dom_write', desc: 'Type text into an input' },
  { step: 'intercept', capability: 'intercept_response', desc: 'Capture a network response body' },
  { step: 'cookie', capability: 'cookie_read', desc: 'Read cookies for a domain' },
  { step: 'fetch', capability: 'cookie_read', desc: 'HTTP request from page context' },
  { step: 'map', capability: '—', desc: 'Transform/rename extracted fields' },
  { step: 'filter', capability: '—', desc: 'Filter rows by condition' },
  { step: 'set', capability: '—', desc: 'Set a variable for later steps' },
  { step: 'transform', capability: '—', desc: 'Server-side data transform (e.g. HTML→Markdown)' },
];

function EndpointRow({ ep }: { ep: Endpoint }) {
  const [expanded, setExpanded] = useState(false);
  const hasDetail = ep.params || ep.body || ep.response;
  return (
    <div className="border-b border-base-300/50 last:border-b-0">
      <button
        className={`flex items-center gap-3 w-full text-left px-3 py-2.5 ${hasDetail ? 'cursor-pointer hover:bg-base-200/50' : ''}`}
        onClick={() => hasDetail && setExpanded(!expanded)}
        disabled={!hasDetail}
      >
        <Badge variant={METHOD_VARIANT[ep.method] ?? 'neutral'} size="xs" className="w-10 justify-center shrink-0">
          {ep.method}
        </Badge>
        <span className="font-mono text-sm flex-1">{ep.path}</span>
        {ep.auth && <Badge variant="warning" size="xs">auth</Badge>}
        {hasDetail && (
          <span className="text-xs opacity-40">{expanded ? '▾' : '▸'}</span>
        )}
      </button>
      <div className="px-3 pb-2 pl-16 text-sm opacity-60">{ep.desc}</div>
      {expanded && hasDetail && (
        <div className="px-3 pb-3 pl-16 space-y-1.5">
          {ep.params && (
            <div className="text-xs">
              <span className="font-semibold opacity-50">Params: </span>
              <span className="font-mono opacity-60">{ep.params}</span>
            </div>
          )}
          {ep.body && (
            <div className="text-xs">
              <span className="font-semibold opacity-50">Body: </span>
              <code className="font-mono bg-base-200 px-1 py-0.5 opacity-70">{ep.body}</code>
            </div>
          )}
          {ep.response && (
            <div className="text-xs">
              <span className="font-semibold opacity-50">Response: </span>
              <code className="font-mono bg-base-200 px-1 py-0.5 opacity-70">{ep.response}</code>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ApiReference() {
  const [tab, setTab] = useState<TabId>('cli');

  return (
    <div className="max-w-4xl mx-auto">
      <h2 className="font-display text-xl font-bold uppercase tracking-[0.06em] mb-1">API & CLI Reference</h2>
      <p className="text-sm opacity-60 mb-6">CLI commands, Daemon API endpoints, and App Server endpoints.</p>

      {/* Auth note */}
      <div id="api-endpoints" className="border border-base-300 bg-base-200/30 p-3 mb-6 scroll-mt-4">
        <p className="text-sm opacity-70">
          <span className="font-semibold">Authentication:</span> Daemon endpoints (except <code className="font-mono text-xs bg-base-200 px-1 py-0.5">/api/status</code> and <code className="font-mono text-xs bg-base-200 px-1 py-0.5">/ws/extension</code>) require
          an <code className="font-mono text-xs bg-base-200 px-1 py-0.5">Authorization: Bearer &lt;token&gt;</code> header and
          an <code className="font-mono text-xs bg-base-200 px-1 py-0.5">X-CommandGarden: 1</code> CSRF header.
          The App Server handles auth internally — GUI requests don't need tokens.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-base-300 mb-4">
        {([
          { id: 'cli' as TabId, label: 'CLI Commands', sub: 'cg' },
          { id: 'daemon-api' as TabId, label: 'Daemon API', sub: ':9091' },
          { id: 'app-api' as TabId, label: 'App Server API', sub: ':9092' },
        ]).map((t) => (
          <button
            key={t.id}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${tab === t.id ? 'border-primary text-primary' : 'border-transparent opacity-60 hover:opacity-100'}`}
            onClick={() => setTab(t.id)}
          >
            {t.label} <span className="font-mono text-xs opacity-40 ml-1">{t.sub}</span>
          </button>
        ))}
      </div>

      {/* CLI Commands tab */}
      {tab === 'cli' && (
        <div className="space-y-2 mb-8">
          {CLI_COMMANDS.map((c) => (
            <div key={c.cmd} className="border border-base-300 p-3">
              <div className="flex items-start gap-3">
                <code className="font-mono text-sm font-semibold bg-base-200 px-2 py-0.5 shrink-0">{c.cmd}</code>
                <span className="text-sm opacity-60 pt-0.5">{c.desc}</span>
              </div>
              {c.args && (
                <div className="mt-2 ml-1 text-xs">
                  <span className="font-semibold opacity-50">Args: </span>
                  <span className="opacity-60">{c.args}</span>
                </div>
              )}
              {c.opts && c.opts.length > 0 && (
                <div className="mt-1.5 ml-1 space-y-0.5">
                  {c.opts.map((o, i) => (
                    <div key={i} className="text-xs font-mono opacity-50">{o}</div>
                  ))}
                </div>
              )}
              {c.example && (
                <div className="mt-2 ml-1">
                  <code className="text-xs font-mono bg-base-200/70 px-2 py-1 block opacity-60">{c.example}</code>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Daemon API tab */}
      {tab === 'daemon-api' && (
        <div className="border border-base-300 mb-8">
          {DAEMON_ENDPOINTS.map((ep, i) => (
            <EndpointRow key={i} ep={ep} />
          ))}
        </div>
      )}

      {/* App Server API tab */}
      {tab === 'app-api' && (
        <>
          <p className="text-sm opacity-50 mb-3">
            The App Server on <code className="font-mono text-xs bg-base-200 px-1 py-0.5">:9092</code> proxies
            all daemon endpoints and adds app-specific routes for preferences, caching, goals, and journal generation.
          </p>
          <div className="border border-base-300 mb-8">
            {APP_ENDPOINTS.map((ep, i) => (
              <EndpointRow key={i} ep={ep} />
            ))}
          </div>
        </>
      )}

      {/* Pipeline steps reference (always visible) */}
      <h3 id="api-pipeline" className="font-display text-base font-semibold mb-3 scroll-mt-4">Pipeline Steps</h3>
      <p className="text-sm opacity-50 mb-3">
        Available steps for connector YAML pipeline definitions. For why each capability runs where it does, see{' '}
        <Link to="/concepts#concepts-worlds" className="text-primary hover:underline inline-flex items-center gap-1">
          Capability &amp; World Model <ArrowRight className="w-3 h-3" />
        </Link>.
      </p>
      <div className="overflow-x-auto border border-base-300 mb-8">
        <table className="table table-sm w-full">
          <thead>
            <tr className="bg-base-200">
              <th>Step</th>
              <th>Capability</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            {PIPELINE_STEPS.map((s) => (
              <tr key={s.step} className="hover:bg-base-200">
                <td className="font-mono text-sm font-semibold">{s.step}</td>
                <td><Badge size="xs" variant={s.capability === '—' ? 'neutral' : 'info'}>{s.capability}</Badge></td>
                <td className="text-sm opacity-60">{s.desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Expression syntax */}
      <h3 id="api-expressions" className="font-display text-base font-semibold mb-3 scroll-mt-4">Expression Syntax</h3>
      <div className="border border-base-300 p-4">
        <p className="text-sm opacity-60 mb-3">Use <code className="font-mono text-xs bg-base-200 px-1 py-0.5">{'${{ }}'}</code> for template expressions (no JS eval):</p>
        <div className="space-y-1.5 font-mono text-xs">
          <div className="flex gap-3">
            <span className="opacity-40 w-36 shrink-0">Variable access</span>
            <code className="opacity-70">args.month, vars.token, cookies.name</code>
          </div>
          <div className="flex gap-3">
            <span className="opacity-40 w-36 shrink-0">Row access (map)</span>
            <code className="opacity-70">row.id, row.name</code>
          </div>
          <div className="flex gap-3">
            <span className="opacity-40 w-36 shrink-0">Concatenation</span>
            <code className="opacity-70">"Bearer " + vars.token</code>
          </div>
          <div className="flex gap-3">
            <span className="opacity-40 w-36 shrink-0">Pipe filters</span>
            <code className="opacity-70">{'args.month | default("2026-06"), value | number, text | trim'}</code>
          </div>
        </div>
      </div>
    </div>
  );
}
