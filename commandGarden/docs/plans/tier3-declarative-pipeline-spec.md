# Tier 3: Declarative Pipeline Extensions

Extend the pipeline vocabulary with `click_all`, `extract_tree`, `extract_html`, and `transform` steps so that DOM-only connectors (`gcs-kb-pages`, `gcs-kb-content`) can drop `js_evaluate` entirely.

---

## Scope

**In scope:**
- 3 new extension-side steps: `click_all`, `extract_tree`, `extract_html`
- 1 new daemon-side step: `transform`
- Pipeline split architecture (extension segment → daemon segment)
- Rewrite `gcs-kb-pages` and `gcs-kb-content` connectors to use new steps
- Remove `js_evaluate` capability from both connectors

**Out of scope:**
- Connectors that need page JS access (timetracking, jira, ado, outlook, teams)
- Connector signing (separate effort)
- Tier 1/2 hardening (separate effort)

---

## Design Decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| 1 | `click_all` design | Simple loop: selector + pause + maxRounds | Selector handles scoping (e.g. `aside button[...]`). No `within:` needed yet |
| 2 | Tree extraction | Purpose-built `extract_tree` step | Tree-nav pattern recurs across docs sites. Clear, auditable, covers sidebar→sections→pages |
| 3 | `gcs-kb-content` approach | `extract_html` in extension + `transform` in daemon | Separates DOM access (ISOLATED) from text transformation (Node.js) |
| 4 | Markdown conversion | Server-side `transform` step | Runs in daemon. Explicit in YAML. Opens door for future transforms |
| 5 | Execution world | ISOLATED (content script) | `.click()` events propagate to MAIN world handlers. No page JS access needed |
| 6 | Capability mapping | `click_all` → `dom_write`, `extract_tree`/`extract_html` → `dom_read` | Matches existing pattern. No new capabilities |
| 7 | Pipeline split | Pre-split at boundary | Extension steps first, daemon steps after. No interleaving |
| 8 | SSO wait | Use existing `wait` step | Wait for post-SSO DOM element. No new step needed |
| 9 | Metadata extraction | Use existing `extract` for text fields | `extract_html` only for body that needs Markdown conversion |

---

## New Step Specifications

### `click_all`

**Purpose:** Click all elements matching a selector, repeating until no more matches remain. Handles dynamically revealed elements (e.g. expanding sidebar sections reveals nested collapsed sections).

**Capability:** `dom_write` (medium risk)  
**Execution:** ISOLATED world (content script)

**Schema:**
```yaml
- step: click_all
  selector: string    # CSS selector for elements to click
  pause: number       # ms to wait between clicks (default: 200)
  maxRounds: number   # max re-scan iterations (default: 10)
  settle: number      # ms to wait after all clicks complete (default: 300)
```

**Behavior:**
1. Query `document.querySelectorAll(selector)`
2. For each matched element, call `.click()` and wait `pause` ms
3. Re-query the selector. If new matches found, repeat from step 2
4. Stop when no matches remain OR `maxRounds` reached
5. Wait `settle` ms for final DOM updates

**Returns:** `undefined` (side-effect only step)

**Implementation location:** `chrome/src/content/dom-executor.ts` → new `clickAll()` function

---

### `extract_tree`

**Purpose:** Recursively walk a DOM tree to extract a flat list of leaf nodes with computed ancestry fields (section, path, depth).

**Capability:** `dom_read` (low risk)  
**Execution:** ISOLATED world (content script)

**Schema:**
```yaml
- step: extract_tree
  root: string          # CSS selector for the tree root container
  group:                # defines what constitutes a "section" (non-leaf node)
    match: string       # CSS selector relative to current container (e.g. "div:has(> button)")
    title: string       # CSS selector for the group's title element (e.g. ":scope > button")
    children: string    # CSS selector for the group's child container (e.g. ":scope > div")
  leaf:                 # defines what constitutes a leaf node
    match: string       # CSS selector relative to current container (e.g. "a[href^='/gcs/KB/']")
    fields:             # field extraction rules
      <name>: string    # "textContent", "href", or a CSS attribute name like "attr:data-id"
  pathSeparator: string # separator for the path field (default: " / ")
```

**Behavior:**
1. Find `root` element via `document.querySelector(root)`
2. Recursively walk children of the root:
   - If a child matches `group.match`: extract title via `group.title`, recurse into `group.children`
   - If a child matches `leaf.match`: extract fields, emit a row
   - Otherwise: recurse into child's children (pass-through wrapper)
3. Each emitted row automatically includes:
   - All declared `leaf.fields`
   - `section`: title of the top-level ancestor group (depth 0)
   - `path`: breadcrumb string of all ancestor titles + leaf title, joined by `pathSeparator`
   - `depth`: nesting level (0 = direct child of root)

**Returns:** `Record<string, unknown>[]` — one row per leaf node

**Implementation location:** `chrome/src/content/dom-executor.ts` → new `extractTree()` function

**Example (gcs-kb-pages):**
```yaml
- step: extract_tree
  root: "aside > *:nth-child(2)"
  group:
    match: "div:has(> button), section:has(> button)"
    title: ":scope > button"
    children: ":scope > div"
  leaf:
    match: "a[href^='/gcs/KB/']"
    fields:
      title: textContent
      url: href
```

Output rows:
```json
[
  { "title": "EDR", "url": "/gcs/KB/docs/general-security/edr/", "section": "General Security", "path": "General Security / EDR", "depth": 1 },
  ...
]
```

---

### `extract_html`

**Purpose:** Extract the raw `innerHTML` of a DOM element and store it as a pipeline variable.

**Capability:** `dom_read` (low risk)  
**Execution:** ISOLATED world (content script)

**Schema:**
```yaml
- step: extract_html
  selector: string    # CSS selector for the element
  as: string          # variable name to store the HTML string
```

**Behavior:**
1. Find element via `document.querySelector(selector)`
2. Read `element.innerHTML`
3. Store as pipeline variable `as`

**Returns:** Raw HTML string (stored via `ctx.setVar`)

**Implementation location:** `chrome/src/content/dom-executor.ts` → new `extractHtml()` function

---

### `transform`

**Purpose:** Apply a named transformation to pipeline data, running in the daemon (Node.js), not the extension.

**Capability:** `null` (no browser capability needed — runs server-side)  
**Execution:** Daemon process (Node.js)

**Schema:**
```yaml
- step: transform
  type: string        # transformation name (e.g. "html_to_markdown")
  input: string       # pipeline variable name containing input data
  as: string          # variable name to store the result
```

**Available transforms:**

| Name | Input | Output | Description |
|---|---|---|---|
| `html_to_markdown` | HTML string | Markdown string | Convert HTML to Markdown using `turndown` library |
| `split_metadata` | String with delimiter | Object with named parts | Split a string by delimiter into named fields |

**Implementation location:** `daemon/src/transforms.ts` → new module with transform registry

---

## Pipeline Split Architecture

### Current flow
```
CLI → daemon → [WebSocket] → extension PipelineRunner (runs ALL steps) → [WebSocket] → daemon → CLI
```

### New flow
```
CLI → daemon → split pipeline → [WebSocket] → extension PipelineRunner (extension steps) 
  → [WebSocket] → daemon DaemonRunner (daemon steps) → CLI
```

### Implementation

**In `shared/src/pipeline.ts`:**
- Add new step schemas (`clickAllStepSchema`, `extractTreeStepSchema`, `extractHtmlStepSchema`, `transformStepSchema`)
- Add to `PIPELINE_STEP_TYPES` and `STEP_CAPABILITY_MAP`
- Add `DAEMON_STEPS = ['transform'] as const` — steps that run server-side
- Export `splitPipeline(steps)` → `{ extensionSteps, daemonSteps }`

**In `daemon/src/server.ts`:**
- After receiving extension response, check if `daemonSteps` exist
- If so, run them via new `DaemonRunner` class
- Return final result to CLI

**In `daemon/src/daemon-runner.ts` (new file):**
- `DaemonRunner.run(steps, data, vars)` — executes daemon-side steps
- For `transform` step: look up transform by `type`, apply to `input` variable, store as `as`

**In `daemon/src/transforms.ts` (new file):**
- Transform registry: `{ html_to_markdown: (input: string) => string }`
- `html_to_markdown`: use `turndown` npm package (well-maintained, 0 deps)

---

## Rewritten Connectors

### `gcs-kb-pages.yaml` (after)
```yaml
site: gcs
name: kb-pages
version: "2.0"
description: "Page index of the GCS Knowledge Base — titles, URLs, sections, and hierarchy"
access: read

domains:
  - "pages.i.mercedes-benz.com"
capabilities:
  - navigate
  - dom_read
  - dom_write

columns:
  - name: title
    type: string
  - name: url
    type: string
  - name: section
    type: string
  - name: path
    type: string
  - name: depth
    type: number

pipeline:
  - step: navigate
    url: "https://pages.i.mercedes-benz.com/gcs/KB/docs/main/"
  - step: wait
    selector: "aside"
    timeout: 30000
  - step: click_all
    selector: "aside button[aria-expanded='false']"
    pause: 200
    maxRounds: 10
    settle: 300
  - step: extract_tree
    root: "aside > *:nth-child(2)"
    group:
      match: "div:has(> button), section:has(> button)"
      title: ":scope > button"
      children: ":scope > div"
    leaf:
      match: "a[href^='/gcs/KB/']"
      fields:
        title: textContent
        url: href
```

**Changes:** `js_evaluate` → `click_all` + `extract_tree`. Capability downgraded from `js_evaluate` (high) to `dom_read` + `dom_write` (low + medium). `.eval.js` file deleted.

---

### `gcs-kb-content.yaml` (after)
```yaml
site: gcs
name: kb-content
version: "2.0"
description: "Retrieve a single GCS Knowledge Base page as Markdown"
access: read

domains:
  - "pages.i.mercedes-benz.com"
capabilities:
  - navigate
  - dom_read

args:
  - name: path
    type: string
    required: true
    help: "Page path from the kb-pages index, e.g. /gcs/KB/docs/general-security/edr/"

columns:
  - name: title
    type: string
  - name: path
    type: string
  - name: author
    type: string
  - name: lastUpdated
    type: string
  - name: content
    type: string

pipeline:
  - step: navigate
    url: "https://pages.i.mercedes-benz.com${{ args.path }}"
  - step: wait
    selector: "article"
    timeout: 30000
  - step: extract
    selector: "article"
    fields:
      title: "h1"
      authorPill: "span.inline-flex"
  - step: extract_html
    selector: "article > *:nth-child(2)"
    as: rawHtml
  - step: transform
    type: html_to_markdown
    input: rawHtml
    as: content
  - step: transform
    type: split_metadata
    input: "${{ var.authorPill }}"
    as: meta
    options:
      delimiter: "|"
      fields: ["author", "lastUpdated"]
```

**Changes:** `js_evaluate` → `extract` + `extract_html` + `transform`. Capability downgraded from `js_evaluate` (high) to `dom_read` (low). `.eval.js` file deleted. Markdown conversion runs in daemon.

---

## Implementation Plan

### Phase 1 — Schema & shared types
1. Add `click_all`, `extract_tree`, `extract_html`, `transform` to `shared/src/pipeline.ts`
2. Add `DAEMON_STEPS` constant and `splitPipeline()` function
3. Update `shared/src/capabilities.ts` `STEP_CAPABILITY_MAP`
4. Update `shared/src/loader.ts` validation (semantic checks for new steps)
5. Tests for schema parsing and pipeline splitting

### Phase 2 — Content script implementation
6. Add `clickAll()` to `chrome/src/content/dom-executor.ts`
7. Add `extractTree()` to `chrome/src/content/dom-executor.ts`
8. Add `extractHtml()` to `chrome/src/content/dom-executor.ts`
9. Register new actions in `chrome/src/content/content-script.ts`
10. Add new step cases in `chrome/src/pipeline/runner.ts`
11. Unit tests for each new dom-executor function
12. Pipeline runner tests for new step types

### Phase 3 — Daemon-side runner
13. Create `daemon/src/transforms.ts` — transform registry
14. Create `daemon/src/daemon-runner.ts` — daemon-side pipeline runner
15. Update `daemon/src/server.ts` — split pipeline, run daemon steps after extension response
16. Add `turndown` dependency to daemon `package.json`
17. Unit tests for transforms and daemon runner

### Phase 4 — Connector migration
18. Rewrite `gcs-kb-pages.yaml` (drop js_evaluate, use click_all + extract_tree)
19. Delete `gcs-kb-pages.eval.js`
20. Rewrite `gcs-kb-content.yaml` (drop js_evaluate, use extract + extract_html + transform)
21. Delete `gcs-kb-content.eval.js`
22. Update connector e2e tests

### Phase 5 — Validation
23. Manual testing against live GCS Knowledge Base site
24. Verify audit trail correctly logs new step types
25. Verify that both connectors work without `js_evaluate` capability
