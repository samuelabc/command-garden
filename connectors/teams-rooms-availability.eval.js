// Runs in page context via js_evaluate step.
// Drives the Outlook Scheduling Assistant to fetch free/busy timelines for
// multiple meeting rooms on a single day. Rooms are added sequentially so we
// can reliably map each scheduleId back to the input room name.
//
// Template variables interpolated before execution:
//   ${{ args.rooms }}
//   ${{ args.date | default("") }}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function pad2(n) { return String(n).padStart(2, '0'); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function todayLocalISO() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** "2026-06-18" -> "18, June, 2026" (matches the OWA date-cell aria-label). */
function dateCellLabel(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d}, ${MONTHS[m - 1]}, ${y}`;
}

/** querySelector shorthand, returns null if not found. */
function $(sel) { return document.querySelector(sel); }

/** True when an element matching the selector exists. */
function exists(sel) { return !!$(sel); }

/**
 * Click a button/link by accessible name (aria-label OR visible text).
 * Returns true if an element was found and clicked.
 */
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

/** True when the Scheduling Assistant view (with its Start date picker) is rendered. */
function schedulingAssistantOpen() {
  return Array.from(document.querySelectorAll('input')).some(
    e => (e.getAttribute('aria-label') || '') === 'Start date'
  );
}

/** Type text into an input by selector (focus, set value, dispatch events). */
function typeText(sel, text) {
  const el = $(sel);
  if (!el) throw new Error(`Element "${sel}" not found for typing`);
  el.focus();
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype, 'value'
  ).set;
  setter.call(el, text);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

/** Clear and retype into an input using execCommand, which triggers React's internal events. */
function reactType(sel, text) {
  const el = $(sel);
  if (!el) throw new Error(`Element "${sel}" not found for typing`);
  el.focus();
  el.select();
  document.execCommand('insertText', false, text);
}

// ── Fetch interceptor ────────────────────────────────────────────────
// Captures getSchedule GraphQL responses (the page's own authenticated
// request — the endpoint 401s on replay).
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

/** Read and clear captured {req, body} pairs. */
function readCapture() {
  const d = window.__rfb || [];
  window.__rfb = [];
  return d;
}

/** Map of scheduleId (lowercased) -> schedule object from a captured response body. */
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
 * Build a free/busy timeline (busy/tentative/oof/elsewhere blocks + free gaps)
 * for one local day from getSchedule scheduleItems.
 */
function buildTimeline(items, dateIso) {
  const PRIORITY = { oof: 4, busy: 3, tentative: 2, elsewhere: 1, free: 0 };
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

  const blocks = [];
  for (const it of items) {
    if (!it || !it.startTime || !it.endTime) continue;
    const s = new Date(it.startTime.dateTime).getTime();
    const e = new Date(it.endTime.dateTime).getTime();
    const cs = Math.max(s, dayStart.getTime());
    const ce = Math.min(e, dayEnd.getTime());
    if (ce > cs) blocks.push({ state: mapStatus(it.status), s: cs, e: ce });
  }
  blocks.sort((a, b) => a.s - b.s);

  // Merge overlapping/adjacent busy blocks.
  const merged = [];
  for (const b of blocks) {
    const last = merged[merged.length - 1];
    if (last && b.s <= last.e) {
      last.e = Math.max(last.e, b.e);
      if (PRIORITY[b.state] > PRIORITY[last.state]) last.state = b.state;
    } else {
      merged.push({ ...b });
    }
  }

  const rows = [];
  let cursor = dayStart.getTime();
  for (const b of merged) {
    if (b.s > cursor) rows.push({ state: 'free', s: cursor, e: b.s });
    rows.push({ state: b.state, s: b.s, e: b.e });
    cursor = b.e;
  }
  if (cursor < dayEnd.getTime()) rows.push({ state: 'free', s: cursor, e: dayEnd.getTime() });

  return rows.map(r => ({
    date: dateIso,
    state: r.state,
    start: fmt(r.s),
    end: fmt(r.e),
    durationMin: Math.round((r.e - r.s) / 60000),
  }));
}

// ── Parse arguments ──────────────────────────────────────────────────

const rawRooms = '${{ args.rooms }}'.trim();
if (!rawRooms) throw new Error('Missing rooms argument — pass comma-separated room names or emails');
const roomTokens = rawRooms.split(',').map(r => r.trim()).filter(r => r.length > 0);
if (roomTokens.length === 0) throw new Error('No rooms provided after parsing');

const parsedRooms = roomTokens.map(r => {
  const colonIdx = r.lastIndexOf(':');
  if (colonIdx > 0) {
    const name = r.substring(0, colonIdx).trim();
    const email = r.substring(colonIdx + 1).trim();
    if (EMAIL_RE.test(email)) {
      return { name, email: email.toLowerCase(), mode: 'pair' };
    }
  }
  if (EMAIL_RE.test(r)) {
    return { name: r, email: r.toLowerCase(), mode: 'email' };
  }
  return { name: r, email: null, mode: 'name' };
});

const canBatch = parsedRooms.every(r => r.mode === 'pair');

let date = '${{ args.date | default("") }}'.trim();
if (!date) date = todayLocalISO();
if (!DATE_RE.test(date)) throw new Error(`Invalid date "${date}" — use YYYY-MM-DD`);

// ── Wait for compose form ────────────────────────────────────────────

const __deadline = Date.now() + 30000;
while (Date.now() < __deadline) {
  if (exists("button[aria-label='Open Scheduling Assistant']") ||
      exists("input[aria-label='Start date']")) break;
  await sleep(400);
}
if (!exists("button[aria-label='Open Scheduling Assistant']") &&
    !exists("input[aria-label='Start date']")) {
  if (/login\.|\/oauth2\/|signin|sso/i.test(location.href)) {
    throw new Error('Not signed in to Outlook/Teams — log in and retry');
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

// ── Capture pre-existing mailbox IDs (organizer) ─────────────────────

const seen = new Set();
for (let i = 0; i < 6; i++) {
  await sleep(300);
  for (const pair of readCapture()) {
    for (const id of schedulesFromPair(pair).keys()) seen.add(id);
  }
  if (seen.size > 0) break;
}

// ── Add room by email (required attendees path) ──────────────────────

async function addRoomByEmail(email) {
  clickByName('Expand Required attendees');
  await sleep(200);

  const inputSel = "input[aria-label*='required attendees']";
  for (let i = 0; i < 20 && !exists(inputSel); i++) {
    clickByName('Add required attendee');
    await sleep(200);
  }
  if (!exists(inputSel)) {
    throw new Error('Could not open the required-attendee field');
  }
  typeText(inputSel, email);

  const optionSel = `[role=option][aria-label*='${email}']`;
  let found = false;
  for (let i = 0; i < 40 && !found; i++) {
    await sleep(200);
    found = exists(optionSel);
  }
  if (!found) {
    throw new Error(`Room "${email}" was not found in the directory`);
  }
  $(optionSel).click();
}

// ── Add room by name (room finder path) ──────────────────────────────

async function addRoomByName(name) {
  const inputSel = "input[aria-label='Add a room']";

  // If the input is already visible (reuse after dismissRoom), clear and retype.
  // Otherwise, click "Add a room" to open a fresh finder.
  if (exists(inputSel)) {
    reactType(inputSel, name);
    // Wait for OWA to process the search and refresh suggestions.
    await sleep(1000);
  } else {
    for (let i = 0; i < 30 && !exists(inputSel); i++) {
      clickByName('Add a room');
      await sleep(200);
    }
    if (!exists(inputSel)) {
      throw new Error('Could not open the room finder');
    }
    typeText(inputSel, name);
    // Wait for OWA to process the search and refresh suggestions.
    await sleep(1500);
  }

  let label = null;
  for (let i = 0; i < 40 && !label; i++) {
    await sleep(200);
    const opts = Array.from(document.querySelectorAll('[role=option]'));
    const el = opts.find(o => /capacity/i.test(o.getAttribute('aria-label') || '') && o.offsetParent);
    if (el) {
      el.scrollIntoView({ block: 'center' });
      el.click();
      label = el.getAttribute('aria-label');
    }
  }
  if (!label) {
    throw new Error(`No room matched "${name}"`);
  }
}

// ── Dismiss room: remove the just-added room so "Add a room" reappears ──

async function dismissRoom() {
  // Click the "Remove <room>" button on the most recently added room pill.
  // OWA labels these as e.g. "Remove MY_Site_Building_L4_Room Name."
  const removeBtn = Array.from(document.querySelectorAll('button'))
    .filter(el => el.offsetParent)
    .find(el => (el.getAttribute('aria-label') || '').startsWith('Remove '));
  if (removeBtn) {
    removeBtn.scrollIntoView({ block: 'center' });
    removeBtn.click();
    await sleep(200);
  }

  await sleep(200);
}

// ── Capture schedule for the most recently added room ────────────────

async function captureNewSchedule(knownIds) {
  let newId = null;
  let schedule = null;
  let sawView = false;
  let errMsg = null;
  const itemsById = new Map();

  for (let i = 0; i < 60; i++) {
    await sleep(100);
    for (const pair of readCapture()) {
      for (const [id, s] of schedulesFromPair(pair)) {
        if (knownIds.has(id)) continue;
        if (!newId) newId = id;
        if (id !== newId) continue;
        schedule = s;
        if (s.error) errMsg = s.error.message || s.error.responseCode || 'unknown';
        if (s.availabilityView && s.availabilityView.length) sawView = true;
        for (const it of (s.scheduleItems || [])) {
          const key = it && it.id ? it.id : JSON.stringify(it && [it.startTime, it.endTime, it.subject]);
          if (it) itemsById.set(key, it);
        }
      }
    }
    if (sawView) break;
  }

  return { newId, schedule, sawView, errMsg, items: [...itemsById.values()] };
}

/**
 * Batch capture: wait for getSchedule responses covering all expected emails.
 * Returns a Map of email (lowercased) -> { schedule, items, sawView, errMsg }.
 */
async function captureBatchSchedules(expectedEmails, knownIds) {
  const byEmail = new Map();

  for (let i = 0; i < 80; i++) {
    await sleep(100);
    for (const pair of readCapture()) {
      for (const [id, s] of schedulesFromPair(pair)) {
        if (knownIds.has(id)) continue;
        const idLower = id.toLowerCase();
        if (!expectedEmails.has(idLower)) continue;
        const items = (s.scheduleItems || []).filter(Boolean);
        byEmail.set(idLower, {
          schedule: s,
          items,
          sawView: !!(s.availabilityView && s.availabilityView.length),
          errMsg: s.error ? (s.error.message || s.error.responseCode || 'unknown') : null,
        });
      }
    }
    if (expectedEmails.size > 0 && [...expectedEmails].every(e => byEmail.has(e))) break;
  }

  return byEmail;
}

// ── Room processing ──────────────────────────────────────────────────

const allRows = [];
const knownIds = new Set(seen);

if (canBatch) {
  // ── Batch mode: add all rooms via room finder, single capture ──────
  const emailToName = new Map();
  const expectedEmails = new Set();
  for (const r of parsedRooms) {
    emailToName.set(r.email, r.name);
    expectedEmails.add(r.email);
  }

  // Clear stale captures, then add all rooms without dismissing.
  readCapture();

  for (const r of parsedRooms) {
    try {
      await addRoomByName(r.name);
      await sleep(300);
    } catch (addErr) {
      allRows.push({
        roomName: r.name, roomEmail: r.email, date,
        state: 'error', start: addErr.message, end: '', durationMin: 0,
      });
      expectedEmails.delete(r.email);
    }
  }

  // Single batch capture for all successfully added rooms.
  if (expectedEmails.size > 0) {
    const results = await captureBatchSchedules(expectedEmails, knownIds);

    for (const [email, data] of results) {
      const name = emailToName.get(email);
      knownIds.add(email);
      if (data.errMsg && !data.sawView) {
        allRows.push({
          roomName: name, roomEmail: email, date,
          state: 'error', start: `Free/busy error: ${data.errMsg}`,
          end: '', durationMin: 0,
        });
      } else {
        const timeline = buildTimeline(data.items, date);
        for (const row of timeline) {
          allRows.push({ roomName: name, roomEmail: email, ...row });
        }
      }
    }

    // Report rooms not found in any captured response.
    for (const email of expectedEmails) {
      if (!results.has(email)) {
        allRows.push({
          roomName: emailToName.get(email), roomEmail: email, date,
          state: 'error', start: `No free/busy returned for "${emailToName.get(email)}" on ${date}`,
          end: '', durationMin: 0,
        });
      }
    }
  }
} else {
  // ── Sequential mode (original behavior) ────────────────────────────
  for (const r of parsedRooms) {
    const isEmail = r.mode === 'email';

    // Clear any pending captures before adding this room.
    readCapture();

    try {
      if (isEmail) {
        await addRoomByEmail(r.name);
      } else {
        await addRoomByName(r.name);
      }
    } catch (addErr) {
      allRows.push({
        roomName: r.name, roomEmail: r.email || '', date,
        state: 'error', start: addErr.message, end: '', durationMin: 0,
      });
      continue;
    }

    // Capture the getSchedule response immediately after adding (before dismiss).
    const result = await captureNewSchedule(knownIds);

    // Remove the room so "Add a room" reappears for the next room.
    await dismissRoom();

    if (!result.newId) {
      allRows.push({
        roomName: r.name, roomEmail: r.email || '', date,
        state: 'error', start: `No free/busy returned for "${r.name}" on ${date}`,
        end: '', durationMin: 0,
      });
      continue;
    }

    knownIds.add(result.newId);

    if (result.errMsg && !result.sawView) {
      allRows.push({
        roomName: r.name, roomEmail: result.newId, date,
        state: 'error', start: `Free/busy error: ${result.errMsg}`,
        end: '', durationMin: 0,
      });
      continue;
    }

    const timeline = buildTimeline(result.items, date);
    for (const row of timeline) {
      allRows.push({ roomName: r.name, roomEmail: result.newId, ...row });
    }
  }
}

if (allRows.length === 0) {
  throw new Error(`No results for any of the ${parsedRooms.length} room(s) on ${date}`);
}

return allRows;
