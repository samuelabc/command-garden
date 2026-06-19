/**
 * Microsoft Teams / Outlook meeting-room availability — free/busy timeline for ONE room.
 *
 * Teams Calendar embeds Outlook on the web (OWA). When a room is added to the
 * Scheduling Assistant, OWA asks its GraphQL gateway (`/outlookgatewayb2/graphql`,
 * operation `GetSchedule`) for that mailbox's free/busy. The response is the Graph
 * `getSchedule` contract: an `availabilityView` slot string plus `scheduleItems`.
 *
 * A direct/replayed fetch to that endpoint returns 401 (OWA injects a per-request
 * canary + bearer that are not reproducible from page context; the MSAL token cache
 * is encrypted and the canary cookie is httpOnly). So we use the page's OWN request
 * machinery: drive the Scheduling Assistant in the logged-in session and intercept
 * the GraphQL free/busy response.
 *
 * Strategy: COOKIE (reuse the authenticated browser session) + UI drive + intercept.
 */
import { cli, Strategy } from '@jackwener/opencli/registry';
import { ArgumentError, AuthRequiredError, EmptyResultError, CliError } from '@jackwener/opencli/errors';

const DOMAIN = 'outlook.cloud.microsoft.mcas.ms';
const COMPOSE_URL = 'https://outlook.cloud.microsoft.mcas.ms/calendar/deeplink/compose';
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function pad2(n) { return String(n).padStart(2, '0'); }

function todayLocalISO() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** "2026-06-18" -> "18, June, 2026" (matches the OWA date-cell aria-label). */
function dateCellLabel(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d}, ${MONTHS[m - 1]}, ${y}`;
}

/**
 * Build a free/busy timeline (busy/tentative/oof/elsewhere blocks + free gaps) for one
 * local day from getSchedule `scheduleItems`. Computed in the BROWSER context so the
 * user's calendar timezone is applied correctly (scheduleItems dateTimes are UTC).
 * Returns rows: { date, state, start, end, durationMin }.
 */
async function buildTimeline(page, items, dateIso) {
  return page.evaluate((arg) => {
    const items = arg.items || [];
    const dateIso = arg.dateIso;
    const PRIORITY = { oof: 4, busy: 3, tentative: 2, elsewhere: 1, free: 0 };
    const mapStatus = (st) => ({
      Busy: 'busy', Tentative: 'tentative', Oof: 'oof', WorkingElsewhere: 'elsewhere', Free: 'free',
    }[st] || 'busy');

    const dayStart = new Date(`${dateIso}T00:00:00`); // local midnight (browser TZ)
    const dayEnd = new Date(dayStart.getTime() + 86400000);
    const pad = (n) => String(n).padStart(2, '0');
    const fmt = (ms) => {
      if (ms >= dayEnd.getTime()) return '24:00';
      const d = new Date(ms);
      return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
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

    // Merge overlapping/adjacent busy blocks (rooms aren't normally double-booked).
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

    return rows.map((r) => ({
      date: dateIso,
      state: r.state,
      start: fmt(r.s),
      end: fmt(r.e),
      durationMin: Math.round((r.e - r.s) / 60000),
    }));
  }, { items, dateIso });
}

/**
 * Inject a fetch interceptor that captures getSchedule GraphQL responses (the page's own
 * authenticated request — the endpoint 401s on replay). We read free/busy from the
 * response body; the request body is kept for debugging.
 */
async function installCapture(page) {
  await page.evaluate(() => {
    if (window.__rfb) return;
    window.__rfb = [];
    const of = window.fetch;
    window.fetch = function () {
      const a = arguments;
      const u = (a[0] && a[0].url) || a[0] || '';
      const rb = (a[1] && a[1].body) || '';
      return of.apply(this, a).then((r) => {
        try {
          if (String(u).indexOf('graphql') > -1) {
            r.clone().text().then((t) => {
              if (t.indexOf('getSchedule') > -1 && t.indexOf('availabilityView') > -1) {
                window.__rfb.push({ req: String(rb || ''), body: t });
              }
            }).catch(() => {});
          }
        } catch (_e) { /* ignore */ }
        return r;
      });
    };
  });
}

/** Read and clear captured {req, body} pairs. */
async function readCapture(page) {
  const data = await page.evaluate(() => {
    const d = window.__rfb || [];
    window.__rfb = [];
    return d;
  });
  return Array.isArray(data) ? data : [];
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

/** True when the Scheduling Assistant view (with its Start date picker) is rendered. */
async function schedulingAssistantOpen(page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('input')).some(
      (e) => (e.getAttribute('aria-label') || '') === 'Start date'
    )
  );
}

/** Presence check by CSS selector, robust to the SPA's slow/async rendering. */
async function exists(page, selector) {
  return page.evaluate((sel) => !!document.querySelector(sel), selector);
}

/**
 * Click a button/link by accessible name (aria-label OR visible text). Several OWA
 * Scheduling Assistant controls (e.g. "Add required attendee") have an empty
 * aria-label and are named only by text, so CSS attribute selectors cannot match them.
 * Returns true if an element was found and clicked.
 */
async function clickByName(page, name) {
  return page.evaluate((t) => {
    const els = Array.from(document.querySelectorAll('button,a,[role=button]'));
    const el = els.find((e) => {
      if (!e.offsetParent) return false;
      const al = (e.getAttribute('aria-label') || '').trim();
      const tx = (e.textContent || '').replace(/\s+/g, ' ').trim();
      return al === t || al.includes(t) || tx.includes(t);
    });
    if (!el) return false;
    el.scrollIntoView({ block: 'center' });
    el.click();
    return true;
  }, name);
}

async function ensureSchedulingAssistant(page) {
  for (let i = 0; i < 12 && !(await schedulingAssistantOpen(page)); i++) {
    await clickByName(page, 'Open Scheduling Assistant');
    await page.wait({ time: 1 });
  }
  if (!(await schedulingAssistantOpen(page))) {
    throw new CliError('UPSTREAM', 'Could not open the Scheduling Assistant', 'Open the Teams/Outlook calendar in the connected browser and retry');
  }
}

async function setDate(page, iso) {
  const cellSel = `button[aria-label='${dateCellLabel(iso)}']`;
  const target = new Date(`${iso}T00:00:00`);
  const now = new Date();
  const navSelector = target >= new Date(now.getFullYear(), now.getMonth(), now.getDate())
    ? "button[aria-label^='Go to next month']"
    : "button[aria-label^='Go to previous month']";

  await page.click("input[aria-label='Start date']");
  // Poll: the picker can open slowly on a freshly loaded compose. Click the target
  // day when present; otherwise page months toward it, re-opening the picker if it closed.
  for (let i = 0; i < 30; i++) {
    if (await exists(page, cellSel)) {
      await page.click(cellSel);
      return;
    }
    if (await exists(page, navSelector)) {
      try { await page.click(navSelector); } catch (_e) { /* retry */ }
    } else {
      try { await page.click("input[aria-label='Start date']"); } catch (_e) { /* retry */ }
    }
    await page.wait({ time: 1 });
  }
  throw new ArgumentError(`Could not select date ${iso} in the calendar`, 'Use a date within a reasonable range, format YYYY-MM-DD');
}

/**
 * Add a room by mailbox email via the "Add required attendee" field. The room finder
 * ("Add a room") searches by display name and does NOT resolve raw SMTP addresses, but
 * the attendee picker does. The resolved suggestion's aria-label contains the email.
 */
async function addViaAttendee(page, email) {
  // Expand the "Required attendees" section if collapsed (no-op when already open).
  await clickByName(page, 'Expand Required attendees');
  await page.wait({ time: 1 });

  const inputSel = "input[aria-label*='required attendees']";
  for (let i = 0; i < 12 && !(await exists(page, inputSel)); i++) {
    await clickByName(page, 'Add required attendee');
    await page.wait({ time: 1 });
  }
  if (!(await exists(page, inputSel))) {
    throw new CliError('UPSTREAM', 'Could not open the required-attendee field', 'The Teams/Outlook calendar UI may have changed');
  }
  await page.typeText(inputSel, email);

  const optionSel = `[role=option][aria-label*='${email}']`;
  let found = false;
  for (let i = 0; i < 12 && !found; i++) {
    await page.wait({ time: 1 });
    found = await exists(page, optionSel);
  }
  if (!found) {
    throw new EmptyResultError('teams roomfreebusy', `Room "${email}" was not found in the directory`);
  }
  await page.click(optionSel);
}

/**
 * Add a room via the Scheduling Assistant "Add a room" finder, which accepts a room
 * name and resolves it to the room mailbox. Clicks the top room suggestion (room options
 * carry "Capacity" in their aria-label). Returns the resolved suggestion label.
 */
async function addViaRoomFinder(page, query) {
  const inputSel = "input[aria-label='Add a room']";
  for (let i = 0; i < 10 && !(await exists(page, inputSel)); i++) {
    await clickByName(page, 'Add a room');
    await page.wait({ time: 1 });
  }
  if (!(await exists(page, inputSel))) {
    throw new CliError('UPSTREAM', 'Could not open the room finder', 'The Teams/Outlook calendar UI may have changed');
  }
  await page.typeText(inputSel, query);

  // Poll for, then click, the top room suggestion (room options carry "Capacity").
  let label = null;
  for (let i = 0; i < 14 && !label; i++) {
    await page.wait({ time: 1 });
    label = await page.evaluate(() => {
      const opts = Array.from(document.querySelectorAll('[role=option]'));
      const el = opts.find((o) => /capacity/i.test(o.getAttribute('aria-label') || '') && o.offsetParent);
      if (!el) return null;
      el.scrollIntoView({ block: 'center' });
      el.click();
      return el.getAttribute('aria-label');
    });
  }
  if (!label) {
    throw new EmptyResultError('teams roomfreebusy', `No room matched "${query}"`);
  }
  return label;
}

cli({
  site: 'teams',
  name: 'roomfreebusy',
  access: 'read',
  description: 'Meeting-room free/busy timeline for one room on a given day (Teams/Outlook calendar)',
  example: 'opencli teams roomfreebusy --room "MBTMY The Vista" --date 2026-06-18',
  domain: DOMAIN,
  strategy: Strategy.COOKIE,
  browser: true,
  args: [
    { name: 'room', type: 'string', help: 'Room name or mailbox email (search term, e.g. "MBTMY The Vista")' },
    { name: 'date', type: 'string', default: '', help: 'Day to check, YYYY-MM-DD (default: today)' },
  ],
  columns: ['room', 'date', 'state', 'start', 'end', 'durationMin'],
  func: async (page, args) => {
    const room = String(args.room || '').trim();
    if (!room) {
      throw new ArgumentError('Missing --room', 'Pass a room name or email, e.g. --room "MBTMY The Vista"');
    }
    const isEmail = EMAIL_RE.test(room);
    const date = String(args.date || '').trim() || todayLocalISO();
    if (!DATE_RE.test(date)) {
      throw new ArgumentError(`Invalid --date "${args.date}"`, 'Use YYYY-MM-DD, e.g. 2026-06-18');
    }

    await page.goto(COMPOSE_URL);
    // Compose form (or a login redirect) — wait for a known control or the login page.
    try {
      await page.wait({ selector: "button[aria-label='Open Scheduling Assistant'], input[aria-label='Start date']", timeout: 30 });
    } catch (_e) {
      const url = await page.getCurrentUrl();
      if (/login\.|\/oauth2\/|signin|sso/i.test(url)) {
        throw new AuthRequiredError(DOMAIN, 'Not signed in to Outlook/Teams in the connected browser');
      }
      throw new CliError('UPSTREAM', 'Calendar compose form did not load', 'Open the Teams/Outlook calendar in the connected browser and retry');
    }

    await installCapture(page);

    // Open the Scheduling Assistant (free/busy view) — required before Start date / rooms exist.
    await ensureSchedulingAssistant(page);

    // Date first (so the room's free/busy is fetched for the requested day).
    await setDate(page, date);

    // Record the mailboxes fetched before adding the room (the organizer's own), so we can
    // tell the room's schedule apart afterwards whether --room was a name or an email.
    const seen = new Set();
    for (let i = 0; i < 3; i++) {
      await page.wait({ time: 1 });
      for (const pair of await readCapture(page)) {
        for (const id of schedulesFromPair(pair).keys()) seen.add(id);
      }
    }

    // Email -> attendee picker (resolves SMTP); name -> room finder.
    if (isEmail) await addViaAttendee(page, room);
    else await addViaRoomFinder(page, room);

    // Accumulate the room's schedule across the getSchedule responses that fire after the
    // add (several windows + a working-hours-only variant). The room is the mailbox NOT
    // seen before adding it (or the exact email when --room was an email). We union all of
    // its scheduleItems (UTC datetimes) and any availabilityView (busy mask) we see.
    let roomId = null;
    let errMsg = null;
    let sawView = false;
    const itemsById = new Map();
    const isRoomId = (id) => (isEmail ? id === room.toLowerCase() : !seen.has(id));

    let stable = 0;
    for (let i = 0; i < 30; i++) {
      await page.wait({ time: 1 });
      for (const pair of await readCapture(page)) {
        for (const [id, s] of schedulesFromPair(pair)) {
          if (!isRoomId(id)) continue;
          if (!roomId) roomId = s.scheduleId;
          if (s.error) errMsg = s.error.message || s.error.responseCode || 'unknown';
          if (s.availabilityView && s.availabilityView.length) sawView = true;
          for (const it of (s.scheduleItems || [])) {
            const key = it && it.id ? it.id : JSON.stringify(it && [it.startTime, it.endTime, it.subject]);
            if (it) itemsById.set(key, it);
          }
        }
      }
      if (sawView) { stable += 1; if (stable >= 3) break; }
    }

    if (!roomId) {
      throw new EmptyResultError('teams roomfreebusy', `No free/busy returned for "${room}" on ${date}`);
    }
    if (errMsg && !sawView) {
      throw new CliError('UPSTREAM', `Free/busy error for "${room}": ${errMsg}`, 'Check the room is a valid mailbox you can view');
    }

    const timeline = await buildTimeline(page, [...itemsById.values()], date);
    return timeline.map((r) => ({ room: roomId, ...r }));
  },
});
