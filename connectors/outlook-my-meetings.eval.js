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

function $(sel) { return document.querySelector(sel); }
function exists(sel) { return !!$(sel); }

// ── Start date handling ──────────────────────────────────────────────
// Canonical source: connectors/lib/owa-date-input.js

/** Describe the numeric layout of a date input's current value by matching its
 *  parts against today's known year/month/day. Returns null when the layout is
 *  undetectable or ambiguous (no recognisable year, or today's day equals its
 *  month so the two positions can't be told apart). */
function detectDateLayout(inputVal) {
  const now = new Date();
  const tY = now.getFullYear(), tM = now.getMonth() + 1, tD = now.getDate();

  const m = String(inputVal || '').match(/(\d+)(\D+)(\d+)(\D+)(\d+)/);
  if (!m) return null;
  const [, p1, sep1, p2, sep2, p3] = m;
  const tokens = [p1, p2, p3];
  const nums = tokens.map(Number);

  const yIdx = nums.findIndex(n => n === tY);
  if (yIdx === -1) return null;

  if (tM === tD) return null;
  const rest = [0, 1, 2].filter(i => i !== yIdx);
  let mIdx, dIdx;
  if (nums[rest[0]] === tM && nums[rest[1]] === tD) {
    mIdx = rest[0]; dIdx = rest[1];
  } else if (nums[rest[0]] === tD && nums[rest[1]] === tM) {
    mIdx = rest[1]; dIdx = rest[0];
  } else {
    return null;
  }

  return { yIdx, mIdx, dIdx, sep1, sep2, tokens };
}

/** Format a target ISO date in the same locale format as the current input
 *  value. Falls back to Intl.DateTimeFormat (browser locale, which may not be
 *  OWA's mailbox regional setting) when the layout can't be detected. */
function formatDateForInput(inputVal, isoDate) {
  const layout = detectDateLayout(inputVal);
  if (!layout) {
    return new Intl.DateTimeFormat(navigator.language).format(new Date(`${isoDate}T12:00:00`));
  }
  const [dY, dM, dD] = isoDate.split('-').map(Number);
  const { yIdx, mIdx, dIdx, sep1, sep2, tokens } = layout;
  // Padding is only readable from a decisive token: 1 char is unpadded, 2 chars
  // below 10 is padded ("07"), 2 chars of 10+ says nothing. Take the whole
  // date's padding from whichever field is decisive.
  const evidence = orig => orig.length === 1 ? false
    : (orig.length === 2 && Number(orig) < 10) ? true
    : null;
  const pads = evidence(tokens[mIdx]) ?? evidence(tokens[dIdx]) ?? true;
  const fmt = val => pads ? String(val).padStart(2, '0') : String(val);
  const out = [];
  out[yIdx] = String(dY);
  out[mIdx] = fmt(dM);
  out[dIdx] = fmt(dD);
  return out[0] + sep1 + out[1] + sep2 + out[2];
}

/** True when a date input's value reads as the given ISO date. `layout` must be
 *  the layout detected BEFORE the value changed (position detection keys off
 *  today's date). Without one, falls back to an order-independent numeric match. */
function inputReadsDate(inputVal, isoDate, layout) {
  const m = String(inputVal || '').match(/(\d+)(\D+)(\d+)(\D+)(\d+)/);
  if (!m) return false;
  const nums = [Number(m[1]), Number(m[3]), Number(m[5])];
  const [dY, dM, dD] = isoDate.split('-').map(Number);
  if (layout) {
    return nums[layout.yIdx] === dY
      && nums[layout.mIdx] === dM
      && nums[layout.dIdx] === dD;
  }
  const want = [dY, dM, dD].sort((a, b) => a - b);
  const got = nums.slice().sort((a, b) => a - b);
  return want.every((v, i) => v === got[i]);
}

/**
 * Set the Scheduling Assistant's Start date to an ISO date (YYYY-MM-DD).
 *
 * Same month: the picker opens on the current month, so the day cell is
 * already visible. Different month: picker month navigation is unreliable
 * (OWA may disable or ignore it) and silently leaves the date unchanged, so
 * type the date instead via execCommand('insertText') — the React value setter
 * pattern sets the value but OWA never reacts to it
 * (see docs/teams-rooms-availability-notes.md).
 *
 * Verifies rather than sleeping blindly: both paths can fail without throwing.
 */
async function setStartDate(isoDate) {
  const sel = "input[aria-label='Start date']";
  const dateInput = $(sel);
  if (!dateInput) throw new Error('Start date input not found');

  const layout = detectDateLayout(dateInput.value);

  const target = new Date(`${isoDate}T00:00:00`);
  const now = new Date();
  const sameMonth = target.getFullYear() === now.getFullYear()
    && target.getMonth() === now.getMonth();

  if (sameMonth) {
    const cellSel = `button[aria-label='${dateCellLabel(isoDate)}']`;
    dateInput.click();
    for (let i = 0; i < 30; i++) {
      if (exists(cellSel)) { $(cellSel).click(); break; }
      await sleep(500);
    }
  } else {
    const formatted = formatDateForInput(dateInput.value, isoDate);
    dateInput.focus();
    dateInput.select();
    document.execCommand('insertText', false, formatted);
    // Enter + blur commits the typed date and triggers getSchedule.
    dateInput.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true,
    }));
    dateInput.blur();
  }

  for (let i = 0; i < 15; i++) {
    await sleep(200);
    const cur = $(sel);
    if (cur && inputReadsDate(cur.value, isoDate, layout)) return;
  }
  const cur = $(sel);
  throw new Error(
    `Could not set the Start date to ${isoDate} (input still reads "${cur ? cur.value : ''}")`,
  );
}

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

await setStartDate(date);

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
