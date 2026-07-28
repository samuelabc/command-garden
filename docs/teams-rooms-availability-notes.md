# teams/rooms-availability — Design Notes & OWA Automation Learnings

## Overview

The `teams/rooms-availability` connector checks free/busy timelines for **multiple** meeting rooms in a single run. It's built on top of the same OWA Scheduling Assistant approach as the single-room `teams/room-availability` connector.

## Design Decisions

- **Input**: Comma-separated `--rooms` argument supporting three formats:
  - **name:email pairs** (batch mode): `"Room A:roomA@co.com,Room B:roomB@co.com"`
  - **names only** (sequential): `"Room A,Room B,Room C"`
  - **emails only** (sequential): `"roomA@co.com,roomB@co.com"`
- **Batch mode** (all entries are name:email pairs): Adds all rooms via room finder without dismiss/capture between each. A single batch capture at the end maps scheduleIds to room names using the pre-known emails. ~2x faster than sequential.
- **Sequential mode** (any entry lacks an email): add → capture → remove per room. After capturing each room's schedule, the room is removed from the attendee list and the room finder input is reused for the next room via `reactType` (which uses `document.execCommand('insertText')` to properly trigger React's search)
- **Error handling**: Partial results — failed rooms produce an error row (`state: "error"`) while successful rooms return their full timeline
- **Output**: `roomName` (original input), `roomEmail` (resolved scheduleId), plus the standard timeline columns

## OWA Scheduling Assistant — Room Finder Behavior

These behaviors were discovered during implementation and are important for any future connector that interacts with the OWA room finder:

### After selecting a room from the dropdown

1. The room is added to the attendee/room list
2. The room finder input **may retain focus** — the "Add a room" button does NOT automatically reappear
3. To make "Add a room" reappear, you must **click a blank space** (e.g. the "Availability" text above the attendees section) or **press Tab**

### Dismiss strategies (what works / what doesn't)

| Strategy | Works? | Notes |
|---|---|---|
| **Remove room + reuse input via `reactType`** | ✅ **Reliable** | Click the "Remove \<room\>" button (aria-label starts with "Remove "), then reuse the still-open room finder input with `document.execCommand('insertText')`. Requires ~1s wait after typing for OWA to refresh suggestions. |
| `element.blur()` + click "Availability" text | ❌ Flaky | Works for 1-2 rooms, fails for 3+. The "Add a room" button doesn't reappear reliably. |
| Escape key dispatch | ❌ | Room finder panel stays open |
| Click date field | ❌ | Opens date picker without closing room finder |
| `typeText` (React setter) on existing input | ❌ | Sets value but OWA doesn't trigger new search |
| `reactType` (`execCommand('insertText')`) on existing input | ✅ | Triggers React's internal event system, OWA performs new search |

### Key learnings: `typeText` vs `reactType`

- `typeText` uses `Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set` + dispatching `input`/`change` events. Works on freshly opened inputs but **fails to trigger OWA search on reused inputs**.
- `reactType` uses `el.select()` + `document.execCommand('insertText', false, text)`. This goes through the browser's editing command path and triggers React's internal `SyntheticEvent` system, which properly triggers OWA's room search.

### First-room autocomplete needs a delay after `typeText`

When typing into the room finder for the **first** room (fresh input opened via "Add a room"), OWA needs ~1.5s after `typeText` before autocomplete suggestions render. Without this delay, the polling loop clicks a stale or absent option and the room's `getSchedule` call never fires — producing a "No free/busy returned" error.

The **reuse path** (subsequent rooms via `reactType` on an already-open input) already had `await sleep(1000)`. The first-room path was missing it.

### Setting the Start date

Canonical snippet: `connectors/lib/owa-date-input.js` (copy-pasted into all three OWA connectors).

| Target date | Strategy | Notes |
|---|---|---|
| **Same month as today** | Open the picker, click the day cell | The picker opens on the current month, so the cell is already visible. |
| **Different month** | Type into the input via `execCommand('insertText')` | Month navigation (`Go to next/previous month`) is unreliable — OWA may disable or ignore it, and the loop silently falls through with the date unchanged. |

The input's locale format is inferred by matching its current value's numeric parts against today's year/month/day, so the typed string matches OWA's mailbox regional setting rather than the browser locale. Zero-padding is read only from a *decisive* token (1 char = unpadded, 2 chars below 10 = padded, 2 chars of 10+ = no information), so `7/28/2026` yields `8/3/2026` and not `8/03/2026`.

**Always verify the date committed.** Both paths can fail without throwing, and `buildTimeline()` clips results to the requested day — so an uncommitted date returns a plausible all-free timeline rather than an error, painting every room green on the floor plan. `setStartDate()` polls the input and throws instead.

### Don't clear the capture buffer before setting the date

The `seen` baseline (organizer mailbox ids, used to identify rooms by elimination) must be built from **both** the Scheduling-Assistant-open response and the date-change response. Clearing the buffer before setting the date discards the former — and when the requested date is already the one on the form, the date change fires no getSchedule at all, leaving the baseline empty and the organizer's own calendar reported as a room.

`seen` holds mailbox ids, not per-week data, so a response for the "wrong" week is still useful. This is the opposite of `outlook-my-meetings`, where the captured schedule *is* the output and stale weeks must be cleared.

### Batch capture accumulation

In batch mode, OWA fires a new `getSchedule` response each time a room is added. Later responses may carry an **empty `scheduleItems` array** for previously-added rooms while including items only for the most recently added room. The eval accumulates items across all responses per `scheduleId`, deduplicating by item `id` (or a composite key of `[startTime, endTime, subject]`), so that earlier rooms' data is never lost to a later overwrite.

### Capture ordering matters

The `getSchedule` GraphQL response must be captured **before** the remove step. If remove runs first, the response may arrive during the remove sleep period and get lost when `readCapture()` clears the buffer for the next room.

Correct order: `addRoom() → captureNewSchedule() → dismissRoom()`

## Known Limitations

1. **Speed (sequential)**: ~4-8 seconds per room (capture polling at 100ms intervals, add/remove at 200ms intervals, 1s wait for search refresh on reused input).
2. **Speed (batch)**: ~2 seconds per room + single capture at end (~8s total). Requires providing email for every room.

## Future Improvements

- Reduce the 1s search refresh wait by polling for suggestion changes instead of a fixed delay
