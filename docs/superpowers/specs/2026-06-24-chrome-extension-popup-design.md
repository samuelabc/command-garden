# Chrome Extension Popup — Design Spec

**Date:** 2026-06-24
**Scope:** Add a popup UI to the commandGarden Chrome extension that shows connection status, recent command activity, and a reconnect button.

---

## Context

The commandGarden Chrome extension currently operates headlessly — a service worker connects to the daemon via WebSocket and executes pipeline steps, but there is no visible UI when the user clicks the extension icon. Users have no way to tell whether the extension is connected or what commands have run.

## What We're Building

A popup that appears when the user clicks the extension icon, showing:

1. **Connection status** — whether the WebSocket to the daemon is connected or disconnected
2. **Recent activity** — the last 10 commands (connector name, success/fail icon, relative time)
3. **Reconnect button** — visible only when disconnected

## Approach

All state lives in-memory in the service worker. The popup queries the service worker via `chrome.runtime.sendMessage` each time it opens. No daemon API changes, no persistence.

History resets when the service worker restarts. This is acceptable for a "last few commands" view.

---

## Data Model

### ActivityEntry

```ts
interface ActivityEntry {
  connector: string;   // e.g. "demo/extract-table"
  ok: boolean;         // success or failure
  timestamp: number;   // Date.now() at completion
}
```

The service worker maintains `recentActivity: ActivityEntry[]`, capped at 10 entries, newest first. A new entry is pushed each time a command completes (success or failure) in the `onRequest` handler.

---

## Message Protocol

Popup and service worker communicate via `chrome.runtime.sendMessage` / `chrome.runtime.onMessage`.

### getStatus

- **Request:** `{ type: 'getStatus' }`
- **Response:** `{ connected: boolean, recentActivity: ActivityEntry[] }`

### reconnect

- **Request:** `{ type: 'reconnect' }`
- **Response:** `{ ok: true }`
- **Behavior:** Calls `client.disconnect()` then `client.connect()` on the WsClient instance. Returns immediately (fire-and-forget). The popup re-queries status after a short delay (~1s) to show the updated connection state.

---

## Popup UI

### Layout

Compact popup, approximately 320px wide. No framework — plain HTML/CSS/JS.

1. **Header** — "commandGarden" in bold
2. **Status row** — colored dot (green = connected, red = disconnected) + status text. "Reconnect" button appears inline when disconnected.
3. **Divider**
4. **Activity list** — each entry shows: connector name, ✓ (green) or ✗ (red) icon, relative time (e.g. "2m ago"). Empty state: gray italic "No recent activity".

### Styling

- System font stack (`-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`)
- Dark theme (dark background, light text) to match Chrome DevTools feel
- Minimal padding, clean lines

---

## File Structure

```
chrome/src/popup/
  popup.html    — markup + inline CSS
  popup.ts      — queries service worker, renders state, handles reconnect click
```

---

## Build Changes

`chrome/build.mjs` gets a third esbuild entry point:

```js
await build({
  ...sharedOpts,
  entryPoints: ['src/popup/popup.ts'],
  outfile: 'dist/popup.js',
  format: 'iife',
});

cpSync('src/popup/popup.html', 'dist/popup.html');
```

---

## Manifest Changes

Add action with default_popup to `chrome/manifest.json`:

```json
{
  "action": {
    "default_popup": "popup.html"
  }
}
```

---

## Service Worker Changes

In `chrome/src/background/service-worker.ts`:

1. Add an in-memory `recentActivity` array (capped at 10).
2. After each command completes in the `onRequest` handler, push an `ActivityEntry`.
3. Add a `chrome.runtime.onMessage` listener to handle `getStatus` and `reconnect` messages.

---

## Testing

- **Unit test** for the relative-time formatting function (seconds, minutes, hours, days).
- **Manual test** after building: click extension icon, verify status shows, run a command via CLI, reopen popup and verify the activity entry appears.

---

## Out of Scope

- Persisting activity across service worker restarts
- Fetching data from daemon HTTP API
- Badge icon updates (e.g. showing connected/disconnected on the extension icon itself)
- Detailed command output or args in the popup
