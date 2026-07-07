---
description: "Connector authoring for commandGarden. Use when creating a new connector YAML, adding a data source, or debugging why a connector returns 0 rows."
---

Build a new commandGarden connector from recon through polish. Each step has a checkable completion criterion.

## Step 1: Recon the target site

Open the target site in Chrome with DevTools. Goal: find where the data lives and which extraction pattern fits.

**Check in this order (cheapest capability first):**

1. **Network tab → XHR/Fetch** — filter requests while using the UI. JSON API responses → **`fetch → map`** (capabilities: `navigate`, `cookie_read`). Safest pattern — prefer it.

2. **Elements tab → DOM** — repeating elements (table rows, cards) → **`extract`** (`navigate`, `dom_read`). Nested tree (sidebar nav) → **`extract_tree`** (add `dom_write` if collapsed sections need `click_all`).

3. **Network tab → page-initiated requests** — data from requests the page makes on its own (GraphQL, polling) → **`intercept`** step with `urlPattern` (`navigate`, `intercept_response`). Middle ground between `fetch` and `js_evaluate`.

4. **Source tab → `<script id="__NEXT_DATA__">`** or `__remixContext` — framework-embedded page data → **`js_evaluate`** parsing the script tag.

5. **Console → `sessionStorage`** — MSAL/OAuth tokens needed as Bearer for API calls → **`js_evaluate`** polling sessionStorage then calling fetch with the token.

6. **Network tab → invisible transports** — requests missing from `window.fetch` interception (MCAS proxy, Service Workers) → **`js_evaluate`** with fetch interception, potentially requiring CDP `Fetch.enable`. Read [`RECON-PLAYBOOK.md`](RECON-PLAYBOOK.md) technique 5 before going this route.

**Record during recon:**
- Exact hostname(s) → `domains`
- API endpoint or DOM selectors
- Response shape (field names, types) → `columns`
- Auth mechanism (SSO redirect, MFA, token polling, session cookies)
- Proxy layers (MCAS `*.mcas.ms`, Cloudflare, etc.)

**Completion:** You can name the pattern and have the target URL, data shape, and auth mechanism documented.

---

## Step 2: Scaffold the YAML

Create the `.yaml` file in `~/.commandgarden/connectors/` for rapid iteration (daemon loads this directory without rebuild).

```yaml
site: <sitename>
name: <command-name>
version: "1.0"
description: "<what data this connector returns>"
access: read

domains:
  - "<exact hostname from recon>"
capabilities:
  - navigate
  # add others based on chosen pattern

args:
  - name: <argname>
    type: string
    required: true
    help: "<what this arg does>"
    # optional: pattern, enum, default

columns:
  - name: <fieldname>
    type: string  # or number, boolean

pipeline: []
```

The full connector schema is defined in `shared/src/connector.ts` (Zod). Validation rules:
- Every hostname in `navigate`/`fetch`/`cookie` URLs must appear in `domains`.
- Every pipeline step's required capability must appear in `capabilities`.
- `js_evaluate` steps require either `code` or `file`.

Run `cg validate <path>` — it should report only the empty-pipeline error, nothing else.

**Completion:** `cg validate` reports only the pipeline-length schema error.

---

## Step 3: Implement the pipeline

Fill in `pipeline` based on the pattern from recon.

Read [`docs/connector-authoring.md`](../../docs/connector-authoring.md) for pattern templates (fetch→map, extract, extract_tree, js_evaluate, __NEXT_DATA__) and [`docs/pipeline-reference.md`](../../docs/pipeline-reference.md) for the full step reference.

**Key rules for `js_evaluate` eval.js files:**

- **No IIFE wrapper.** The runner wraps code in `new AsyncFunction()`. A `return` inside `(function(){ ... })()` exits the inner function — the outer function gets `undefined` and the pipeline silently produces 0 rows.
- **`await` works** at the top level.
- **Template variables** `${{ args.name }}` are interpolated before execution. Quote them: `const x = '${{ args.date }}'`.
- **Return** an array of objects to set pipeline data. Or use `as:` on the step to store a single value as a variable.
- **Poll for auth** — SSO redirects take time. Poll `sessionStorage` or a DOM signal in a loop with a 30–60s deadline.

Create the `.eval.js` file **next to** the YAML. See existing examples in `connectors/` for each pattern.

**Completion:** `cg validate <path>` passes clean. If using `js_evaluate`, the `.eval.js` file exists.

---

## Step 4: Debug loop

The loop: **run → read audit → probe → fix → repeat.**

### First run

```bash
# Approve if using js_evaluate
cg config set security.approvedHighRisk <site>/<name>

cg run <site>/<name> --format json
```

### Read the audit log (always do this first)

```bash
cg audit export --format json --since 5m
```

Check `steps[]` — per-step timing and errors. See the symptom→cause table in [`docs/connector-authoring.md` § Debugging Connectors](../../docs/connector-authoring.md#debugging-connectors).

### When the audit log isn't enough

Read [`RECON-PLAYBOOK.md`](RECON-PLAYBOOK.md) for ground-layer probing:

- **Strip the pipeline** — remove steps from the end until data flows, add back one at a time.
- **Raw output** — remove `map` step, run with `--format json` to see actual field names.
- **Console injection** — `console.log()` in eval.js, watch in DevTools.
- **window.fetch interception** — capture requests the page makes on its own.
- **CDP Fetch.enable** — when `window.fetch` misses requests (MCAS, Service Workers).

### Reload cycle

The daemon caches eval.js contents at startup via `ConnectorRegistry.resolveFileRefs()`.

| What changed | Minimum reload |
|---|---|
| WIP YAML/eval.js in `~/.commandgarden/connectors/` | Restart daemon: `cg down && cg up` |
| Source YAML only (in `connectors/`) | `npm run build -w daemon && cg down && cg up` |
| Source YAML + eval.js | `npm run build -w daemon && cg down && cg up` |
| Extension code (chrome-adapter.ts) | `npm run build && cg down && cg up` + reload at `chrome://extensions` |

**Fastest path:** Put WIP connector in `~/.commandgarden/connectors/`. Edit → restart daemon → test. No build step.

**Completion:** `cg run` returns expected data rows consistently across 3+ runs. Audit log shows no unexpected step errors or delays.

---

## Step 5: Polish

1. **Args** — add `pattern` for format validation (`"^\\d{4}-\\d{2}$"`), `enum` for fixed choices, `default` for optional args.
2. **Columns** — declare every output field with correct `type`. Drives CLI table formatting.
3. **Error messages** — in eval.js, throw with actionable text: `'Not signed in — log in and retry'`, `'No results for "${query}"'`.
4. **Description** — one line: what data the connector returns, not how.
5. **Validate + inspect:**
   ```bash
   cg validate <path>
   cg list                        # shows in connector list
   cg inspect <site>/<name>       # shows full definition with args
   ```

**Completion:** `cg validate` passes. `cg list` shows the connector. `cg inspect` shows args with help text. Bad args produce a helpful error. `cg run` with `--format table` formats columns correctly.
