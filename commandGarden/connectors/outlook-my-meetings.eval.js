// Runs in page context via js_evaluate step (executed by CDP Runtime.evaluate
// to bypass Outlook's CSP — see chrome-adapter.ts evaluateViaCdp).
//
// Strategy: drives the OWA Scheduling Assistant (same as room-availability)
// to trigger a getSchedule GraphQL call. The organizer's own schedule is
// always the first entry — no room/attendee needs to be added.
//
// CDP Fetch.enable intercepts getSchedule at the network stack level
// (below MCAS proxy), and chrome-adapter.ts injects matching responses
// into window.__rfb. This eval.js reads from __rfb.
//
// Requires cdp: true in the connector YAML.
//
// Template variables interpolated before execution:
//   ${{ args.date }}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

function pad2(n) { return String(n).padStart(2, '0'); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function todayLocalISO() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** "2026-07-10" -> "10, July, 2026" (matches the OWA date-cell aria-label). */
function dateCellLabel(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d}, ${MONTHS[m - 1]}, ${y}`;
}

function $(sel) { return document.querySelector(sel); }
function exists(sel) { return !!$(sel); }

/** Click a button/link by accessible name. Returns true if found. */
function clickByName(name) {
  const els = Array.from(document.querySelectorAll('button,a,[role=button]'));
  const el = els.find(e => {
    if (!e.offsetParent) return false;
    const al = (e.getAttribute('aria-label') || '').trim();
    const tx = (e.textContent || '').replace(/\s+/g, ' ').trim();
    return al === name || al.includes(name) || tx.includes(name);
  });
  if (!el) return false;
  el.scrollIntoView({ block: 'center' });
  el.click();
  return true;
}

/** True when the Scheduling Assistant view is rendered. */
function schedulingAssistantOpen() {
  return Array.from(document.querySelectorAll('input')).some(
    e => (e.getAttribute('aria-label') || '') === 'Start date'
  );
}

/** Read and clear captured {req, body} pairs from CDP layer. */
function readCapture() {
  const d = window.__rfb || [];
  window.__rfb = [];
  return d;
}

/** Parse getSchedule response → Map<scheduleId, schedule>. */
function schedulesFromPair(pair) {
  let body;
  try { body = JSON.parse(pair.body); } catch (_e) { return new Map(); }
  const byId = new Map();
  const nodes = Array.isArray(body) ? body : [body];
  for (const node of nodes) {
    const schedules = node?.data?.getSchedule?.schedules;
    if (Array.isArray(schedules)) {
      for (const s of schedules) {
        if (s?.scheduleId) byId.set(String(s.scheduleId).toLowerCase(), s);
      }
    }
  }
  return byId;
}

// ── Parse args ────────────────────────────────────────────────────────
const date = '${{ args.date }}'.trim();
if (!DATE_RE.test(date)) throw new Error(`Invalid date "${date}" — use YYYY-MM-DD`);

// ── Wait for compose form (handles SSO redirect delays) ──────────────
const __deadline = Date.now() + 30000;
while (Date.now() < __deadline) {
  if (exists("button[aria-label='Open Scheduling Assistant']") ||
      exists("input[aria-label='Start date']")) break;
  await sleep(400);
}
if (!exists("button[aria-label='Open Scheduling Assistant']") &&
    !exists("input[aria-label='Start date']")) {
  if (/login\.|\/oauth2\/|signin|sso/i.test(location.href)) {
    throw new Error('Not signed in to Outlook — log in and retry');
  }
  throw new Error('Calendar compose form did not load');
}

// ── Open the Scheduling Assistant ────────────────────────────────────
for (let i = 0; i < 20 && !schedulingAssistantOpen(); i++) {
  clickByName('Open Scheduling Assistant');
  await sleep(400);
}
if (!schedulingAssistantOpen()) {
  throw new Error('Could not open the Scheduling Assistant');
}

// ── Set the date ─────────────────────────────────────────────────────
// Clear any initial __rfb data from the default date (usually today),
// then set the target date so getSchedule fires fresh.
readCapture();

const cellSel = `button[aria-label='${dateCellLabel(date)}']`;
const target = new Date(`${date}T00:00:00`);
const now = new Date();
const navSel = target >= new Date(now.getFullYear(), now.getMonth(), now.getDate())
  ? "button[aria-label^='Go to next month']"
  : "button[aria-label^='Go to previous month']";

const dateInput = $("input[aria-label='Start date']");
if (dateInput) dateInput.click();

for (let i = 0; i < 30; i++) {
  if (exists(cellSel)) {
    $(cellSel).click();
    break;
  }
  if (exists(navSel)) {
    try { $(navSel).click(); } catch (_e) { /* retry */ }
  } else {
    const di = $("input[aria-label='Start date']");
    if (di) di.click();
  }
  await sleep(500);
}

// ── Read the organizer's schedule from CDP-captured getSchedule ──────
// The Scheduling Assistant always includes the organizer's own schedule
// as the first entry in getSchedule. No room/attendee needed.
const allItems = new Map();
let gotData = false;

for (let i = 0; i < 50; i++) {
  await sleep(500);
  for (const pair of readCapture()) {
    for (const [id, s] of schedulesFromPair(pair)) {
      // Collect all scheduleItems from all schedules (organizer is first)
      for (const it of (s.scheduleItems || [])) {
        if (it && it.startTime && it.endTime) {
          const key = JSON.stringify([it.startTime, it.endTime, it.subject]);
          allItems.set(key, it);
        }
      }
      if (s.availabilityView && s.availabilityView.length) gotData = true;
    }
  }
  if (gotData) break;
}

if (!gotData) {
  throw new Error('No schedule data returned — check Outlook login');
}

// ── Filter to target date and build output rows ─────────────────────
const STATUS_MAP = { Busy: 'busy', Tentative: 'tentative', Oof: 'oof',
  WorkingElsewhere: 'elsewhere', Free: 'free' };
const rows = [];

for (const it of allItems.values()) {
  const startDt = new Date(it.startTime.dateTime);
  const endDt = new Date(it.endTime.dateTime);
  const evDate = `${startDt.getFullYear()}-${pad2(startDt.getMonth() + 1)}-${pad2(startDt.getDate())}`;

  if (evDate !== date) continue;

  const state = STATUS_MAP[it.status] || 'busy';
  if (state === 'free') continue;

  const durationMin = Math.round((endDt.getTime() - startDt.getTime()) / 60000);
  if (durationMin < 5 || durationMin > 480) continue;

  rows.push({
    date: evDate,
    subject: it.subject || '(meeting)',
    start: `${pad2(startDt.getHours())}:${pad2(startDt.getMinutes())}`,
    end: `${pad2(endDt.getHours())}:${pad2(endDt.getMinutes())}`,
    durationMin,
    state,
  });
}

// Sort by start time
rows.sort((a, b) => a.start.localeCompare(b.start));
return rows;
