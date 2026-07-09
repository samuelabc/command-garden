// Runs in page context via js_evaluate step (executed by CDP Runtime.evaluate
// to bypass ADO's strict-dynamic CSP — see chrome-adapter.ts evaluateViaCdp).
//
// Fetches ADO Git commits directly via the REST API. This works because:
// 1. Runtime.evaluate bypasses CSP (runs at debugger level, like DevTools console)
// 2. fetch() is same-origin and uses the page's session cookies for auth
// 3. No MCAS proxy on dev.azure.com (unlike Outlook)
//
// Falls back to window.__cdpCapture if the direct API call fails.
// Requires cdp: true in the connector YAML.
//
// Template variables interpolated before execution:
//   ${{ args.org }}, ${{ args.project }}, ${{ args.repo }}
//   ${{ args.fromDate }}, ${{ args.toDate }}
//   ${{ args.author | default("") }}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

const org = '${{ args.org }}'.trim();
const project = '${{ args.project }}'.trim();
const repo = '${{ args.repo }}'.trim();
const fromDate = '${{ args.fromDate }}'.trim();
const toDate = '${{ args.toDate }}'.trim();
const authorFilter = '${{ args.author | default("") }}'.trim().toLowerCase();

// ── Fetch commits via ADO REST API ────────────────────────────────────
// Direct same-origin fetch with session cookies — avoids the problem where
// ADO embeds initial commit data in the HTML (no separate _apis/ XHR),
// making CDP Fetch.enable interception unable to capture commit data.
const allItems = [];
try {
  const apiUrl = `https://dev.azure.com/${encodeURIComponent(org)}/${encodeURIComponent(project)}`
    + `/_apis/git/repositories/${encodeURIComponent(repo)}/commits`
    + `?searchCriteria.fromDate=${fromDate}&searchCriteria.toDate=${toDate}`
    + `&$top=1000&api-version=7.1`;
  const resp = await fetch(apiUrl);
  if (!resp.ok) throw new Error('HTTP ' + resp.status);
  const data = await resp.json();
  for (const item of (data.value || [])) {
    if (item.commitId) allItems.push(item);
  }
} catch (fetchErr) {
  // Direct fetch failed — fall back to CDP-captured data (window.__cdpCapture
  // is populated by chrome-adapter.ts Fetch.enable when _apis/ XHRs occur).
  for (let i = 0; i < 30; i++) {
    await sleep(1000);
    if (window.__cdpCapture && window.__cdpCapture.length > 0) break;
  }
  for (const raw of (window.__cdpCapture || [])) {
    try {
      const data = JSON.parse(raw);
      const items = data.value || data.results || [];
      if (Array.isArray(items)) {
        for (const item of items) {
          if (item.commitId) allItems.push(item);
        }
      }
    } catch (_) {}
  }
  window.__cdpCapture = [];
}

// ── Deduplicate and filter commits ────────────────────────────────────
const seen = new Set();
const rows = [];

for (const item of allItems) {
  if (seen.has(item.commitId)) continue;
  seen.add(item.commitId);

  const authorName = item.author?.name || item.committer?.name || '';
  const authorEmail = item.author?.email || item.committer?.email || '';
  const dateRaw = item.author?.date || item.committer?.date || '';
  const date = dateRaw.slice(0, 10);

  // Filter by date range
  if (date && (date < fromDate || date > toDate)) continue;

  // Filter by author if provided
  if (authorFilter) {
    const nameMatch = authorName.toLowerCase().includes(authorFilter);
    const emailMatch = authorEmail.toLowerCase().includes(authorFilter);
    if (!nameMatch && !emailMatch) continue;
  }

  rows.push({
    commitId: item.commitId,
    authorName,
    authorEmail,
    date,
    message: (item.comment || '').split('\n')[0].slice(0, 200),
    filesAdded: item.changeCounts?.Add || 0,
    filesEdited: item.changeCounts?.Edit || 0,
    filesDeleted: item.changeCounts?.Delete || 0,
    isPR: 'false',
    prId: 0,
  });
}

return rows;
