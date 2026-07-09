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

### Capture ordering matters

The `getSchedule` GraphQL response must be captured **before** the remove step. If remove runs first, the response may arrive during the remove sleep period and get lost when `readCapture()` clears the buffer for the next room.

Correct order: `addRoom() → captureNewSchedule() → dismissRoom()`

## Known Limitations

1. **Speed (sequential)**: ~4-8 seconds per room (capture polling at 100ms intervals, add/remove at 200ms intervals, 1s wait for search refresh on reused input).
2. **Speed (batch)**: ~2 seconds per room + single capture at end (~8s total). Requires providing email for every room.

## Future Improvements

- Reduce the 1s search refresh wait by polling for suggestion changes instead of a fixed delay
