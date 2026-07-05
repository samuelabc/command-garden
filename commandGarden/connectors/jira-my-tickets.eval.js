// Runs in page context via js_evaluate step.
// Fetches Jira Cloud tickets assigned to the user using the browser's
// authenticated session (Atlassian cookies — no API token required).
//
// Uses Jira REST API v3 with JQL queries to find:
// - Resolved tickets within the date range
// - Currently in-progress tickets
// - Blockers: in-progress items not updated in 3+ days
//
// Template variables interpolated before execution:
//   ${{ args.fromDate }}
//   ${{ args.toDate }}
//   ${{ args.assignee | default("") }}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

const JIRA_BASE = 'https://mercedes-benz.atlassian.net';
const API = `${JIRA_BASE}/rest/api/3`;

const fromDate = '${{ args.fromDate }}'.trim();
const toDate = '${{ args.toDate }}'.trim();
const assigneeArg = '${{ args.assignee | default("") }}'.trim();

if (!fromDate || !toDate) {
  throw new Error('Missing required args: fromDate, toDate');
}

// Use currentUser() if no assignee provided — Jira JQL function that
// resolves to the logged-in user without knowing their username.
const assignee = assigneeArg || 'currentUser()';
// JQL uses currentUser() as a function (no quotes), but a literal
// username needs quotes. Detect which format to use.
const assigneeJql = assignee === 'currentUser()' ? 'currentUser()' : `"${assignee}"`;

// ── Wait for Jira to finish SSO/redirect (up to 30s) ──────────────────
const __deadline = Date.now() + 30000;
while (Date.now() < __deadline) {
  if (location.hostname === 'mercedes-benz.atlassian.net') break;
  await sleep(1000);
}
if (location.hostname !== 'mercedes-benz.atlassian.net') {
  throw new Error('Not signed in to Jira — log in at mercedes-benz.atlassian.net and retry');
}

// ── Helper: run a JQL search and return issues ────────────────────────
// Uses the browser's session cookies for auth (same-origin fetch).
async function jqlSearch(jql, maxResults = 100) {
  const url = `${API}/search?jql=${encodeURIComponent(jql)}&maxResults=${maxResults}&fields=summary,status,issuetype,resolutiondate,updated`;
  const resp = await fetch(url, {
    headers: { Accept: 'application/json' },
    credentials: 'include',      // send Atlassian session cookies
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`Jira search failed (HTTP ${resp.status}): ${text.slice(0, 200)}`);
  }
  const body = await resp.json();
  return body.issues || [];
}

// ── Run two JQL queries ───────────────────────────────────────────────

// Resolved: tickets resolved/closed within the date range
const resolvedJql = `assignee = ${assigneeJql} AND status changed TO ("Done", "Closed", "Resolved") DURING ("${fromDate}", "${toDate}") ORDER BY resolutiondate DESC`;

// In-progress: currently active tickets assigned to the user
const inProgressJql = `assignee = ${assigneeJql} AND status IN ("In Progress", "In Review", "To Do", "Open") ORDER BY updated ASC`;

const [resolvedIssues, inProgressIssues] = await Promise.all([
  jqlSearch(resolvedJql),
  jqlSearch(inProgressJql),
]);

// ── Build output rows ─────────────────────────────────────────────────
const now = Date.now();
const rows = [];

for (const issue of resolvedIssues) {
  const f = issue.fields || {};
  rows.push({
    key: issue.key,
    summary: f.summary || '(no title)',
    status: f.status?.name || '',
    type: f.issuetype?.name || '',
    resolvedDate: (f.resolutiondate || '').slice(0, 10),
    updatedDate: (f.updated || '').slice(0, 10),
    staleDays: 0,
    category: 'resolved',
  });
}

for (const issue of inProgressIssues) {
  const f = issue.fields || {};
  const updated = f.updated;
  // Calculate staleDays: days since the ticket was last updated
  const staleDays = updated
    ? Math.floor((now - new Date(updated).getTime()) / 86400000)
    : 0;
  // Tickets not updated in 3+ days are flagged as blockers
  const category = staleDays >= 3 ? 'blocker' : 'inProgress';

  rows.push({
    key: issue.key,
    summary: f.summary || '(no title)',
    status: f.status?.name || '',
    type: f.issuetype?.name || '',
    resolvedDate: '',
    updatedDate: (updated || '').slice(0, 10),
    staleDays,
    category,
  });
}

return rows;
