# ado/git-commits: CSP bypass + direct API fetch — RESOLVED

## Status: RESOLVED (2026-07-10)

## The problem

`cg run ado/git-commits --org daimler-mic --project mic-dns --repo mic-dns-api --fromDate ... --toDate ...` failed with "js_evaluate timed out (90s)". The connector had `cdp: true` and used `Fetch.enable` to intercept ADO REST API responses, but `window.__cdpCapture` was never populated.

## Root cause

**Two compounding issues:**

1. **ADO's strict-dynamic CSP blocks `new AsyncFunction()`.**
   Azure DevOps pages use a Content Security Policy with `'nonce-...' 'strict-dynamic'` in `script-src`. The `evaluateInPage` method used `new AsyncFunction(codeStr)` via `chrome.scripting.executeScript` in the MAIN world. CSP blocked this as a string-to-code evaluation (same as `eval()`), causing a synchronous throw. The nonce variable was left stuck at `{pending: true}`, and the 90s polling loop in `evaluateInPage` never saw a result.

   Before the fix, the synchronous throw from the CSP violation was uncaught — the `evaluateInPage` function's injected script only had `.then()` error handling (for async rejections), not a try-catch for synchronous throws from `new AsyncFunction()`. This meant the error was silent and the only symptom was the 90s timeout.

2. **ADO embeds initial commit data in the HTML page (no separate `_apis/` XHR).**
   When navigating directly to `https://dev.azure.com/{org}/{project}/_git/{repo}/commits`, ADO's SPA serves an HTML response with commit data embedded in data-provider JSON islands (inline `<script>` tags). No separate `_apis/git/.../commits` REST API call is made during initial page load. The `Fetch.enable` patterns (`*graphql*`, `*_apis/*`) never matched any commit-related request, so `Fetch.requestPaused` never fired and `__cdpCapture` stayed empty.

   Diagnostic logging confirmed only `suggestions` and `MemberAvatars` API calls fired — no commits endpoint.

## Solution

### 1. CDP `Runtime.evaluate` bypasses CSP

Added `evaluateViaCdp()` method to `chrome-adapter.ts`. When the debugger is attached (all `cdp: true` connectors), `evaluateInPage` now uses `chrome.debugger.sendCommand(Runtime.evaluate)` instead of `chrome.scripting.executeScript`. `Runtime.evaluate` executes at the debugger level — equivalent to typing in the DevTools console — and is not subject to the page's CSP.

```typescript
// In evaluateInPage():
if (this.debuggerAttached) {
  return this.evaluateViaCdp(tabId, code);
}

// evaluateViaCdp wraps code in an async IIFE with a 90s timeout:
const expression = `
  Promise.race([
    (async () => { ${code} })(),
    new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 90000))
  ])
`;
const result = await chrome.debugger.sendCommand(
  { tabId }, 'Runtime.evaluate',
  { expression, awaitPromise: true, returnByValue: true },
);
```

### 2. Direct `fetch()` to ADO REST API

Changed `ado-git-commits.eval.js` to make a same-origin `fetch()` call to the ADO commits REST API instead of waiting for CDP-captured responses. This works because:
- `Runtime.evaluate` bypasses CSP, so `fetch()` executes without restriction
- The call is same-origin (`dev.azure.com` → `dev.azure.com/_apis/...`), so session cookies are included automatically
- MCAS does **not** proxy `dev.azure.com` (verified — no `.mcas.ms` redirect, no `McasCtx` params, no `js-wrapper.js`)

Falls back to `__cdpCapture` if the direct fetch fails.

### 3. CSP try-catch in non-CDP path

Added try-catch around `new AsyncFunction()` in the non-CDP `evaluateInPage` path. If CSP blocks it, the error is now captured as `{ok: false, error: '[sync] ...'}` instead of leaving the nonce stuck at `{pending: true}`.

## What we learned

### 1. CSP applies to `chrome.scripting.executeScript` in MAIN world

Chrome extensions can inject functions into the page's MAIN world via `chrome.scripting.executeScript`, but the **injected function** is still subject to the page's CSP. Specifically:
- The `func` parameter (a function reference) is injected and runs fine — Chrome serializes it, not as a string eval.
- But if that function calls `new Function()`, `eval()`, or `new AsyncFunction()` with a string argument, CSP blocks it.

**Workaround:** Use `CDP Runtime.evaluate` when the debugger is available — it's completely exempt from CSP.

### 2. ADO page architecture: data-provider SSR

Azure DevOps uses a Single Page Application with server-side rendering via data providers. On initial page load:
- Commit data is embedded as JSON islands in the HTML response
- No separate `_apis/` XHR is made for the initial data
- Subsequent interactions (pagination, branch switching) DO make `_apis/` calls

This means CDP `Fetch.enable` cannot capture initial page data — it only sees requests that go through the network stack as separate HTTP requests.

### 3. CDP domain hierarchy (updated from room-availability doc)

```
Most powerful ←────────────────────────→ Least powerful

Runtime.evaluate       Fetch.enable          chrome.scripting
(debugger level)       (network stack)       (extension API)
    │                     │                      │
    ├─ Bypasses CSP       ├─ Sees ALL requests   ├─ Subject to CSP
    ├─ Like DevTools      ├─ Below SW layer      ├─ MAIN world = page CSP
    │  console            ├─ Captures MCAS       ├─ ISOLATED = no CSP
    ├─ Requires           │  proxied traffic     │  but no page globals
    │  debugger.attach    │                      │
    └─ awaitPromise       └─ Must continueReq    └─ Needs polling for
       for async             after reading          async results
```

### 4. MCAS scope is per-service

MCAS (Microsoft Defender for Cloud Apps) proxies traffic per-service. In our environment:
- **Outlook** (`outlook.office365.com`): MCAS-proxied → `outlook.cloud.microsoft.mcas.ms`
- **ADO** (`dev.azure.com`): NOT MCAS-proxied → direct access

This means `window.fetch` and direct API calls work fine for ADO but not for Outlook.

## Debugging approach that worked

1. **Add diagnostic logging** — `console.log` at every CDP event handler, `Fetch.enable` success/failure, response body inspection
2. **Confirm `Fetch.requestPaused` fires** — saw `suggestions` and `MemberAvatars` but no commits → confirmed ADO embeds data in HTML
3. **Try-catch for CSP** — wrapped `new AsyncFunction()` in try-catch → surfaced CSP error: `'strict-dynamic'` blocks eval
4. **`Runtime.evaluate`** — bypasses CSP entirely → eval.js code runs successfully
5. **Direct `fetch()`** — same-origin API call with session cookies → commit data retrieved

## Files changed (final state)

- `chrome/src/background/chrome-adapter.ts` — `evaluateViaCdp()` using `Runtime.evaluate`, CSP try-catch in non-CDP path
- `connectors/ado-git-commits.eval.js` — direct `fetch()` to ADO REST API with `__cdpCapture` fallback
- `daemon/connectors/ado-git-commits.eval.js` — same (daemon copy)
