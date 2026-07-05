// Runs in page context via js_evaluate step.
// Captures the user's OWN meeting schedule from Outlook's Scheduling Assistant.
//
// Strategy: navigate to the OWA calendar compose deeplink, open the Scheduling
// Assistant, and intercept the getSchedule GraphQL call that fires automatically
// for the organizer. The organizer's scheduleItems contain their meetings.
//
// Key difference from teams-room-availability: we do NOT add any room or attendee.
// The organizer's own schedule loads automatically when the Scheduling Assistant opens.
//
// Shared helpers and fetch interceptor are adapted from teams-room-availability.eval.js.
//
// Template variables interpolated before execution:
//   ${{ args.date }}

// ── Shared helpers ────────────────────────────────────────────────────

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

function pad2(n) { return String(n).padStart(2, '0'); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function todayLocalISO() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function $(sel) { return document.querySelector(sel); }
function exists(sel) { return !!$(sel); }

/** Click a button/link by accessible name (aria-label OR visible text). */
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

// ── Fetch interceptor — captures getSchedule GraphQL responses ────────
// Installs a monkey-patch on window.fetch to record getSchedule calls.
// The organizer's own schedule fires automatically when the SA opens.
if (!window.__rfb) {
  window.__rfb = [];
  const origFetch = window.fetch;
  window.fetch = function () {
    const a = arguments;
    const u = (a[0] && a[0].url) || a[0] || '';
    const rb = (a[1] && a[1].body) || '';
    return origFetch.apply(this, a).then(r => {
      try {
        if (String(u).indexOf('graphql') > -1) {
          r.clone().text().then(t => {
            if (t.indexOf('getSchedule') > -1 && t.indexOf('availabilityView') > -1) {
              window.__rfb.push({ req: String(rb || ''), body: t });
            }
          }).catch(() => {});
        }
      } catch (_e) { /* ignore */ }
      return r;
    });
  };
}

function readCapture() {
  const d = window.__rfb || [];
  window.__rfb = [];
  return d;
}

/** Extract schedule objects from a captured getSchedule response. */
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

/**
 * Build a timeline of busy/tentative/oof blocks for one day from scheduleItems.
 * Returns only non-free blocks (the user's actual meetings/events).
 */
function buildMeetings(items, dateIso) {
  const mapStatus = st => ({
    Busy: 'busy', Tentative: 'tentative', Oof: 'oof', WorkingElsewhere: 'elsewhere', Free: 'free',
  }[st] || 'busy');

  const dayStart = new Date(`${dateIso}T00:00:00`);
  const dayEnd = new Date(dayStart.getTime() + 86400000);
  const fmt = ms => {
    if (ms >= dayEnd.getTime()) return '24:00';
    const d = new Date(ms);
    return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  };

  const meetings = [];
  for (const it of items) {
    if (!it || !it.startTime || !it.endTime) continue;
    const status = mapStatus(it.status);
    // Only include busy/tentative blocks (actual meetings), skip free gaps
    if (status === 'free') continue;

    const s = new Date(it.startTime.dateTime).getTime();
    const e = new Date(it.endTime.dateTime).getTime();
    const cs = Math.max(s, dayStart.getTime());
    const ce = Math.min(e, dayEnd.getTime());
    if (ce <= cs) continue;

    meetings.push({
      date: dateIso,
      subject: it.subject || '(meeting)',
      start: fmt(cs),
      end: fmt(ce),
      durationMin: Math.round((ce - cs) / 60000),
      state: status,
    });
  }

  return meetings;
}

// ── Main flow ─────────────────────────────────────────────────────────

const date = '${{ args.date }}'.trim();
if (!DATE_RE.test(date)) throw new Error(`Invalid date "${date}" — use YYYY-MM-DD`);

// Wait for compose form controls (handles SSO redirect delays)
const __deadline2 = Date.now() + 30000;
while (Date.now() < __deadline2) {
  if (exists("button[aria-label='Open Scheduling Assistant']") ||
      exists("input[aria-label='Start date']")) break;
  await sleep(1000);
}
if (!exists("button[aria-label='Open Scheduling Assistant']") &&
    !exists("input[aria-label='Start date']")) {
  if (/login\.|\/oauth2\/|signin|sso/i.test(location.href)) {
    throw new Error('Not signed in to Outlook — log in and retry');
  }
  throw new Error('Calendar compose form did not load');
}

// Open the Scheduling Assistant
for (let i = 0; i < 12 && !schedulingAssistantOpen(); i++) {
  clickByName('Open Scheduling Assistant');
  await sleep(1000);
}
if (!schedulingAssistantOpen()) {
  throw new Error('Could not open the Scheduling Assistant');
}

// ── Set the date by typing directly into the Start date input ─────────
// The old approach navigated the calendar picker month-by-month clicking
// date cells by aria-label, which looped endlessly when labels didn't match.
// Instead, we focus the input, clear it, type the formatted date, and
// press Enter to confirm — much more reliable.
const dateInput = $("input[aria-label='Start date']");
if (dateInput) {
  // Format date as M/D/YYYY (OWA's expected input format for en-US locale)
  const [y, m, d] = date.split('-').map(Number);
  const formatted = `${m}/${d}/${y}`;

  dateInput.focus();
  dateInput.select();
  // Use the React-compatible value setter to update the controlled input
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype, 'value'
  ).set;
  setter.call(dateInput, formatted);
  dateInput.dispatchEvent(new Event('input', { bubbles: true }));
  dateInput.dispatchEvent(new Event('change', { bubbles: true }));
  // Press Enter to confirm the date and close any open picker
  dateInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
  await sleep(2000);
}

// ── Capture the organizer's own schedule ──────────────────────────────
// When the Scheduling Assistant opens, it automatically fires getSchedule
// for the organizer. We capture those responses — the organizer's scheduleItems
// contain their meetings for the selected day.

const allItems = new Map();
let sawView = false;
let stable = 0;

for (let i = 0; i < 30; i++) {
  await sleep(1000);
  for (const pair of readCapture()) {
    for (const [id, s] of schedulesFromPair(pair)) {
      if (s.availabilityView && s.availabilityView.length) sawView = true;
      // Collect all schedule items from all captured schedules.
      // The first schedule(s) are the organizer's own.
      for (const it of (s.scheduleItems || [])) {
        const key = it && it.id ? it.id : JSON.stringify(it && [it.startTime, it.endTime, it.subject]);
        if (it) allItems.set(key, it);
      }
    }
  }
  if (sawView) { stable += 1; if (stable >= 3) break; }
}

if (allItems.size === 0 && !sawView) {
  // No schedule data captured — might be an empty day or auth issue
  return [];
}

const rows = buildMeetings([...allItems.values()], date);
return rows;
