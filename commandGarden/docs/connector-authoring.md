# Connector Authoring Guide

This guide covers patterns, best practices, and common pitfalls when writing commandGarden connectors. For the basic YAML structure, see the [README](../README.md#writing-a-custom-connector).

---

## Pipeline Patterns

### Pattern 1: Declarative `fetch → map` (recommended for APIs)

Use when the target site exposes a REST API and your browser session cookies provide authentication.

```yaml
capabilities:
  - navigate
  - cookie_read

pipeline:
  - step: navigate
    url: "https://api.example.com/"
  - step: wait
    selector: "body"
    timeout: 30000
  - step: fetch
    url: "https://api.example.com/v1/items"
    method: "GET"
    headers:
      Accept: "application/json"
  - step: map
    fields:
      id: "${{ row.id }}"
      name: "${{ row.name }}"
```

**How it works:**
1. `navigate` opens the domain to establish the browser session (SSO redirect, cookie handshake, etc.)
2. `wait` ensures the page loaded (confirms session is ready)
3. `fetch` runs a real `fetch()` call inside the page's content script with `credentials: 'include'`, sending session cookies automatically
4. `map` selects and renames the fields you want from the JSON response

**When to use:** Cookie-authenticated REST APIs that return JSON arrays. No DOM scraping, no JavaScript evaluation — the safest connector pattern.

**Real example:** [`tokenmaster-clients-list.yaml`](../connectors/tokenmaster-clients-list.yaml)

### Pattern 2: `extract` (DOM scraping)

Use when the data you need is rendered in the HTML DOM and there's no API.

```yaml
capabilities:
  - navigate
  - dom_read

pipeline:
  - step: navigate
    url: "https://example.com/reports"
  - step: wait
    selector: ".results-table"
    timeout: 10000
  - step: extract
    selector: ".results-table tbody tr"
    fields:
      name: "td:nth-child(1)"
      value: "td:nth-child(2)"
```

### Pattern 3: `js_evaluate` (complex scraping)

Use as a last resort when the data requires JavaScript execution to extract — for example, when you need to intercept network requests, interact with SPAs, or process data that isn't directly in the DOM.

```yaml
capabilities:
  - navigate
  - js_evaluate

pipeline:
  - step: navigate
    url: "https://example.com/"
  - step: js_evaluate
    file: my-connector.eval.js
```

> **Warning:** `js_evaluate` is a high-risk capability. The connector must be explicitly approved via `cg config set security.approvedHighRisk <connector>` before it will run.

### Pattern 4: Next.js `__NEXT_DATA__` extraction

Use when the target site is built with Next.js (SSG/SSR) and embeds page data in a `<script id="__NEXT_DATA__">` tag. This is common for marketing sites, blogs, and documentation portals.

```yaml
capabilities:
  - navigate
  - js_evaluate

pipeline:
  - step: navigate
    url: "https://example.com/blog"
  - step: wait
    selector: "#__NEXT_DATA__"
    timeout: 15000
  - step: js_evaluate
    file: my-nextjs-connector.eval.js
```

The eval.js file parses the embedded JSON:

```js
// NOTE: No IIFE wrapper — evaluateInPage wraps code in AsyncFunction already.
const script = document.getElementById('__NEXT_DATA__');
if (!script) throw new Error('__NEXT_DATA__ script tag not found');

const nextData = JSON.parse(script.textContent);
const items = nextData?.props?.pageProps?.items;
if (!Array.isArray(items)) throw new Error('items not found');

return items.map(item => ({
  title: item.title || '',
  url: item.url || '',
}));
```

**How it works:**
1. `navigate` opens the Next.js page
2. `wait` ensures the SSG/SSR payload is present in the DOM
3. `js_evaluate` parses the JSON from the script tag — no network requests needed

**When to use:** Any Next.js site where `__NEXT_DATA__` contains the data you need. The `initialProps` or `pageProps` object usually mirrors what the React components render. Inspect the `<script id="__NEXT_DATA__">` tag in DevTools to find the shape.

**Real example:** [`wiz-blog-security.yaml`](../connectors/wiz-blog-security.yaml)

---

## Expression Syntax in `map` Steps

Inside a `map` step, each row from the pipeline data is available as `row`:

```yaml
- step: map
  fields:
    id: "${{ row.id }}"                          # direct field access
    label: "${{ row.firstName }} ${{ row.lastName }}"  # string interpolation
    status: "${{ row.status | default('unknown') }}"   # with filter
```

### Available scopes

| Scope | Available in | Example |
|---|---|---|
| `args.<name>` | All steps | `${{ args.month }}` |
| `vars.<name>` | All steps (after `set` or `as`) | `${{ vars.token }}` |
| `cookies.<name>` | All steps (after `cookie`) | `${{ cookies.session }}` |
| `row.<field>` | `map` steps only | `${{ row.id }}` |

Both `${{ row.field }}` and `${{ vars.row.field }}` work in map steps. Prefer the shorter `row.field` form.

### Filters

```yaml
"${{ args.month | default('2026-06') }}"   # fallback value
"${{ row.name | trim }}"                   # strip whitespace
"${{ row.name | upper }}"                  # uppercase
"${{ row.name | lower }}"                  # lowercase
"${{ row.amount | number }}"               # parse as number
```

### Arrays in map expressions

When a JSON field is an array (e.g., `["ALICE", "BOB"]`), referencing it in a map expression automatically converts it to a comma-separated string via `String(array)`:

```yaml
# API returns: { "admins": ["ALICE", "BOB"] }
# Output:      "ALICE,BOB"
admins: "${{ row.admins }}"
```

---

## Fetch Step Best Practices

### Always set `Accept: application/json`

Without an explicit `Accept` header, some APIs perform content negotiation and may return HTML or other formats. When `fetchFromPage` receives a non-JSON content type, it returns the body as a string. The pipeline runner checks `Array.isArray(result)` — a string fails this check, and the data is silently dropped (0 rows, no error).

```yaml
# BAD — may get non-JSON response
- step: fetch
  url: "https://api.example.com/v1/items"

# GOOD — explicitly requests JSON
- step: fetch
  url: "https://api.example.com/v1/items"
  method: "GET"
  headers:
    Accept: "application/json"
```

### Wrapped API responses

If the API returns a wrapper object instead of a plain array (e.g., `{ "results": [...], "total": 100 }`), the `Array.isArray` check will fail. Use the `dataPath` parameter to drill into the response and extract the nested array:

```yaml
- step: fetch
  url: "https://api.example.com/v1/items"
  headers:
    Accept: "application/json"
  dataPath: "results"
```

The `dataPath` supports dot-separated paths for deeply nested responses (e.g., `dataPath: "data.results"`). If the path doesn't resolve to an array, the pipeline data remains empty (0 rows, no error).

Alternatively, use `as` to capture the full response as a variable for manual handling in subsequent steps.

---

## Debugging Connectors

### Step 1: Check the audit log

The audit log records per-step execution details. This is the single most useful debugging tool:

```bash
# See recent executions with full step details
cg audit export --format json --since 1h
```

Each `command.success` or `command.error` event includes:
- **`rowCount`** — 0 rows usually means the `fetch` step didn't return an array, or the data was lost between steps
- **`steps[]`** — per-step timing and error messages
- **`durationMs`** — total execution time (long durations often mean SSO redirect on first run)

### Step 2: Check step timing

| Symptom | Likely cause |
|---|---|
| `navigate` takes >5s on first run, <1s on subsequent | SSO redirect (normal — session established on first run) |
| `fetch` returns instantly (~0ms) | Content script not injected on the correct tab, or URL is wrong |
| `fetch` succeeds but `rowCount: 0` | API returned non-JSON (missing `Accept` header) or a wrapper object |
| `map` step produces `"undefined"` values | Field names don't match the API response (check casing) |

### Step 3: Inspect raw fetch output

Temporarily remove the `map` step, rebuild, restart, and run with `--format json` to see what the `fetch` step actually returns:

```bash
cg run my-site/my-command --format json
```

If the JSON output shows the raw API fields, the issue is in the map expressions. If it shows `"undefined"` values, the issue is upstream (fetch content type, wrapped response, etc.).

### Step 4: Verify the connector is loaded

```bash
cg list               # should show your connector
cg inspect my-site/my-command  # shows full YAML definition
```

If your connector doesn't appear, check that the YAML file is in one of the configured `connectors.paths` (default: `daemon/connectors/` for built-in, `~/.commandgarden/connectors` for user-defined).

---

## Development Cycle (Source Connectors)

Connectors in `connectors/` (monorepo root) are **built-in** — they ship with the CLI package. During development, changes to these files require a **3-step reload**:

```
 Edit source YAML or extension code
         │
         ▼
 ┌───────────────────┐
 │  npm run build    │  Copies connectors/ → daemon/connectors/
 │                   │  Rebuilds extension service worker
 └─────────┬─────────┘
           │
           ▼
 ┌───────────────────┐
 │  cg down && cg up │  Daemon reloads connector registry from
 │                   │  its bundled connectors/ directory
 └─────────┬─────────┘
           │
           ▼
 ┌───────────────────┐
 │  chrome://extensions │  Click reload (↻) on commandGarden
 │  → reload extension  │  Chrome caches the service worker;
 │                      │  code changes need explicit reload
 └──────────────────────┘
```

**Shortcut for YAML-only changes:** If you only changed the connector YAML (no extension code), you can skip the Chrome extension reload — just `npm run build` and restart the daemon.

**Alternative for rapid iteration:** Place your WIP connector in `~/.commandgarden/connectors/` instead. The daemon loads from this directory too, so you can edit → restart daemon → test without rebuilding. Same `site/name` key overrides the built-in version.

---

## Common Pitfalls

| Pitfall | Symptom | Fix |
|---|---|---|
| Missing `Accept: application/json` | 0 rows, no error | Add `headers: { Accept: "application/json" }` to fetch step |
| Wrong expression scope in map | All values show `"undefined"` | Use `${{ row.field }}`, not `${{ field }}` |
| Edited source YAML but didn't rebuild | Old behavior persists | Run `npm run build` then restart daemon |
| Rebuilt extension but didn't reload in Chrome | Old extension code runs | Reload at `chrome://extensions` |
| API returns wrapper object, not array | 0 rows, no error | Use `as: "response"` and handle nested array |
| Field name casing mismatch | Some values `"undefined"` | Check actual API response field names (case-sensitive) |
| IIFE wrapper in `js_evaluate` eval file | 0 rows, no error | `evaluateInPage` wraps code in `AsyncFunction` — a `return` inside an IIFE exits the inner function, not the outer one. Write bare top-level code with `return`, no `(function(){ ... })()` wrapper |
