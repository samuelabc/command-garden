// Runs in page context via js_evaluate step.
// Captures ADO Git commit data by intercepting the page's own API calls.
//
// Strategy: the pipeline navigates to the ADO commits page, which triggers
// ADO's SPA to fetch commit data from its own API. We intercept those
// responses (same proven pattern as teams-room-availability connector).
// This avoids making our own API calls (which hang due to ADO's auth/CSP).
//
// Template variables interpolated before execution:
//   ${{ args.org }}
//   ${{ args.project }}
//   ${{ args.repo }}
//   ${{ args.fromDate }}
//   ${{ args.toDate }}
//   ${{ args.author | default("") }}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

const fromDate = '${{ args.fromDate }}'.trim();
const toDate = '${{ args.toDate }}'.trim();
const authorFilter = '${{ args.author | default("") }}'.trim().toLowerCase();

// ── Install fetch interceptor to capture ADO's commit API responses ───
// ADO's SPA calls its own API to load commits when the page renders.
// We intercept those responses and collect the commit data.
if (!window.__adoCommits) {
  window.__adoCommits = [];
  const origFetch = window.fetch;
  window.fetch = function () {
    const args = arguments;
    const url = String((args[0] && args[0].url) || args[0] || '');
    return origFetch.apply(this, args).then(r => {
      try {
        // Capture responses from the commits/pushes API
        if (url.includes('/commits') || url.includes('/pushes')) {
          r.clone().json().then(data => {
            const items = data.value || data.results || [];
            if (Array.isArray(items)) {
              for (const item of items) {
                // Commit objects have commitId; push objects have pushId
                if (item.commitId || item.pushId) {
                  window.__adoCommits.push(item);
                }
              }
            }
          }).catch(() => {});
        }
      } catch (_) {}
      return r;
    });
  };

  // Also patch XMLHttpRequest (ADO uses both)
  const origXHROpen = XMLHttpRequest.prototype.open;
  const origXHRSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function () {
    this.__url = arguments[1] || '';
    return origXHROpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function () {
    this.addEventListener('load', function () {
      try {
        const url = this.__url || '';
        if (url.includes('/commits') || url.includes('/pushes')) {
          const data = JSON.parse(this.responseText);
          const items = data.value || data.results || [];
          if (Array.isArray(items)) {
            for (const item of items) {
              if (item.commitId || item.pushId) {
                window.__adoCommits.push(item);
              }
            }
          }
        }
      } catch (_) {}
    });
    return origXHRSend.apply(this, arguments);
  };
}

// ── Wait for ADO to load commit data (up to 30s) ─────────────────────
for (let i = 0; i < 30; i++) {
  await sleep(1000);
  if (window.__adoCommits.length > 0) break;
}

// Collect and clear captured data
const captured = [...(window.__adoCommits || [])];
window.__adoCommits = [];

// ── Deduplicate and filter commits ────────────────────────────────────
const seen = new Set();
const rows = [];

for (const item of captured) {
  // Skip non-commit items (push metadata without commit details)
  if (!item.commitId) continue;
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
