// Runs in page context via js_evaluate step.
// Fetches ADO Git commits (via Pushes API, all branches) and completed PRs
// using the browser's ADO session cookies — no PAT or MSAL token required.
//
// Strategy: navigate to dev.azure.com to trigger SSO, then call the ADO REST
// API with session cookies (credentials:'include'). The Pushes API captures
// work across ALL branches (unlike the Commits API which only searches the
// default branch).
//
// Template variables interpolated before execution:
//   ${{ args.org }}
//   ${{ args.project }}
//   ${{ args.repo }}
//   ${{ args.fromDate }}
//   ${{ args.toDate }}
//   ${{ args.author | default("") }}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Read args ─────────────────────────────────────────────────────────
const org = '${{ args.org }}'.trim();
const project = '${{ args.project }}'.trim();
const repo = '${{ args.repo }}'.trim();
const fromDate = '${{ args.fromDate }}'.trim();
const toDate = '${{ args.toDate }}'.trim();
const authorFilter = '${{ args.author | default("") }}'.trim().toLowerCase();

if (!org || !project || !repo || !fromDate || !toDate) {
  throw new Error('Missing required args: org, project, repo, fromDate, toDate');
}

// ── Wait for ADO to finish SSO/redirect (up to 30s) ──────────────────
// ADO uses httpOnly session cookies — no MSAL tokens in sessionStorage.
// We just need the browser to be logged in; session cookies are sent
// automatically with same-origin fetch (credentials: 'include').
const __deadline = Date.now() + 30000;
while (Date.now() < __deadline) {
  if (location.hostname === 'dev.azure.com') break;
  await sleep(1000);
}
if (location.hostname !== 'dev.azure.com') {
  throw new Error('Not signed in to Azure DevOps — log in at dev.azure.com and retry');
}

// ADO REST API: dev.azure.com/{org}/{project}/_apis/...
const apiBase = `https://dev.azure.com/${org}/${project}/_apis`;
// Use session cookies for auth (same-origin, no Bearer token needed)
const authHeaders = { Accept: 'application/json' };

// ── Step 1: List pushes in the date range ─────────────────────────────
const listUrl =
  `${apiBase}/git/repositories/${repo}/pushes` +
  `?searchCriteria.fromDate=${fromDate}T00:00:00Z` +
  `&searchCriteria.toDate=${toDate}T23:59:59Z` +
  `&api-version=7.1`;

const listResp = await fetch(listUrl, { headers: authHeaders, credentials: 'include' });
if (!listResp.ok) throw new Error(`Pushes list HTTP ${listResp.status}: ${await listResp.text()}`);
const listBody = await listResp.json();
let pushes = listBody.value || [];

// Filter by author if provided (case-insensitive substring match on
// pushedBy.uniqueName or pushedBy.displayName)
if (authorFilter) {
  pushes = pushes.filter(p => {
    const un = (p.pushedBy?.uniqueName || '').toLowerCase();
    const dn = (p.pushedBy?.displayName || '').toLowerCase();
    return un.includes(authorFilter) || dn.includes(authorFilter);
  });
}

// ── Step 2: Fetch each push's commits ─────────────────────────────────
const seen = new Set();
const commits = [];

for (const push of pushes) {
  const detailUrl = `${apiBase}/git/repositories/${repo}/pushes/${push.pushId}?api-version=7.1`;
  try {
    const detailResp = await fetch(detailUrl, { headers: authHeaders, credentials: 'include' });
    if (!detailResp.ok) continue;
    const detail = await detailResp.json();
    for (const c of (detail.commits || [])) {
      // Deduplicate: same commit can appear in multiple pushes (e.g. after merge)
      if (seen.has(c.commitId)) continue;
      seen.add(c.commitId);
      commits.push(c);
    }
  } catch (_) { /* skip failed push detail fetches */ }
}

// ── Step 3: Fetch completed PRs in the date range ─────────────────────
const prUrl =
  `${apiBase}/git/repositories/${repo}/pullrequests` +
  `?searchCriteria.status=completed` +
  `&api-version=7.1`;

let prRows = [];
try {
  const prResp = await fetch(prUrl, { headers: authHeaders, credentials: 'include' });
  if (prResp.ok) {
    const prBody = await prResp.json();
    const prs = (prBody.value || []).filter(pr => {
      if (!pr.closedDate) return false;
      return pr.closedDate >= `${fromDate}T00:00:00Z` && pr.closedDate <= `${toDate}T23:59:59Z`;
    });
    // Optionally filter PRs by author
    const filtered = authorFilter
      ? prs.filter(pr => {
          const un = (pr.createdBy?.uniqueName || '').toLowerCase();
          return un.includes(authorFilter);
        })
      : prs;
    prRows = filtered.map(pr => ({
      commitId: '',
      authorName: pr.createdBy?.displayName || '',
      authorEmail: pr.createdBy?.uniqueName || '',
      date: (pr.closedDate || '').slice(0, 10),
      message: `PR #${pr.pullRequestId}: ${pr.title || '(no title)'}`,
      filesAdded: 0,
      filesEdited: 0,
      filesDeleted: 0,
      isPR: 'true',
      prId: pr.pullRequestId,
    }));
  }
} catch (_) { /* PRs are supplemental — don't fail on error */ }

// ── Build output rows ─────────────────────────────────────────────────
const commitRows = commits.map(c => ({
  commitId: c.commitId || '',
  authorName: c.author?.name || '',
  authorEmail: c.author?.email || '',
  date: (c.author?.date || '').slice(0, 10),
  message: (c.comment || '').split('\n')[0].slice(0, 200),
  filesAdded: c.changeCounts?.Add || 0,
  filesEdited: c.changeCounts?.Edit || 0,
  filesDeleted: c.changeCounts?.Delete || 0,
  isPR: 'false',
  prId: 0,
}));

const rows = [...commitRows, ...prRows];
return rows;
