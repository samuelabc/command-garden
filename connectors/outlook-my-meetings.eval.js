// Runs in page context via js_evaluate step (executed by CDP Runtime.evaluate
// to bypass Outlook's CSP — see chrome-adapter.ts evaluateViaCdp).
//
// Strategy: drives the OWA Scheduling Assistant (same as room-availability)
// to trigger a getSchedule GraphQL call. The organizer's own schedule is
// always the first entry — no room/attendee needs to be added.
//
// The Scheduling Assistant grid always renders the *whole work week* around
// whichever date is selected (it's designed for finding a free slot across
// the week), so a single call returns every day's events for that week —
// `args.date` is just an anchor date used to navigate to the right week; the
// output includes ALL days present in the captured schedule, not just the
// anchor day. Callers should call this once per week (not once per weekday)
// and filter/group the returned rows by date as needed.
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

/** Format a target ISO date (YYYY-MM-DD) in the same locale format as the
 *  current Start date input value. Detects format by comparing the input's
 *  numeric parts against today's known year/month/day. Falls back to
 *  Intl.DateTimeFormat when format detection is ambiguous (e.g. day == month). */
function formatDateForInput(inputVal, isoDate) {
  const now = new Date();
  const tY = now.getFullYear(), tM = now.getMonth() + 1, tD = now.getDate();
  const [dY, dM, dD] = isoDate.split('-').map(Number);

  const m = inputVal.match(/(\d+)(\D+)(\d+)(\D+)(\d+)/);
  if (!m) {
    return new Intl.DateTimeFormat(navigator.language).format(new Date(`${isoDate}T12:00:00`));
  }
  const [, p1, sep1, p2, sep2, p3] = m;
  const nums = [Number(p1), Number(p2), Number(p3)];

  // Identify year position (unambiguous — 4-digit or matches current year)
  const yIdx = nums.findIndex(n => n === tY);
  if (yIdx === -1) {
    return new Intl.DateTimeFormat(navigator.language).format(new Date(`${isoDate}T12:00:00`));
  }

  // Identify month vs day from the remaining two positions
  const rest = [0, 1, 2].filter(i => i !== yIdx);
  if (tM === tD) {
    // Ambiguous: today's day equals month — can't distinguish, use Intl
    return new Intl.DateTimeFormat(navigator.language).format(new Date(`${isoDate}T12:00:00`));
  }

  let mIdx, dIdx;
  if (nums[rest[0]] === tM && nums[rest[1]] === tD) {
    mIdx = rest[0]; dIdx = rest[1];
  } else if (nums[rest[0]] === tD && nums[rest[1]] === tM) {
    mIdx = rest[1]; dIdx = rest[0];
  } else {
    return new Intl.DateTimeFormat(navigator.language).format(new Date(`${isoDate}T12:00:00`));
  }

  // Reconstruct with target date values, preserving original zero-padding
  const tokens = [p1, p2, p3];
  const fmt = (val, orig) => orig.length >= 2 ? String(val).padStart(2, '0') : String(val);
  const out = [];
  out[yIdx] = String(dY);
  out[mIdx] = fmt(dM, tokens[mIdx]);
  out[dIdx] = fmt(dD, tokens[dIdx]);
  return out[0] + sep1 + out[1] + sep2 + out[2];
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

const target = new Date(`${date}T00:00:00`);
const now = new Date();
const sameMonth = target.getFullYear() === now.getFullYear()
  && target.getMonth() === now.getMonth();

const dateInput = $("input[aria-label='Start date']");

if (sameMonth) {
  // Same month: calendar picker opens on the current month, so the target
  // cell is already visible — click the input to open the picker, find the cell.
  const cellSel = `button[aria-label='${dateCellLabel(date)}']`;
  if (dateInput) dateInput.click();
  for (let i = 0; i < 30; i++) {
    if (exists(cellSel)) {
      $(cellSel).click();
      break;
    }
    await sleep(500);
  }
} else {
  // Different month: calendar picker navigation to past months is unreliable
  // (OWA Scheduling Assistant may disable backward navigation). Instead, type
  // the date directly into the input using execCommand('insertText'), which
  // triggers React's SyntheticEvent system — the React value setter (typeText)
  // silently fails on OWA inputs (see docs/teams-rooms-availability-notes.md).
  if (dateInput) {
    const formatted = formatDateForInput(dateInput.value, date);
    dateInput.focus();
    dateInput.select();
    document.execCommand('insertText', false, formatted);
    // Blur + Enter to commit the typed date and trigger getSchedule
    dateInput.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true
    }));
    dateInput.blur();
    await sleep(2000);
  }
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

// ── Build output rows for every day captured (whole visible week) ───
const STATUS_MAP = { Busy: 'busy', Tentative: 'tentative', Oof: 'oof',
  WorkingElsewhere: 'elsewhere', Free: 'free' };
const rows = [];

for (const it of allItems.values()) {
  const startDt = new Date(it.startTime.dateTime);
  const endDt = new Date(it.endTime.dateTime);
  const evDate = `${startDt.getFullYear()}-${pad2(startDt.getMonth() + 1)}-${pad2(startDt.getDate())}`;

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

// Sort by date first, then start time (rows now span multiple days)
rows.sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));
return rows;
