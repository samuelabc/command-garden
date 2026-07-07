// Runs in Saba Cloud page context via js_evaluate step.
// Fetches pending mandatory learning items from Saba Cloud (v64+) using two
// confirmed API endpoints:
//
//   1. GET /Saba/api/ui/torque/uicontext/currentuser
//      → userInfo.userId  (e.g. "emplo000000001653633")
//
//   2. GET /Saba/api/common/todocontroller/detail/{userId}?context=learning&expand=savetabpref
//      → searchResults[1]  (Saba list format: ["list", [...items]])

const ORIGIN = 'https://daimler.sabacloud.com';

// ── Wait for valid Saba session (SSO / redirects, up to 60s) ─────────────

const __deadline = Date.now() + 60000;
while (Date.now() < __deadline) {
  if (location.hostname === 'daimler.sabacloud.com' && document.readyState === 'complete') break;
  await new Promise(r => setTimeout(r, 1000));
}
if (location.hostname !== 'daimler.sabacloud.com') {
  throw new Error('AUTH_REQUIRED: Not signed in to Saba — log in at daimler.sabacloud.com and retry');
}

// ── Step 1: Resolve current user ID ──────────────────────────────────────

const meResp = await fetch(`${ORIGIN}/Saba/api/ui/torque/uicontext/currentuser`, {
  headers: { Accept: 'application/json' },
  credentials: 'include',
});
if (meResp.status === 401 || meResp.status === 403) {
  throw new Error('AUTH_REQUIRED: Saba session expired — log in and retry');
}
if (!meResp.ok) {
  throw new Error(`currentuser API returned HTTP ${meResp.status}`);
}
const meData = await meResp.json();
const userId = meData?.userInfo?.userId;
if (!userId) {
  throw new Error('Could not read userInfo.userId from currentuser response');
}

// ── Step 2: Fetch pending learning to-do items ────────────────────────────

const todoResp = await fetch(
  `${ORIGIN}/Saba/api/common/todocontroller/detail/${encodeURIComponent(userId)}?context=learning&expand=savetabpref`,
  { headers: { Accept: 'application/json' }, credentials: 'include' }
);
if (!todoResp.ok) {
  throw new Error(`todocontroller API returned HTTP ${todoResp.status} for userId=${userId}`);
}
const todoData = await todoResp.json();

// searchResults is serialised as ["list", [item, item, ...]]
const rawList = todoData?.searchResults;
const items = Array.isArray(rawList)
  ? (rawList[0] === 'list' ? rawList[1] : rawList)
  : [];

if (!Array.isArray(items)) {
  throw new Error('Unexpected todocontroller response shape — searchResults is not a list');
}

// ── Step 3: Process and return rows ──────────────────────────────────────

const DONE_STATUSES = new Set([
  'completed', 'passed', 'withdrawn', 'cancelled', 'waived', 'successful',
]);

const today = new Date();
today.setHours(0, 0, 0, 0);

return items
  .filter(item => {
    if (!item.mandatory) return false;
    const status = (item.itemDisplayStatus || '').toLowerCase();
    return !DONE_STATUSES.has(status);
  })
  .map(item => {
    const dueDateMs = item.dueDate?.date ?? null;
    const dueDateObj = dueDateMs ? new Date(dueDateMs) : null;
    const daysUntilDue = item.dueDateTs?.localDaysDifference
      ?? (dueDateObj !== null
        ? Math.ceil((dueDateObj.getTime() - today.getTime()) / 86400000)
        : null);
    return {
      title: item.itemName || '(unknown)',
      type: item.itemType || 'Training',
      status: item.itemDisplayStatus || 'Pending',
      dueDate: dueDateObj ? dueDateObj.toISOString().slice(0, 10) : '',
      daysUntilDue: daysUntilDue ?? 9999,
      isOverdue: item.overdue ?? (daysUntilDue !== null && daysUntilDue < 0),
    };
  })
  .sort((a, b) => a.daysUntilDue - b.daysUntilDue);
