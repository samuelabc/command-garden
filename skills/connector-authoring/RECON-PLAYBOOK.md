# Recon Playbook

Ground-layer debugging for commandGarden connectors. Use when the audit log and basic probing (step 4 of SKILL.md) aren't enough to get data flowing.

---

## Network interception hierarchy

From most visible (page JS) to most powerful (network stack):

```
window.fetch patch    →  Sees only page-initiated fetch() calls
  ↓                      Invisible: SW-mediated, MCAS-wrapped, XHR
CDP Network.enable    →  Sees per-target requests (tab OR SW, not both)
  ↓                      Invisible: may miss timing-dependent SW events
CDP Fetch.enable      →  Sees ALL requests at the network stack level
                         Sees: SW-mediated, MCAS-wrapped, proxied — everything
                         Caveat: response bodies may be base64-encoded
```

Always start at the top. Escalate down only when the higher level captures nothing.

---

## Technique 1: Strip the pipeline

Remove steps from the end until data flows. Isolate which step breaks.

```bash
# Keep only: navigate + wait
# Expected: ok: true, data: [], 0 rows — navigation works
cg run <site>/<name> --format json

# Add: fetch or extract
# Expected: ok: true, data: [...], N rows — data source works
cg run <site>/<name> --format json

# Add: map
# Check: field values aren't "undefined" — field names match
cg run <site>/<name> --format json
```

If `navigate + wait` fails, the problem is auth (SSO redirect, wrong URL, page blocked).
If `fetch` returns 0 rows, the problem is the API call (wrong URL, content type, wrapper object).
If `map` produces `"undefined"`, the problem is field name casing.

---

## Technique 2: Inspect raw API responses

For `fetch` connectors — remove the `map` step and examine raw output:

```bash
cg run <site>/<name> --format json
```

**0 rows, no error:**
- API returned non-JSON → add `headers: { Accept: "application/json" }` to the `fetch` step.
- API returned a wrapper object like `{ "items": [...] }` → add `dataPath: "items"`.
- `fetch` ran on the wrong tab or URL → check the audit log `steps[]` for the fetch step's error/timing.

**Data present but wrong shape:**
- Field names are case-sensitive. Compare the raw JSON keys with your `map` expressions exactly.
- Arrays in responses (e.g. `["ALICE", "BOB"]`) auto-join to `"ALICE,BOB"` in map expressions.

---

## Technique 3: Console logging in js_evaluate

Add `console.log()` to the eval.js file. Output appears in the **target tab's** DevTools console (not the extension's service worker console).

```js
console.log('[cg] token:', token ? 'found (' + token.slice(0, 8) + '...)' : 'MISSING');
console.log('[cg] API status:', resp.status);
console.log('[cg] response preview:', JSON.stringify(data).slice(0, 300));
console.log('[cg] row count:', rows.length);
```

After the debug session, remove all `[cg]` logs — they're visible to anyone with DevTools open.

**DevTools not showing logs?** The eval.js runs in the page's MAIN world. Make sure you're looking at the correct tab's console, not the extension's background page.

---

## Technique 4: window.fetch interception

Capture data from requests the page makes on its own — not your `fetch` step, but the page's own API calls triggered by UI interactions.

```js
// Install the interceptor BEFORE triggering the UI action
if (!window.__rfb) {
  window.__rfb = [];
  const origFetch = window.fetch;
  window.fetch = function() {
    const args = arguments;
    const url = (args[0]?.url || args[0] || '').toString();
    const body = (args[1]?.body || '').toString();
    return origFetch.apply(this, args).then(r => {
      if (url.includes('YOUR_KEYWORD')) {
        r.clone().text().then(t => {
          window.__rfb.push({ url, reqBody: body, resBody: t });
        }).catch(() => {});
      }
      return r;
    });
  };
}
```

Then trigger the UI action (click a button, type in a field), wait, and read:

```js
await new Promise(r => setTimeout(r, 5000));
const captured = window.__rfb;
window.__rfb = [];
if (!captured.length) throw new Error('No requests captured — check URL keyword');

// Parse and process
const data = JSON.parse(captured[0].resBody);
```

**Gotcha: timing.** The interceptor must be installed before the page makes the request. If the page fires requests on load, install the interceptor, then re-trigger (e.g., navigate, click a refresh button).

**Gotcha: cloning.** Always use `r.clone().text()` — reading the original response body consumes it and breaks the page.

---

## Technique 5: CDP Fetch.enable

When `window.fetch` interception captures nothing — the request uses a transport invisible to page-level JS.

**Common causes:**
- **MCAS proxy** (`*.mcas.ms`) — Microsoft Defender for Cloud Apps injects `js-wrapper.js` that handles requests outside `window.fetch`
- **Service Worker** — SW intercepts and replays requests on a separate CDP target
- **Custom XHR wrappers** — legacy apps using `XMLHttpRequest` with custom transport layers

### How to verify the gap

Widen the interceptor to log ALL fetch calls, not just your keyword:

```js
window.fetch = function() {
  const url = (arguments[0]?.url || arguments[0] || '').toString();
  console.log('[cg fetch]', url.slice(0, 120));
  return origFetch.apply(this, arguments);
};
```

If the request you're looking for doesn't appear in the console but the data renders in the UI → it's using a transport below `window.fetch`.

### The fix: CDP Fetch domain

Requires modifying `chrome/src/background/chrome-adapter.ts`. The `Fetch` CDP domain intercepts at the browser's network stack — below the SW and MCAS layers.

```typescript
// In attachDebugger():
await chrome.debugger.sendCommand({ tabId }, 'Fetch.enable', {
  patterns: [{ urlPattern: '*your-pattern*', requestStage: 'Response' }],
});
```

Handle `Fetch.requestPaused` events:

```typescript
// 1. Read the response body
const result = await chrome.debugger.sendCommand(
  debuggee, 'Fetch.getResponseBody', { requestId }
);
const raw = result as { body: string; base64Encoded: boolean };

// 2. Decode if base64 (MCAS proxied responses are always base64)
const body = raw.base64Encoded ? atob(raw.body) : (raw.body || '');

// 3. Check for your signal
if (body.includes('yourKeyword')) {
  // Inject into page context via chrome.scripting.executeScript
  await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: (data) => { window.__rfb.push(data); },
    args: [{ body }],
  });
}

// 4. ALWAYS continue the request or the page hangs
await chrome.debugger.sendCommand(
  debuggee, 'Fetch.continueRequest', { requestId }
).catch(() => {});  // swallow errors on detached targets
```

### Critical gotchas

1. **base64 decoding** — `Fetch.getResponseBody` returns base64 for MCAS-proxied responses. Check the `base64Encoded` flag. Always `atob()` before string matching.

2. **Must continue** — every `Fetch.requestPaused` must be followed by `Fetch.continueRequest`, `Fetch.fulfillRequest`, or `Fetch.failRequest`. Missing this hangs the page permanently. Use `.catch()` to swallow errors from detached targets.

3. **TypeScript** — `atob` is available in the Chrome extension service worker at runtime but not typed. Add at file top:
   ```typescript
   declare function atob(data: string): string;
   ```

4. **Service Worker targets** — SW network events are on a separate CDP target. Attach to both the tab and the SW:
   ```typescript
   const targets = await chrome.debugger.getTargets();
   const sw = targets.find(t =>
     t.type === 'service_worker' && t.url.startsWith(origin)
   );
   if (sw?.id) {
     await chrome.debugger.attach({ targetId: sw.id }, '1.3');
     await chrome.debugger.sendCommand(
       { targetId: sw.id }, 'Fetch.enable',
       { patterns: [{ urlPattern: '*pattern*', requestStage: 'Response' }] }
     );
   }
   ```

5. **Chrome `debugger` permission** — the extension manifest needs:
   ```json
   { "permissions": ["debugger"] }
   ```

Full investigation writeup: `docs/teams-room-availability-fix.md`.

---

## Technique 6: Auth patterns

### SSO/MFA redirect polling

The first `navigate` triggers SSO. Build in wait time:

```js
// Poll for a signal that auth completed
const deadline = Date.now() + 30000;
while (Date.now() < deadline) {
  // Signal: a DOM element that only renders when logged in
  if (document.querySelector('.user-avatar')) break;
  // Or: check if we're still on a login page
  if (/login|oauth|signin|sso/i.test(location.href)) {
    await new Promise(r => setTimeout(r, 2000));
    continue;
  }
  break;
}
```

### MSAL token extraction (Azure AD apps)

Many Microsoft/enterprise apps store tokens in sessionStorage. See `connectors/lib/msal-token.js` for the canonical pattern:

```js
const deadline = Date.now() + 60000;
let token;
while (Date.now() < deadline) {
  const key = Object.keys(sessionStorage).find(k => k.includes('accesstoken'));
  if (key) {
    try {
      const data = JSON.parse(sessionStorage.getItem(key));
      // Check token isn't about to expire (30s buffer)
      if (Number(data.expiresOn) > Math.floor(Date.now() / 1000) + 30) {
        token = data.secret;
        break;
      }
    } catch (_) {}
  }
  await new Promise(r => setTimeout(r, 1000));
}
if (!token) throw new Error('No valid MSAL access token — log in and retry');
```

Use the token as a Bearer header:
```js
const resp = await fetch(apiUrl, {
  headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' }
});
```

### Session cookies (fetch pattern)

For `fetch` pattern connectors, session cookies are sent automatically — `fetchFromPage` uses `credentials: 'include'`. Just `navigate` to the domain first to establish the session through SSO.

---

## Technique 7: SPA rendering delays

SPAs (React, Angular, Vue) render data after the initial page load. The `wait` step checks that a selector *exists* in the DOM — not that data has populated.

### In eval.js — poll for content

```js
const deadline = Date.now() + 30000;
while (Date.now() < deadline) {
  const rows = document.querySelectorAll('.data-table tbody tr');
  if (rows.length > 0) break;
  await new Promise(r => setTimeout(r, 1000));
}
```

### In YAML — chain wait + extract

```yaml
- step: wait
  selector: ".data-table tbody tr"   # wait for actual rows, not just the table
  timeout: 30000
- step: extract
  selector: ".data-table tbody tr"
  fields:
    name: "td:nth-child(1)"
```

---

## Technique 8: Driving UI interactions in eval.js

When you need to click buttons, type in fields, or navigate within an SPA — all from eval.js. See `connectors/teams-room-availability.eval.js` for a production example of all three.

### Clicking by accessible name

```js
function clickByName(name) {
  const els = Array.from(document.querySelectorAll('button, a, [role=button]'));
  const el = els.find(e => {
    if (!e.offsetParent) return false;  // skip hidden
    const label = (e.getAttribute('aria-label') || '').trim();
    const text = (e.textContent || '').replace(/\s+/g, ' ').trim();
    return label === name || label.includes(name) || text.includes(name);
  });
  if (!el) return false;
  el.scrollIntoView({ block: 'center' });
  el.click();
  return true;
}
```

### Typing into React-controlled inputs

React overrides the native `value` setter. Use the prototype setter to bypass:

```js
function typeText(selector, text) {
  const el = document.querySelector(selector);
  if (!el) throw new Error(`Element "${selector}" not found`);
  el.focus();
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype, 'value'
  ).set;
  setter.call(el, text);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}
```

### Waiting for a UI reaction

After clicking or typing, poll for the expected outcome — never use fixed sleeps alone:

```js
clickByName('Submit');
const deadline = Date.now() + 10000;
while (Date.now() < deadline) {
  if (document.querySelector('.results-loaded')) break;
  await new Promise(r => setTimeout(r, 500));
}
```
