// Shared "set the Scheduling Assistant Start date" snippet for eval.js files.
// Paste this into any eval.js that drives the OWA calendar compose screen
// (https://outlook.*/calendar/deeplink/compose -> Scheduling Assistant).
//
// Requires these helpers to already exist in the host file:
//   pad2(n), sleep(ms), $(sel), exists(sel), dateCellLabel(iso), MONTHS
//
// ── Why not just use the calendar picker? ────────────────────────────
// The obvious approach — open the picker and click
// "Go to previous month" / "Go to next month" until the target day cell
// appears — is unreliable. OWA's Scheduling Assistant picker may disable or
// ignore backward navigation, and the loop has no way to distinguish "still
// navigating" from "will never get there". It silently falls through with the
// date unchanged.
//
// Typing into the input is also not straightforward: the React value setter
// (`Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set`
// plus synthetic input/change events — the `typeText` pattern) sets the value
// but OWA never reacts to it. `document.execCommand('insertText')` goes
// through the browser's editing command path, which drives React's internal
// SyntheticEvent system, and does work.
// See docs/teams-rooms-availability-notes.md ("typeText vs reactType").
//
// So: same month -> click the day cell (the picker opens on the current month,
// no navigation needed). Different month -> type the date directly.
//
// ── Always verify ────────────────────────────────────────────────────
// Both paths can fail without throwing. Connectors that clip results to the
// requested day (e.g. buildTimeline) turn an uncommitted date into a plausible
// but wrong answer — a room that is fully booked reads back as free all day.
// setStartDate() therefore polls the input and throws if the date never took.
//
// ── Ordering hazard for connectors that add attendees/rooms ──────────
// Changing the date fires the page's own getSchedule for whoever is already on
// the form (the organizer). If you add rooms straight afterwards and identify
// them by elimination ("any scheduleId I haven't seen before"), a late organizer
// response can be claimed as a room. Drain captures to a quiet period after
// setStartDate() returns and before adding anything — see the `seen` loops in
// teams-room-availability.eval.js / teams-rooms-availability.eval.js.
//
// Do NOT clear the capture buffer before setStartDate() when you are building
// that baseline. Opening the Scheduling Assistant already fired a getSchedule
// for the organizer, and it is the more reliable of the two: if the requested
// date is the one the form already shows, the date change fires nothing.
// (Connectors whose *output* is the captured schedule — outlook-my-meetings —
// do need to clear, so stale weeks don't reach the result.)

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

  // Year position is unambiguous — it's the part equal to the current year.
  const yIdx = nums.findIndex(n => n === tY);
  if (yIdx === -1) return null;

  // Month vs day from the remaining two positions.
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

/** Format a target ISO date (YYYY-MM-DD) in the same locale format as the
 *  current Start date input value. Falls back to Intl.DateTimeFormat when the
 *  layout can't be detected — note that uses the *browser* locale, which is not
 *  necessarily OWA's mailbox regional setting, hence the verification below. */
function formatDateForInput(inputVal, isoDate) {
  const layout = detectDateLayout(inputVal);
  if (!layout) {
    return new Intl.DateTimeFormat(navigator.language).format(new Date(`${isoDate}T12:00:00`));
  }
  const [dY, dM, dD] = isoDate.split('-').map(Number);
  const { yIdx, mIdx, dIdx, sep1, sep2, tokens } = layout;
  // Reconstruct with target date values, preserving the original zero-padding.
  // Only some tokens are decisive: 1 char is definitely unpadded, 2 chars below
  // 10 is definitely padded ("07"), 2 chars of 10+ says nothing ("28" looks the
  // same either way). Read the whole date's padding off whichever field is
  // decisive so the two never disagree, e.g. "7/28/2026" -> "8/3/2026" and not
  // "8/03/2026".
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

/** True when a date input's value reads as the given ISO date.
 *  `layout` must be the layout detected BEFORE the value was changed — position
 *  detection keys off today's date, so it can't be re-derived from the new
 *  value. Without a layout, falls back to an order-independent numeric match,
 *  which can't catch a month/day swap but still catches "didn't change". */
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

/** Set the Scheduling Assistant's Start date to an ISO date (YYYY-MM-DD).
 *  Throws if the input never reflects the target date. */
async function setStartDate(isoDate) {
  const sel = "input[aria-label='Start date']";
  const dateInput = $(sel);
  if (!dateInput) throw new Error('Start date input not found');

  // Capture the layout while the input still shows a date we can decode.
  const layout = detectDateLayout(dateInput.value);

  const target = new Date(`${isoDate}T00:00:00`);
  const now = new Date();
  const sameMonth = target.getFullYear() === now.getFullYear()
    && target.getMonth() === now.getMonth();

  if (sameMonth) {
    // The picker opens on the current month, so the target cell is already
    // visible — no month navigation required.
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
