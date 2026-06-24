# Extension On/Off Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a persistent on/off toggle to the Chrome extension popup that disconnects/reconnects the WebSocket to the daemon.

**Architecture:** The service worker owns an `enabled` boolean persisted in `chrome.storage.local`. The popup sends a `setEnabled` message; the service worker updates storage and calls `client.disconnect()` or `client.connect()`. The popup renders a CSS toggle switch in the status row.

**Tech Stack:** TypeScript, Vitest (jsdom), esbuild, Chrome Extension MV3

## Global Constraints

- Tests run via `vitest run` from `commandGarden/chrome/`
- Test environment is `jsdom`
- Build: `node build.mjs` from `commandGarden/chrome/`
- No external UI dependencies — CSS-only toggle switch
- `chrome.storage.local` requires `"storage"` permission in manifest

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `chrome/manifest.json` | Modify | Add `"storage"` permission |
| `chrome/src/popup/popup-types.ts` | Modify | Add `setEnabled` message variant, `enabled` field on response |
| `chrome/src/background/service-worker.ts` | Modify | Read/write enabled state, gate startup connect, handle `setEnabled` message |
| `chrome/src/background/service-worker.test.ts` | Create | Test enabled state logic in isolation |
| `chrome/src/popup/popup.html` | Modify | Replace reconnect button with CSS toggle switch |
| `chrome/src/popup/popup.ts` | Modify | Toggle click handler, updated render logic |

---

### Task 1: Types and Manifest

**Files:**
- Modify: `chrome/manifest.json:6`
- Modify: `chrome/src/popup/popup-types.ts:8-15`

**Interfaces:**
- Consumes: nothing
- Produces: `PopupMessage` type with `setEnabled` variant, `PopupStatusResponse` with `enabled: boolean` field — consumed by Tasks 2 and 3

- [ ] **Step 1: Add `storage` permission to manifest**

In `chrome/manifest.json`, change the permissions array:

```json
"permissions": ["cookies", "tabs", "scripting", "webRequest", "storage"],
```

- [ ] **Step 2: Add `setEnabled` message variant and `enabled` response field**

In `chrome/src/popup/popup-types.ts`, update:

```ts
// src/popup/popup-types.ts
export interface ActivityEntry {
  connector: string;
  ok: boolean;
  timestamp: number;
}

export type PopupMessage =
  | { type: 'getStatus' }
  | { type: 'reconnect' }
  | { type: 'setEnabled'; enabled: boolean };

export interface PopupStatusResponse {
  connected: boolean;
  enabled: boolean;
  recentActivity: ActivityEntry[];
}
```

- [ ] **Step 3: Run type check**

Run: `npx tsc --noEmit` from `commandGarden/chrome/`
Expected: Type errors in `service-worker.ts` because `PopupStatusResponse` now requires `enabled` — that's fine, we fix it in Task 2.

- [ ] **Step 4: Commit**

```bash
git add chrome/manifest.json chrome/src/popup/popup-types.ts
git commit -m "feat(chrome): add setEnabled message type and storage permission"
```

---

### Task 2: Service Worker — Enabled State Logic

**Files:**
- Modify: `chrome/src/background/service-worker.ts`
- Create: `chrome/src/background/service-worker.test.ts`

**Interfaces:**
- Consumes: `PopupMessage` (`setEnabled` variant), `PopupStatusResponse` (`enabled` field) from Task 1
- Produces: Service worker that reads persisted state on startup, handles `setEnabled` messages, gates `client.connect()` — consumed by Task 3 (popup)

- [ ] **Step 1: Write failing tests for enabled state logic**

Create `chrome/src/background/service-worker.test.ts`:

```ts
// src/background/service-worker.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock chrome APIs before importing service worker logic
const mockStorage: Record<string, unknown> = {};
const mockGet = vi.fn((keys: string | string[], cb: (result: Record<string, unknown>) => void) => {
  const result: Record<string, unknown> = {};
  const keyList = typeof keys === 'string' ? [keys] : keys;
  for (const k of keyList) {
    if (k in mockStorage) result[k] = mockStorage[k];
  }
  cb(result);
});
const mockSet = vi.fn((items: Record<string, unknown>, cb?: () => void) => {
  Object.assign(mockStorage, items);
  cb?.();
});

const mockClient = {
  connect: vi.fn(),
  disconnect: vi.fn(),
  isConnected: vi.fn(() => false),
  onRequest: vi.fn(),
};

// We test the logic extracted into a helper, not the raw service worker module
// (which has side effects). We'll extract a function in the implementation step.

import { handleSetEnabled, initFromStorage } from './service-worker-logic.js';

describe('initFromStorage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const k of Object.keys(mockStorage)) delete mockStorage[k];
  });

  it('connects when storage has enabled=true', () => {
    mockStorage['enabled'] = true;
    initFromStorage(mockGet as any, mockClient as any);
    expect(mockClient.connect).toHaveBeenCalled();
  });

  it('connects when storage has no enabled key (defaults true)', () => {
    initFromStorage(mockGet as any, mockClient as any);
    expect(mockClient.connect).toHaveBeenCalled();
  });

  it('does not connect when storage has enabled=false', () => {
    mockStorage['enabled'] = false;
    initFromStorage(mockGet as any, mockClient as any);
    expect(mockClient.connect).not.toHaveBeenCalled();
  });
});

describe('handleSetEnabled', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const k of Object.keys(mockStorage)) delete mockStorage[k];
  });

  it('disconnects and persists when set to false', () => {
    const sendResponse = vi.fn();
    mockClient.isConnected.mockReturnValue(false);
    handleSetEnabled(false, mockClient as any, mockSet as any, mockGet as any, sendResponse);
    expect(mockClient.disconnect).toHaveBeenCalled();
    expect(mockSet).toHaveBeenCalledWith({ enabled: false }, expect.any(Function));
  });

  it('connects and persists when set to true', () => {
    const sendResponse = vi.fn();
    mockClient.isConnected.mockReturnValue(false);
    handleSetEnabled(true, mockClient as any, mockSet as any, mockGet as any, sendResponse);
    expect(mockClient.connect).toHaveBeenCalled();
    expect(mockSet).toHaveBeenCalledWith({ enabled: true }, expect.any(Function));
  });

  it('responds with enabled and connected status', () => {
    const sendResponse = vi.fn();
    mockClient.isConnected.mockReturnValue(true);
    handleSetEnabled(true, mockClient as any, mockSet as any, mockGet as any, sendResponse);
    // sendResponse is called in the mockSet callback
    expect(sendResponse).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: true }),
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/background/service-worker.test.ts` from `commandGarden/chrome/`
Expected: FAIL — `service-worker-logic.js` does not exist.

- [ ] **Step 3: Create service-worker-logic module**

Create `chrome/src/background/service-worker-logic.ts`:

```ts
// src/background/service-worker-logic.ts
import type { PopupStatusResponse, ActivityEntry } from '../popup/popup-types.js';

interface ClientLike {
  connect(): void;
  disconnect(): void;
  isConnected(): boolean;
}

type StorageGet = (keys: string | string[], cb: (result: Record<string, unknown>) => void) => void;
type StorageSet = (items: Record<string, unknown>, cb?: () => void) => void;

export function initFromStorage(get: StorageGet, client: ClientLike): void {
  get('enabled', (result) => {
    const enabled = result.enabled ?? true;
    if (enabled) client.connect();
  });
}

export function handleSetEnabled(
  enabled: boolean,
  client: ClientLike,
  set: StorageSet,
  get: StorageGet,
  sendResponse: (response: PopupStatusResponse) => void,
  recentActivity: ActivityEntry[] = [],
): void {
  if (enabled) {
    client.connect();
  } else {
    client.disconnect();
  }
  set({ enabled }, () => {
    sendResponse({
      enabled,
      connected: client.isConnected(),
      recentActivity,
    });
  });
}

export function buildStatusResponse(
  client: ClientLike,
  get: StorageGet,
  recentActivity: ActivityEntry[],
  sendResponse: (response: PopupStatusResponse) => void,
): void {
  get('enabled', (result) => {
    sendResponse({
      enabled: (result.enabled ?? true) as boolean,
      connected: client.isConnected(),
      recentActivity,
    });
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/background/service-worker.test.ts` from `commandGarden/chrome/`
Expected: PASS (all 6 tests)

- [ ] **Step 5: Wire logic into service-worker.ts**

Replace `chrome/src/background/service-worker.ts` with:

```ts
// src/background/service-worker.ts
import type { ExtensionRequest } from '@commandgarden/shared';
import { WsClient } from './ws-client.js';
import { PipelineRunner } from '../pipeline/runner.js';
import { RealChromeAdapter } from './chrome-adapter.js';
import type { ActivityEntry, PopupMessage } from '../popup/popup-types.js';
import { initFromStorage, handleSetEnabled, buildStatusResponse } from './service-worker-logic.js';

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

const storageGet = chrome.storage.local.get.bind(chrome.storage.local);
const storageSet = chrome.storage.local.set.bind(chrome.storage.local);

chrome.runtime.onMessage.addListener(
  (message: PopupMessage, _sender, sendResponse) => {
    if (message.type === 'getStatus') {
      buildStatusResponse(client, storageGet, recentActivity, sendResponse);
    } else if (message.type === 'reconnect') {
      client.disconnect();
      client.connect();
      sendResponse({ ok: true });
    } else if (message.type === 'setEnabled') {
      handleSetEnabled(message.enabled, client, storageSet, storageGet, sendResponse, recentActivity);
    }
    return true;
  },
);

initFromStorage(storageGet, client);
console.log('commandGarden service worker started');
```

- [ ] **Step 6: Run all tests**

Run: `npx vitest run` from `commandGarden/chrome/`
Expected: All tests PASS.

- [ ] **Step 7: Commit**

```bash
git add chrome/src/background/service-worker-logic.ts chrome/src/background/service-worker.test.ts chrome/src/background/service-worker.ts
git commit -m "feat(chrome): service worker enabled state with persistence"
```

---

### Task 3: Popup UI — Toggle Switch

**Files:**
- Modify: `chrome/src/popup/popup.html`
- Modify: `chrome/src/popup/popup.ts`

**Interfaces:**
- Consumes: `PopupStatusResponse.enabled` from Task 1, `setEnabled` message handled by Task 2
- Produces: Working toggle switch in popup UI

- [ ] **Step 1: Replace reconnect button with CSS toggle in popup.html**

Replace the full contents of `chrome/src/popup/popup.html`:

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
    .dot.disabled { background: #666; }
    .status-text { flex: 1; }
    /* Toggle switch */
    .toggle {
      position: relative;
      width: 36px;
      height: 20px;
      flex-shrink: 0;
      cursor: pointer;
    }
    .toggle input {
      opacity: 0;
      width: 0;
      height: 0;
    }
    .toggle-track {
      position: absolute;
      inset: 0;
      background: #555;
      border-radius: 10px;
      transition: background 0.2s;
    }
    .toggle input:checked + .toggle-track {
      background: #4caf50;
    }
    .toggle-knob {
      position: absolute;
      top: 2px;
      left: 2px;
      width: 16px;
      height: 16px;
      background: #fff;
      border-radius: 50%;
      transition: transform 0.2s;
      pointer-events: none;
    }
    .toggle input:checked ~ .toggle-knob {
      transform: translateX(16px);
    }
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
    <div id="dot" class="dot disabled"></div>
    <span id="status-text" class="status-text">Checking…</span>
    <label class="toggle">
      <input type="checkbox" id="toggle-input">
      <div class="toggle-track"></div>
      <div class="toggle-knob"></div>
    </label>
  </div>
  <div id="activity" class="activity-list"></div>
  <script src="popup.js"></script>
</body>
</html>
```

- [ ] **Step 2: Update popup.ts with toggle logic**

Replace the full contents of `chrome/src/popup/popup.ts`:

```ts
// src/popup/popup.ts
import type { PopupStatusResponse } from './popup-types.js';
import { timeAgo } from './time-ago.js';

const dot = document.getElementById('dot')!;
const statusText = document.getElementById('status-text')!;
const toggleInput = document.getElementById('toggle-input') as HTMLInputElement;
const activityEl = document.getElementById('activity')!;

let currentEnabled = true;

function render(status: PopupStatusResponse): void {
  currentEnabled = status.enabled;
  toggleInput.checked = status.enabled;

  if (!status.enabled) {
    dot.className = 'dot disabled';
    statusText.textContent = 'Disabled';
  } else if (status.connected) {
    dot.className = 'dot connected';
    statusText.textContent = 'Connected';
  } else {
    dot.className = 'dot disconnected';
    statusText.textContent = 'Disconnected';
  }

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

toggleInput.addEventListener('change', () => {
  const newEnabled = toggleInput.checked;
  toggleInput.disabled = true;
  chrome.runtime.sendMessage({ type: 'setEnabled', enabled: newEnabled }, (response: PopupStatusResponse) => {
    toggleInput.disabled = false;
    if (chrome.runtime.lastError) {
      toggleInput.checked = currentEnabled;
      return;
    }
    render(response);
  });
});

fetchStatus();
```

- [ ] **Step 3: Build and verify**

Run: `node build.mjs` from `commandGarden/chrome/`
Expected: `Build complete → dist/` with no errors.

- [ ] **Step 4: Run all tests**

Run: `npx vitest run` from `commandGarden/chrome/`
Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add chrome/src/popup/popup.html chrome/src/popup/popup.ts
git commit -m "feat(chrome): toggle switch UI in popup"
```

---

### Task 4: Manual Verification

- [ ] **Step 1: Build the extension**

Run: `node build.mjs` from `commandGarden/chrome/`

- [ ] **Step 2: Verify dist contents**

Check that `dist/` contains: `service-worker.js`, `popup.html`, `popup.js`, `content-script.js`, `manifest.json`.

Run: `ls dist/` from `commandGarden/chrome/`

- [ ] **Step 3: Commit all remaining changes if any**

```bash
git add -A
git commit -m "feat(chrome): extension on/off toggle — complete"
```
