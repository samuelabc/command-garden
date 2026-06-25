# Chrome Extension Popup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a popup UI to the commandGarden Chrome extension that shows daemon connection status, recent command activity, and a reconnect button.

**Architecture:** The popup is a plain HTML/CSS/JS page opened by Chrome's `action.default_popup`. It queries the service worker for state via `chrome.runtime.sendMessage`. The service worker tracks an in-memory activity log (last 10 commands) and exposes connection status + activity via a message handler. No daemon changes.

**Tech Stack:** TypeScript, esbuild, plain HTML/CSS, Chrome Extension APIs (MV3), vitest (jsdom)

## Global Constraints

- Chrome MV3 extension — service worker is ESM, popup/content scripts are IIFE
- Build tool is esbuild via `chrome/build.mjs`
- Tests use vitest with jsdom environment (`chrome/vitest.config.ts`)
- No external UI frameworks — plain HTML/CSS/JS
- Types from `@types/chrome` are available
- All paths below are relative to `commandGarden/chrome/`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/popup/popup-types.ts` | Create | `ActivityEntry` type + message types |
| `src/popup/time-ago.ts` | Create | `timeAgo(timestamp)` → relative time string |
| `src/popup/time-ago.test.ts` | Create | Unit tests for `timeAgo` |
| `src/popup/popup.ts` | Create | Popup logic — query service worker, render, handle reconnect |
| `src/popup/popup.html` | Create | Popup markup + inline CSS |
| `src/background/service-worker.ts` | Modify | Add activity log + `chrome.runtime.onMessage` handler |
| `manifest.json` | Modify | Add `action.default_popup` |
| `build.mjs` | Modify | Add popup esbuild entry + copy popup.html |

---

### Task 1: Popup types, time-ago utility, and unit tests

**Files:**
- Create: `src/popup/popup-types.ts`
- Create: `src/popup/time-ago.ts`
- Create: `src/popup/time-ago.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `ActivityEntry` type: `{ connector: string; ok: boolean; timestamp: number }`
  - `PopupMessage` type: `{ type: 'getStatus' } | { type: 'reconnect' }`
  - `PopupStatusResponse` type: `{ connected: boolean; recentActivity: ActivityEntry[] }`
  - `timeAgo(timestamp: number, now?: number): string` — returns relative time like "2m ago", "1h ago", "3d ago"

- [ ] **Step 1: Create `src/popup/popup-types.ts`**

```ts
// src/popup/popup-types.ts
export interface ActivityEntry {
  connector: string;
  ok: boolean;
  timestamp: number;
}

export type PopupMessage =
  | { type: 'getStatus' }
  | { type: 'reconnect' };

export interface PopupStatusResponse {
  connected: boolean;
  recentActivity: ActivityEntry[];
}
```

- [ ] **Step 2: Write failing tests for `timeAgo`**

Create `src/popup/time-ago.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { timeAgo } from './time-ago.js';

describe('timeAgo', () => {
  const now = 1_700_000_000_000;

  it('returns "just now" for < 60 seconds', () => {
    expect(timeAgo(now - 5_000, now)).toBe('just now');
    expect(timeAgo(now - 59_000, now)).toBe('just now');
  });

  it('returns minutes for 1–59 min', () => {
    expect(timeAgo(now - 60_000, now)).toBe('1m ago');
    expect(timeAgo(now - 120_000, now)).toBe('2m ago');
    expect(timeAgo(now - 59 * 60_000, now)).toBe('59m ago');
  });

  it('returns hours for 1–23 h', () => {
    expect(timeAgo(now - 3_600_000, now)).toBe('1h ago');
    expect(timeAgo(now - 7_200_000, now)).toBe('2h ago');
    expect(timeAgo(now - 23 * 3_600_000, now)).toBe('23h ago');
  });

  it('returns days for >= 24 h', () => {
    expect(timeAgo(now - 86_400_000, now)).toBe('1d ago');
    expect(timeAgo(now - 7 * 86_400_000, now)).toBe('7d ago');
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/popup/time-ago.test.ts` from `commandGarden/chrome/`

Expected: FAIL — `timeAgo` not found

- [ ] **Step 4: Implement `timeAgo`**

Create `src/popup/time-ago.ts`:

```ts
// src/popup/time-ago.ts
export function timeAgo(timestamp: number, now: number = Date.now()): string {
  const seconds = Math.floor((now - timestamp) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/popup/time-ago.test.ts` from `commandGarden/chrome/`

Expected: all 4 tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/popup/popup-types.ts src/popup/time-ago.ts src/popup/time-ago.test.ts
git commit -m "feat(chrome): add popup types and time-ago utility with tests"
```

---

### Task 2: Service worker — activity log and message handler

**Files:**
- Modify: `src/background/service-worker.ts`

**Interfaces:**
- Consumes: `ActivityEntry`, `PopupMessage`, `PopupStatusResponse` from `src/popup/popup-types.ts`; `WsClient.isConnected()`, `WsClient.disconnect()`, `WsClient.connect()` from `src/background/ws-client.ts`
- Produces: responds to `chrome.runtime.sendMessage({ type: 'getStatus' })` with `PopupStatusResponse`; responds to `chrome.runtime.sendMessage({ type: 'reconnect' })` with `{ ok: true }`

- [ ] **Step 1: Add activity tracking and message handler to `service-worker.ts`**

The current file is `src/background/service-worker.ts` (28 lines). Apply these changes:

1. Add import for `ActivityEntry` and `PopupMessage`:

```ts
import type { ActivityEntry, PopupMessage, PopupStatusResponse } from '../popup/popup-types.js';
```

2. Add `recentActivity` array and `MAX_ACTIVITY` constant after the `client` declaration (after line 8):

```ts
const MAX_ACTIVITY = 10;
const recentActivity: ActivityEntry[] = [];
```

3. Inside the `onRequest` handler, after the `client.sendResponse` calls in both the `try` and `catch` blocks, record the activity entry. Replace the entire `client.onRequest(...)` block (lines 10–24) with:

```ts
client.onRequest(async (request: ExtensionRequest) => {
  const adapter = new RealChromeAdapter();
  const runner = new PipelineRunner(adapter);
  let ok = false;
  try {
    const result = await runner.run(request.connector, request.args);
    ok = result.ok;
    client.sendResponse({ ...result, id: request.id });
  } catch (err) {
    client.sendResponse({
      id: request.id, ok: false, data: [],
      error: err instanceof Error ? err.message : 'Unknown error',
    });
  } finally {
    adapter.cleanup();
    recentActivity.unshift({
      connector: `${request.connector.site}/${request.connector.name}`,
      ok,
      timestamp: Date.now(),
    });
    if (recentActivity.length > MAX_ACTIVITY) recentActivity.length = MAX_ACTIVITY;
  }
});
```

4. Add the `chrome.runtime.onMessage` listener before `client.connect()`:

```ts
chrome.runtime.onMessage.addListener(
  (message: PopupMessage, _sender, sendResponse) => {
    if (message.type === 'getStatus') {
      const response: PopupStatusResponse = {
        connected: client.isConnected(),
        recentActivity,
      };
      sendResponse(response);
    } else if (message.type === 'reconnect') {
      client.disconnect();
      client.connect();
      sendResponse({ ok: true });
    }
    return true;
  },
);
```

The final `service-worker.ts` should look like:

```ts
// src/background/service-worker.ts
import type { ExtensionRequest } from '@commandgarden/shared';
import { WsClient } from './ws-client.js';
import { PipelineRunner } from '../pipeline/runner.js';
import { RealChromeAdapter } from './chrome-adapter.js';
import type { ActivityEntry, PopupMessage, PopupStatusResponse } from '../popup/popup-types.js';

const DAEMON_URL = 'ws://127.0.0.1:19825/ws/extension';
const client = new WsClient(DAEMON_URL);
const MAX_ACTIVITY = 10;
const recentActivity: ActivityEntry[] = [];

client.onRequest(async (request: ExtensionRequest) => {
  const adapter = new RealChromeAdapter();
  const runner = new PipelineRunner(adapter);
  let ok = false;
  try {
    const result = await runner.run(request.connector, request.args);
    ok = result.ok;
    client.sendResponse({ ...result, id: request.id });
  } catch (err) {
    client.sendResponse({
      id: request.id, ok: false, data: [],
      error: err instanceof Error ? err.message : 'Unknown error',
    });
  } finally {
    adapter.cleanup();
    recentActivity.unshift({
      connector: `${request.connector.site}/${request.connector.name}`,
      ok,
      timestamp: Date.now(),
    });
    if (recentActivity.length > MAX_ACTIVITY) recentActivity.length = MAX_ACTIVITY;
  }
});

chrome.runtime.onMessage.addListener(
  (message: PopupMessage, _sender, sendResponse) => {
    if (message.type === 'getStatus') {
      const response: PopupStatusResponse = {
        connected: client.isConnected(),
        recentActivity,
      };
      sendResponse(response);
    } else if (message.type === 'reconnect') {
      client.disconnect();
      client.connect();
      sendResponse({ ok: true });
    }
    return true;
  },
);

client.connect();
console.log('commandGarden service worker started');
```

- [ ] **Step 2: Verify existing tests still pass**

Run: `npx vitest run` from `commandGarden/chrome/`

Expected: all existing tests PASS (ws-client, domain-guard, messages, pipeline tests)

- [ ] **Step 3: Commit**

```bash
git add src/background/service-worker.ts
git commit -m "feat(chrome): add activity log and popup message handler to service worker"
```

---

### Task 3: Popup HTML + TypeScript + build + manifest

**Files:**
- Create: `src/popup/popup.html`
- Create: `src/popup/popup.ts`
- Modify: `build.mjs`
- Modify: `manifest.json`

**Interfaces:**
- Consumes: `PopupMessage`, `PopupStatusResponse` from `src/popup/popup-types.ts`; `timeAgo` from `src/popup/time-ago.ts`; service worker responds to `chrome.runtime.sendMessage`
- Produces: the user-facing popup UI

- [ ] **Step 1: Create `src/popup/popup.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      width: 320px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 13px;
      background: #1e1e1e;
      color: #ccc;
    }
    .header {
      padding: 12px 16px;
      font-size: 14px;
      font-weight: 600;
      color: #e0e0e0;
      border-bottom: 1px solid #333;
    }
    .status-row {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 16px;
      border-bottom: 1px solid #333;
    }
    .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
    }
    .dot.connected { background: #4caf50; }
    .dot.disconnected { background: #f44336; }
    .status-text { flex: 1; }
    .reconnect-btn {
      background: #333;
      color: #ccc;
      border: 1px solid #555;
      border-radius: 4px;
      padding: 3px 10px;
      font-size: 12px;
      cursor: pointer;
    }
    .reconnect-btn:hover { background: #444; }
    .activity-list {
      max-height: 240px;
      overflow-y: auto;
    }
    .activity-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 16px;
      border-bottom: 1px solid #2a2a2a;
    }
    .activity-icon { font-size: 12px; flex-shrink: 0; }
    .activity-icon.ok { color: #4caf50; }
    .activity-icon.fail { color: #f44336; }
    .activity-name { flex: 1; font-family: monospace; font-size: 12px; }
    .activity-time { color: #888; font-size: 11px; flex-shrink: 0; }
    .empty {
      padding: 16px;
      text-align: center;
      color: #666;
      font-style: italic;
    }
  </style>
</head>
<body>
  <div class="header">commandGarden</div>
  <div class="status-row">
    <div id="dot" class="dot disconnected"></div>
    <span id="status-text" class="status-text">Checking…</span>
    <button id="reconnect-btn" class="reconnect-btn" style="display:none">Reconnect</button>
  </div>
  <div id="activity" class="activity-list"></div>
  <script src="popup.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create `src/popup/popup.ts`**

```ts
// src/popup/popup.ts
import type { PopupStatusResponse } from './popup-types.js';
import { timeAgo } from './time-ago.js';

const dot = document.getElementById('dot')!;
const statusText = document.getElementById('status-text')!;
const reconnectBtn = document.getElementById('reconnect-btn') as HTMLButtonElement;
const activityEl = document.getElementById('activity')!;

function render(status: PopupStatusResponse): void {
  dot.className = `dot ${status.connected ? 'connected' : 'disconnected'}`;
  statusText.textContent = status.connected ? 'Connected' : 'Disconnected';
  reconnectBtn.style.display = status.connected ? 'none' : '';

  if (status.recentActivity.length === 0) {
    activityEl.innerHTML = '<div class="empty">No recent activity</div>';
    return;
  }

  const now = Date.now();
  activityEl.innerHTML = status.recentActivity
    .map(entry => {
      const icon = entry.ok
        ? '<span class="activity-icon ok">✓</span>'
        : '<span class="activity-icon fail">✗</span>';
      return `<div class="activity-item">${icon}<span class="activity-name">${escapeHtml(entry.connector)}</span><span class="activity-time">${timeAgo(entry.timestamp, now)}</span></div>`;
    })
    .join('');
}

function escapeHtml(text: string): string {
  const el = document.createElement('span');
  el.textContent = text;
  return el.innerHTML;
}

function fetchStatus(): void {
  chrome.runtime.sendMessage({ type: 'getStatus' }, (response: PopupStatusResponse) => {
    if (chrome.runtime.lastError) {
      statusText.textContent = 'Error';
      return;
    }
    render(response);
  });
}

reconnectBtn.addEventListener('click', () => {
  reconnectBtn.disabled = true;
  reconnectBtn.textContent = 'Reconnecting…';
  chrome.runtime.sendMessage({ type: 'reconnect' }, () => {
    setTimeout(() => {
      reconnectBtn.disabled = false;
      reconnectBtn.textContent = 'Reconnect';
      fetchStatus();
    }, 1000);
  });
});

fetchStatus();
```

- [ ] **Step 3: Add popup build to `build.mjs`**

After the content script build block (after line 32), before the "Copy manifest" comment (line 34), add:

```js
// Bundle popup (IIFE — standard page script)
await build({
  ...sharedOpts,
  entryPoints: ['src/popup/popup.ts'],
  outfile: 'dist/popup.js',
  format: 'iife',
});

// Copy popup HTML
cpSync('src/popup/popup.html', 'dist/popup.html');
```

- [ ] **Step 4: Add `action` to `manifest.json`**

Add the `action` field to `manifest.json` (before the closing `}`):

```json
{
  "manifest_version": 3,
  "name": "commandGarden",
  "version": "0.1.0",
  "description": "Enterprise browser automation — secure, auditable CLI commands for websites",
  "permissions": ["cookies", "tabs", "scripting", "webRequest"],
  "host_permissions": ["<all_urls>"],
  "background": {
    "service_worker": "service-worker.js",
    "type": "module"
  },
  "action": {
    "default_popup": "popup.html"
  }
}
```

- [ ] **Step 5: Build and verify**

Run: `npm run build` from `commandGarden/chrome/`

Expected: "Build complete → dist/" with `dist/popup.js`, `dist/popup.html`, `dist/service-worker.js`, `dist/content-script.js`, `dist/manifest.json` all present.

Verify: `ls dist/popup.*` shows `popup.html` and `popup.js`

- [ ] **Step 6: Run all tests**

Run: `npx vitest run` from `commandGarden/chrome/`

Expected: all tests pass (existing + time-ago tests)

- [ ] **Step 7: Commit**

```bash
git add src/popup/popup.html src/popup/popup.ts build.mjs manifest.json
git commit -m "feat(chrome): add extension popup with status and activity display"
```

---

### Task 4: Manual verification and final build

**Files:** none (verification only)

- [ ] **Step 1: Full rebuild**

Run: `npm run build` from `commandGarden/chrome/`

- [ ] **Step 2: Verify dist contents**

Run: `ls -la dist/` from `commandGarden/chrome/`

Expected files: `manifest.json`, `service-worker.js`, `service-worker.js.map`, `content-script.js`, `content-script.js.map`, `popup.js`, `popup.js.map`, `popup.html`

- [ ] **Step 3: Verify manifest includes action**

Run: `cat dist/manifest.json` from `commandGarden/chrome/`

Expected: contains `"action": { "default_popup": "popup.html" }`

- [ ] **Step 4: Run all workspace tests**

Run: `npm test` from `commandGarden/`

Expected: all tests pass across shared, daemon, cli, and chrome packages

- [ ] **Step 5: Commit (if any changes)**

Only if fixes were needed:

```bash
git add -A
git commit -m "fix(chrome): address issues found during popup verification"
```
