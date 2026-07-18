# teams/room-availability: getSchedule interception — RESOLVED

## Status: RESOLVED (2026-07-03)

## The problem

`cg run teams/room-availability --room "MBTMY The Summit" --format json` failed with "No free/busy returned." The room was correctly added to the Scheduling Assistant and the timeline rendered in the browser, but the eval.js could not capture the getSchedule GraphQL response via `window.fetch` interception.

## Root cause

**Two compounding issues:**

1. **MCAS proxy makes requests invisible to `window.fetch` and CDP `Network.enable`.**
   The organization uses Microsoft Defender for Cloud Apps (MCAS), which proxies all Outlook traffic through `outlook.cloud.microsoft.mcas.ms`. The MCAS proxy injects a JavaScript wrapper (`js-wrapper.js`) that handles network requests outside the normal `window.fetch` / XHR path. This makes getSchedule GraphQL calls invisible to:
   - `window.fetch` interception (patching `window.fetch` in page context)
   - CDP `Network.responseReceived` on the tab target
   - CDP `Network.responseReceived` on the Service Worker target
   - XHR interception, `Response.prototype` patching, PerformanceObserver, etc.

2. **CDP `Fetch.getResponseBody` returns base64-encoded bodies for MCAS-proxied responses.**
   Even after switching to the correct CDP domain (`Fetch.enable`), the response bodies came back as base64-encoded strings. Our initial code skipped `atob()` decoding due to a TypeScript error (`atob` not typed in service worker context), so the string-matching for `getSchedule` and `availabilityView` failed on the encoded data.

## Solution

### CDP `Fetch.enable` at Response stage

The `Fetch` CDP domain intercepts requests at the browser's network stack level — below the Service Worker and MCAS wrapper layers. This captures all graphql responses regardless of how they were initiated.

```typescript
// In attachDebugger():
await chrome.debugger.sendCommand({ tabId }, 'Fetch.enable', {
  patterns: [{ urlPattern: '*graphql*', requestStage: 'Response' }],
});
```

When `Fetch.requestPaused` fires:
1. Call `Fetch.getResponseBody` to read the response
2. Decode base64 if `base64Encoded` is true (`atob()`)
3. Check for `getSchedule` + `availabilityView` in the decoded body
4. Inject matching responses into `window.__rfb` via `chrome.scripting.executeScript`
5. **Always** call `Fetch.continueRequest` to release the paused request

### Key code change in `chrome-adapter.ts`

```typescript
// atob is available in Chrome extension service worker context
declare function atob(data: string): string;

// In Fetch.requestPaused handler:
const raw = result as { body: string; base64Encoded: boolean };
const body = raw.base64Encoded ? atob(raw.body) : (raw.body || '');
if (body.includes('getSchedule') && body.includes('availabilityView')) {
  // inject into window.__rfb via chrome.scripting.executeScript
}
// MUST continue or the page hangs:
chrome.debugger.sendCommand({ tabId }, 'Fetch.continueRequest', { requestId });
```

### Pipeline simplification

Removed the SW-clearing workaround (unregister SWs + double navigate). The pipeline is now a single navigate → wait → js_evaluate.

## What we learned

### 1. CDP domain hierarchy for network interception

```
Most visible ←──────────────────────→ Least visible

Fetch.enable          Network.enable          window.fetch
(network stack)       (per-target)            (page JS context)
    │                     │                        │
    ├─ Sees ALL           ├─ Tab target only       ├─ Only sees calls
    │  requests              sees tab requests     │  made by page JS
    │  including          ├─ SW target sees        │  (not SW/MCAS)
    │  SW-mediated           SW requests           │
    │  and MCAS-           (but may see nothing    │
    │  wrapped               if timing is wrong)   │
    │                     │                        │
    └─ Response bodies    └─ Response bodies       └─ Response bodies
       may be base64         usually plain text       always plain text
```

**Lesson: When `Network.enable` doesn't capture a request, try `Fetch.enable`.** The Fetch domain operates at a lower level and sees requests that are invisible to both `window.fetch` and `Network.enable`.

### 2. MCAS proxy behavior

Microsoft Defender for Cloud Apps (Conditional Access App Control) proxies web traffic through `*.mcas.ms` domains. Key behaviors:
- Injects `js-wrapper.js` that wraps network calls
- GraphQL requests go through the wrapper, bypassing `window.fetch`
- Response bodies from `Fetch.getResponseBody` are **base64-encoded**
- URLs get MCAS parameters appended: `McasCtx`, `McasTsid`, `McasUserAuth`
- The page's JS sees the original URL (without `.mcas.ms`), but CDP sees the proxied URL

### 3. `Fetch.getResponseBody` base64 encoding

Unlike `Network.getResponseBody` (which typically returns plain text for JSON), `Fetch.getResponseBody` may return base64-encoded bodies depending on the proxy/MCAS layer. **Always check `base64Encoded` and decode with `atob()` before string matching.**

### 4. `Fetch.continueRequest` is mandatory

When using `Fetch.enable` at Response stage, every `Fetch.requestPaused` event **must** be followed by `Fetch.continueRequest` (or `Fetch.fulfillRequest` / `Fetch.failRequest`). Forgetting this will hang the page. Use `.finally()` to ensure it always runs.

### 5. TypeScript in Chrome extension service workers

`atob`, `btoa`, and `window` are available at runtime in Chrome extension service workers but not typed in TypeScript's default config. Use `declare function atob(data: string): string;` at the top of the file rather than skipping the call.

### 6. Daemon connector caching

The daemon reads `eval.js` files into memory at startup via `ConnectorRegistry.resolveFileRefs()`. Changes to eval.js require:
1. `npm run build` in `daemon/` (copies connectors to `daemon/connectors/`)
2. Restart the daemon process

Chrome extension changes require:
1. `node build.mjs` in `chrome/`
2. Reload the extension in `chrome://extensions`

## Debugging approach that worked

1. **Log everything** — widened fetch interceptor to log ALL calls (URL, status, body preview)
2. **Log CDP traffic** — widened `Network.responseReceived` to log ALL responses, not just graphql
3. **Identify the gap** — 61 fetch calls, 711 CDP responses, 0 getSchedule in either → the request uses a transport invisible to both
4. **Try `Fetch.enable`** — intercepted at network stack level → 12 graphql responses captured, including getSchedule
5. **Spot the base64 issue** — body previews showed base64 strings starting with `W3si...` (decodes to `[{"data":{"getSchedule":...`)
6. **Fix decoding** — added `atob()` with proper TS declaration → data flows through to eval.js

## Files changed (final state)

- `chrome/src/background/chrome-adapter.ts` — `Fetch.enable` + `atob` decoding + `Fetch.continueRequest`
- `chrome/manifest.json` — `debugger` permission (required for `chrome.debugger` API)
- `connectors/teams-room-availability.eval.js` — original fetch interceptor (unchanged from pre-investigation), `typeText` native setter fix
- `connectors/teams-room-availability.yaml` — simplified pipeline (single navigate → wait → js_evaluate)

### Files that can be deleted (unused artifacts)

- `daemon/src/cdp-client.ts`
- `chrome/src/interceptors/fetch-interceptor.js`
