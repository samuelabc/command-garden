// Runs in page context via js_evaluate step.
// Captures the user's calendar events by intercepting OWA's own data fetches.
//
// Strategy: patch fetch() and XMLHttpRequest to capture responses containing
// calendar event data. OWA loads calendar events automatically when the
// calendar page opens — we just wait and read what it fetched.
//
// This avoids all auth issues (no tokens, no CANARY, no cross-origin) because
// we're reading data OWA already fetched for itself.
//
// Template variables interpolated before execution:
//   ${{ args.date }}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function pad2(n) { return String(n).padStart(2, '0'); }

const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const date = '${{ args.date }}'.trim();
if (!DATE_RE.test(date)) throw new Error(`Invalid date "${date}" — use YYYY-MM-DD`);

// ── Wait for OWA to finish SSO/redirect (up to 30s) ──────────────────
const __deadline = Date.now() + 30000;
while (Date.now() < __deadline) {
  if (location.hostname.includes('outlook') && !(/login\.|\/oauth2\/|signin|sso/i.test(location.href))) break;
  await sleep(1000);
}
if (/login\.|\/oauth2\/|signin|sso/i.test(location.href)) {
  throw new Error('Not signed in to Outlook — log in and retry');
}

// ── Install interceptors to capture calendar event data ───────────────
// OWA uses both fetch() and XMLHttpRequest for API calls. We patch both
// to capture any response containing calendar events (Items, calendarView,
// getSchedule, FindItem).
if (!window.__calEvents) {
  window.__calEvents = [];

  // Patch fetch
  const origFetch = window.fetch;
  window.fetch = function () {
    const args = arguments;
    return origFetch.apply(this, args).then(r => {
      try {
        r.clone().text().then(t => {
          // Capture responses that look like calendar event data
          if (t.includes('"Subject"') && (t.includes('"Start"') || t.includes('"StartTime"'))) {
            try {
              const parsed = JSON.parse(t);
              extractEvents(parsed);
            } catch (_) {}
          }
          // Also capture getSchedule GraphQL responses (fallback)
          if (t.includes('getSchedule') && t.includes('scheduleItems')) {
            try {
              const parsed = JSON.parse(t);
              extractScheduleItems(parsed);
            } catch (_) {}
          }
        }).catch(() => {});
      } catch (_) {}
      return r;
    });
  };

  // Patch XMLHttpRequest (OWA uses this for some API calls)
  const origXHROpen = XMLHttpRequest.prototype.open;
  const origXHRSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function () {
    this.__url = arguments[1] || '';
    return origXHROpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function () {
    this.addEventListener('load', function () {
      try {
        const t = this.responseText || '';
        if (t.includes('"Subject"') && (t.includes('"Start"') || t.includes('"StartTime"'))) {
          try { extractEvents(JSON.parse(t)); } catch (_) {}
        }
      } catch (_) {}
    });
    return origXHRSend.apply(this, arguments);
  };
}

/** Extract calendar events from OWA API response shapes. */
function extractEvents(data) {
  // OWA returns events in various shapes; try common patterns
  const items = data.value || data.Items || data.items || [];
  const arr = Array.isArray(data) ? data : (Array.isArray(items) ? items : []);
  for (const item of arr) {
    if (item && (item.Subject || item.subject) && (item.Start || item.start)) {
      window.__calEvents.push(item);
    }
  }
}

/** Extract events from getSchedule GraphQL responses (fallback path). */
function extractScheduleItems(data) {
  const nodes = Array.isArray(data) ? data : [data];
  for (const node of nodes) {
    const schedules = node?.data?.getSchedule?.schedules;
    if (!Array.isArray(schedules)) continue;
    for (const s of schedules) {
      for (const it of (s.scheduleItems || [])) {
        if (it && it.startTime && it.endTime) {
          // Convert getSchedule format to calendarView-like format
          window.__calEvents.push({
            subject: it.subject || '(meeting)',
            start: it.startTime,
            end: it.endTime,
            showAs: it.status || 'Busy',
            responseStatus: { response: 'Accepted' },
            isAllDayEvent: false,
            isCancelled: false,
            _fromSchedule: true,
          });
        }
      }
    }
  }
}

// ── Wait for OWA to load calendar data (up to 20s) ───────────────────
for (let i = 0; i < 20; i++) {
  await sleep(1000);
  if (window.__calEvents.length > 0) break;
}

// Deduplicate events by start+end time
const seen = new Set();
const uniqueEvents = [];
for (const ev of window.__calEvents) {
  const startStr = ev.Start?.DateTime || ev.start?.dateTime || ev.start?.DateTime || '';
  const endStr = ev.End?.DateTime || ev.end?.dateTime || ev.end?.DateTime || '';
  const key = startStr + '|' + endStr;
  if (seen.has(key)) continue;
  seen.add(key);
  uniqueEvents.push(ev);
}

// Clear captured events for next run
window.__calEvents = [];

// ── Filter to the target date and map to output rows ──────────────────
const rows = [];
for (const ev of uniqueEvents) {
  // Normalize field names (OWA mixes PascalCase and camelCase)
  const subject = ev.Subject || ev.subject || '(meeting)';
  const startRaw = ev.Start?.DateTime || ev.start?.dateTime || ev.start?.DateTime || '';
  const endRaw = ev.End?.DateTime || ev.end?.dateTime || ev.end?.DateTime || '';
  const showAs = (ev.ShowAs || ev.showAs || 'busy');
  const isCancelled = ev.IsCancelled || ev.isCancelled || false;
  const isAllDay = ev.IsAllDayEvent || ev.isAllDayEvent || false;
  const responseType = ev.ResponseStatus?.Response || ev.responseStatus?.response || '';

  if (isCancelled || isAllDay) continue;

  // Filter by response status if available (accepted/organizer only)
  // If responseStatus is missing (e.g. from getSchedule), include the event
  if (responseType && responseType !== 'Organizer' && responseType !== 'Accepted') continue;

  // Only show busy/tentative items (skip free blocks from getSchedule)
  const showAsLower = String(showAs).toLowerCase();
  if (showAsLower === 'free') continue;

  const startDt = new Date(startRaw.endsWith('Z') ? startRaw : startRaw + 'Z');
  const endDt = new Date(endRaw.endsWith('Z') ? endRaw : endRaw + 'Z');
  const evDate = `${startDt.getFullYear()}-${pad2(startDt.getMonth() + 1)}-${pad2(startDt.getDate())}`;

  // Filter to the target date
  if (evDate !== date) continue;

  const durationMin = Math.round((endDt.getTime() - startDt.getTime()) / 60000);
  if (durationMin < 5 || durationMin > 480) continue;

  rows.push({
    date: evDate,
    subject: subject,
    start: `${pad2(startDt.getHours())}:${pad2(startDt.getMinutes())}`,
    end: `${pad2(endDt.getHours())}:${pad2(endDt.getMinutes())}`,
    durationMin,
    state: showAsLower,
  });
}

return rows;
