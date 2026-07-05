// Runs in page context via js_evaluate step.
// Fetches ADO Work Items (resolved, in-progress, blockers) assigned to the user
// using the browser session's MSAL token — no PAT required.
//
// Uses the same WIQL queries as the Phase 1 jira.source.ts backend.
// Named "jira" for future migration compatibility; currently backed by ADO Boards.
//
// Template variables interpolated before execution:
//   ${{ args.fromDate }}
//   ${{ args.toDate }}
//   ${{ args.assignee | default("") }}

// ── MSAL token polling (handles SSO redirects + MFA) ──────────────────
// Canonical source: connectors/lib/msal-token.js
const __deadline = Date.now() + 60000;
let token;
while (Date.now() < __deadline) {
  const k = Object.keys(sessionStorage).find(x => x.includes('accesstoken'));
  if (k) {
    try {
      const tokenData = JSON.parse(sessionStorage.getItem(k));
      if (Number(tokenData.expiresOn) > Math.floor(Date.now() / 1000) + 30) {
        token = tokenData.secret;
        break;
      }
    } catch (_) {}
  }
  await new Promise(r => setTimeout(r, 1000));
}
if (!token) throw new Error('No valid MSAL access token after 60s — log in and retry');

// ── Read args ─────────────────────────────────────────────────────────
const fromDate = '${{ args.fromDate }}'.trim();
const toDate = '${{ args.toDate }}'.trim();
let assignee = '${{ args.assignee | default("") }}'.trim();

if (!fromDate || !toDate) {
  throw new Error('Missing required args: fromDate, toDate');
}

// Auto-detect assignee from JWT claims if not provided.
// The MSAL access token is a JWT — parse the payload for upn or unique_name.
if (!assignee) {
  try {
    const parts = token.split('.');
    if (parts.length >= 2) {
      const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
      assignee = payload.upn || payload.unique_name || payload.preferred_username || '';
    }
  } catch (_) { /* fall through — will use empty assignee */ }
}

if (!assignee) {
  throw new Error('Could not detect assignee — provide --assignee or ensure browser is signed in');
}

const authHeaders = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };

// ── Helper: run WIQL query and batch-fetch work item details ──────────
async function queryWorkItems(wiql) {
  // Step 1: Run WIQL query to get IDs
  // Use the org-level endpoint (no project scope — searches across all projects)
  const queryUrl = 'https://dev.azure.com/_apis/wit/wiql?api-version=7.1';
  const queryResp = await fetch(queryUrl, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ query: wiql }),
  });
  if (!queryResp.ok) return [];
  const queryBody = await queryResp.json();
  const ids = (queryBody.workItems || []).map(w => w.id);
  if (ids.length === 0) return [];

  // Step 2: Batch-fetch work item details (max 200)
  const batchIds = ids.slice(0, 200);
  const detailUrl =
    'https://dev.azure.com/_apis/wit/workitems' +
    `?ids=${batchIds.join(',')}` +
    '&fields=System.Id,System.Title,System.State,System.WorkItemType,' +
    'Microsoft.VSTS.Common.ResolvedDate,Microsoft.VSTS.Common.StateChangeDate' +
    '&api-version=7.1';
  const detailResp = await fetch(detailUrl, { headers: authHeaders });
  if (!detailResp.ok) return [];
  const detailBody = await detailResp.json();
  return detailBody.value || [];
}

// ── Run queries in parallel ───────────────────────────────────────────

const resolvedWiql = `
  SELECT [System.Id]
  FROM WorkItems
  WHERE [System.AssignedTo] = '${assignee}'
    AND [System.State] IN ('Resolved', 'Closed', 'Done')
    AND [Microsoft.VSTS.Common.ResolvedDate] >= '${fromDate}'
    AND [Microsoft.VSTS.Common.ResolvedDate] <= '${toDate}'
  ORDER BY [Microsoft.VSTS.Common.ResolvedDate] DESC
`;

const inProgressWiql = `
  SELECT [System.Id]
  FROM WorkItems
  WHERE [System.AssignedTo] = '${assignee}'
    AND [System.State] IN ('Active', 'In Progress', 'Doing')
  ORDER BY [Microsoft.VSTS.Common.StateChangeDate] ASC
`;

const [resolvedItems, inProgressItems] = await Promise.all([
  queryWorkItems(resolvedWiql),
  queryWorkItems(inProgressWiql),
]);

// ── Build output rows ─────────────────────────────────────────────────
const now = Date.now();
const rows = [];

// Resolved items
for (const item of resolvedItems) {
  const f = item.fields || {};
  rows.push({
    id: item.id,
    title: f['System.Title'] || '(no title)',
    state: f['System.State'] || '',
    type: f['System.WorkItemType'] || '',
    resolvedDate: (f['Microsoft.VSTS.Common.ResolvedDate'] || '').slice(0, 10),
    stateChangeDate: (f['Microsoft.VSTS.Common.StateChangeDate'] || '').slice(0, 10),
    staleDays: 0,
    category: 'resolved',
  });
}

// In-progress items — calculate staleDays and identify blockers (3+ days stale)
for (const item of inProgressItems) {
  const f = item.fields || {};
  const stateChange = f['Microsoft.VSTS.Common.StateChangeDate'];
  const staleDays = stateChange
    ? Math.floor((now - new Date(stateChange).getTime()) / 86400000)
    : 0;
  const category = staleDays >= 3 ? 'blocker' : 'inProgress';

  rows.push({
    id: item.id,
    title: f['System.Title'] || '(no title)',
    state: f['System.State'] || '',
    type: f['System.WorkItemType'] || '',
    resolvedDate: '',
    stateChangeDate: (stateChange || '').slice(0, 10),
    staleDays,
    category,
  });
}

return rows;
