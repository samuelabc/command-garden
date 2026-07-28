// Runs in page context via js_evaluate step.
// Drives the Outlook Scheduling Assistant to fetch a meeting-room's free/busy
// timeline for a single day. Strategy: reuse the authenticated browser session,
// drive the UI to trigger the page's own GraphQL getSchedule call, and intercept
// the response (the endpoint 401s on replay).
//
// Template variables interpolated before execution:
//   ${{ args.room }}
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
 * used by typeText() sets the value but OWA never reacts to it.
 *
 * Always verifies: an uncommitted date is not visible in the output, because
 * buildTimeline() clips to the requested day and a fully-booked room then
 * reads back as free all day.
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

// ── Fetch interceptor ────────────────────────────────────────────────
// Captures getSchedule GraphQL responses (the page's own authenticated
// request — the endpoint 401s on replay).
if (!window.__rfb) {
  window.__rfb = []; // getSchedule (free/busy) captures
  window.__rfm = []; // findmeetinglocations (room resolution + capacity) captures
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
        } else if (String(u).indexOf('findmeetinglocations') > -1) {
          r.clone().text().then(t => {
            window.__rfm.push({ req: String(rb || ''), body: t });
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

/** Read and clear captured findmeetinglocations {req, body} pairs. */
function readMeetingLocationCapture() {
  const d = window.__rfm || [];
  window.__rfm = [];
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

// ── Main flow ────────────────────────────────────────────────────────

const roomsArgRaw = '${{ args.rooms | default("") }}'.trim();
const multiMode = roomsArgRaw.length > 0;

const room = '${{ args.room | default("") }}'.trim();
if (!multiMode && !room) throw new Error('Missing room argument — pass "room" or "rooms"');
const isEmail = EMAIL_RE.test(room);

const roomList = multiMode
  ? roomsArgRaw.split(',').map(s => s.trim()).filter(Boolean)
  : [room];

let date = '${{ args.date | default("") }}'.trim();
if (!date) date = todayLocalISO();
if (!DATE_RE.test(date)) throw new Error(`Invalid date "${date}" — use YYYY-MM-DD`);

// Wait for compose form controls (handles SSO redirect delays).
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

// Open the Scheduling Assistant (free/busy view).
for (let i = 0; i < 20 && !schedulingAssistantOpen(); i++) {
  clickByName('Open Scheduling Assistant');
  await sleep(400);
}
if (!schedulingAssistantOpen()) {
  throw new Error('Could not open the Scheduling Assistant');
}

// ── Set the date ─────────────────────────────────────────────────────
await setStartDate(date);

// ── Capture pre-existing mailbox IDs (organizer) ─────────────────────
// Rooms are identified by elimination (any scheduleId not in `seen`), so every
// schedule already on the form must land here first.
//
// Deliberately does NOT clear the buffer beforehand: opening the Scheduling
// Assistant fires a getSchedule for the organizer, and that is the most
// reliable source of their id — when the requested date is already the one on
// the form, the date change fires nothing at all. `seen` holds mailbox ids, not
// per-week data, so a response for the wrong week is still useful here.
//
// Drains until captures go quiet rather than stopping at the first one, so a
// late date-change response can't arrive after the room-add and be read as a room.
const seen = new Set();
let quietPolls = 0;
for (let i = 0; i < 20; i++) {
  await sleep(300);
  let arrived = false;
  for (const pair of readCapture()) {
    for (const id of schedulesFromPair(pair).keys()) {
      seen.add(id);
      arrived = true;
    }
  }
  quietPolls = arrived ? 0 : quietPolls + 1;
  if (seen.size > 0 && quietPolls >= 3) break;
}

// Elimination is unsound without a baseline: every id would look like a room
// and the organizer's own calendar would be reported as one. Only the
// single-room-by-email path identifies its target directly.
if (seen.size === 0 && !(isEmail && !multiMode)) {
  throw new Error('No free/busy responses captured before adding rooms — cannot tell rooms apart from the organizer');
}

// ── Add the room(s) ───────────────────────────────────────────────────
/** { email, capacity } per room, pushed in the same order as roomList as each is resolved. */
const roomMeta = [];

/** Add one room by name via the room finder (proven path — resolves the resource mailbox). */
async function addRoomByName(name) {
  readMeetingLocationCapture(); // drop stale captures before triggering a fresh search

  const inputSel = "input[aria-label='Add a room']";
  for (let i = 0; i < 20 && !exists(inputSel); i++) {
    clickByName('Add a room');
    await sleep(400);
  }
  if (!exists(inputSel)) {
    throw new Error('Could not open the room finder');
  }
  typeText(inputSel, name);
  await sleep(1000);

  // Resolve the authoritative email + real capacity from the page's own
  // findmeetinglocations call (triggered by the search above).
  let resolvedEmail = null;
  let resolvedCapacity = undefined;
  for (let i = 0; i < 15 && !resolvedEmail; i++) {
    await sleep(300);
    for (const pair of readMeetingLocationCapture()) {
      let body;
      try { body = JSON.parse(pair.body); } catch (_e) { continue; }
      const loc = body?.MeetingLocations?.[0]?.MeetingLocation;
      if (loc?.LocationEmailAddress) {
        resolvedEmail = String(loc.LocationEmailAddress).toLowerCase();
        if (typeof loc.Capacity === 'number') resolvedCapacity = loc.Capacity;
      }
    }
  }

  let label = null;
  for (let i = 0; i < 25 && !label; i++) {
    await sleep(400);
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
  if (resolvedCapacity === undefined) {
    // Fallback: parse capacity from the option label if the network capture missed it.
    const capMatch = /capacity:?\s*(\d+)/i.exec(label);
    if (capMatch) resolvedCapacity = Number(capMatch[1]);
  }
  roomMeta.push({ email: resolvedEmail, capacity: resolvedCapacity });
  await sleep(300);
}

if (multiMode) {
  for (const name of roomList) {
    await addRoomByName(name);
  }
} else if (isEmail) {
  // Email -> attendee picker (resolves SMTP). Kept for direct single-room email lookups;
  // capacity is not available via this path.
  clickByName('Expand Required attendees');
  await sleep(400);
  const inputSel = "input[aria-label*='required attendees']";
  for (let i = 0; i < 20 && !exists(inputSel); i++) {
    clickByName('Add required attendee');
    await sleep(400);
  }
  if (!exists(inputSel)) {
    throw new Error('Could not open the required-attendee field');
  }
  typeText(inputSel, room);
  const optionSel = `[role=option][aria-label*='${room}']`;
  let found = false;
  for (let i = 0; i < 20 && !found; i++) {
    await sleep(400);
    found = exists(optionSel);
  }
  if (!found) {
    throw new Error(`Room "${room}" was not found in the directory`);
  }
  $(optionSel).click();
} else {
  await addRoomByName(room);
}

// ── Collect free/busy from intercepted responses ─────────────────────
// Any schedule id not present in the pre-add "seen" set is one of the rooms we just added
// (works uniformly for one room or many, since we only ever add rooms after capturing `seen`).
const isTargetId = id => (isEmail && !multiMode) ? id === room.toLowerCase() : !seen.has(id);
const expectedCount = multiMode ? roomList.length : 1;

// scheduleId(lower) -> { scheduleId, itemsById: Map, sawView: bool, errMsg: string|null }
const roomData = new Map();

let stable = 0;
for (let i = 0; i < 60; i++) {
  await sleep(500);
  for (const pair of readCapture()) {
    for (const [id, s] of schedulesFromPair(pair)) {
      if (!isTargetId(id)) continue;
      if (!roomData.has(id)) {
        roomData.set(id, { scheduleId: s.scheduleId, itemsById: new Map(), sawView: false, errMsg: null });
      }
      const rd = roomData.get(id);
      if (s.error) rd.errMsg = s.error.message || s.error.responseCode || 'unknown';
      if (s.availabilityView && s.availabilityView.length) rd.sawView = true;
      for (const it of (s.scheduleItems || [])) {
        const key = it && it.id ? it.id : JSON.stringify(it && [it.startTime, it.endTime, it.subject]);
        if (it) rd.itemsById.set(key, it);
      }
    }
  }
  const allSeen = roomData.size >= expectedCount && [...roomData.values()].every(rd => rd.sawView);
  if (allSeen) { stable += 1; if (stable >= 2) break; } else { stable = 0; }
}

if (roomData.size === 0) {
  throw new Error(`No free/busy returned for ${multiMode ? roomList.join(', ') : `"${room}"`} on ${date}`);
}
if (!multiMode) {
  const rd = [...roomData.values()][0];
  if (rd.errMsg && !rd.sawView) {
    throw new Error(`Free/busy error for "${room}": ${rd.errMsg}`);
  }
}

function emitForRoomData(rd, meta) {
  if (rd.errMsg && !rd.sawView) return; // multi-mode: skip rooms that errored, keep the rest
  const timeline = buildTimeline([...rd.itemsById.values()], date);
  const roomEmail = meta?.email || rd.scheduleId;
  const capacity = meta?.capacity ?? null;
  for (const row of timeline) results.push({ room: roomEmail, capacity, ...row });
}

const results = [];
if (multiMode || !isEmail) {
  // Prefer matching by the resolved email (authoritative); fall back to the next
  // unclaimed schedule in insertion order if the network capture missed it.
  const claimed = new Set();
  for (const meta of roomMeta) {
    let rd = null;
    let claimId = null;
    if (meta?.email && roomData.has(meta.email)) {
      claimId = meta.email;
    } else {
      claimId = [...roomData.keys()].find(id => !claimed.has(id)) || null;
    }
    if (claimId) {
      rd = roomData.get(claimId);
      claimed.add(claimId);
    }
    if (rd) emitForRoomData(rd, meta);
  }
} else {
  const rd = roomData.get(room.toLowerCase()) || [...roomData.values()][0];
  if (rd) emitForRoomData(rd, null);
}
return results;
