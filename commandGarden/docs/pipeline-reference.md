# Pipeline Step Reference

Complete reference for all pipeline step types available in commandGarden connector YAML files. For authoring patterns and best practices, see the [Connector Authoring Guide](./connector-authoring.md).

---

## How pipelines work

A connector's `pipeline` is a sequence of steps that execute top-to-bottom. Most steps run inside the Chrome extension (in the browser tab's ISOLATED content script). Some steps (`transform`) run server-side in the daemon after the browser steps complete.

```
CLI request → daemon → [extension steps: browser] → daemon → [daemon steps: server] → response
```

Each step requires a **capability** declared in the connector's `capabilities` list. Steps with no capability (`map`, `filter`, `set`, `transform`) are always allowed.

### Pipeline context

Steps share state through a pipeline context with four scopes:

| Scope | Set by | Used in expressions as |
|---|---|---|
| **args** | CLI arguments | `${{ args.month }}` |
| **vars** | `set`, `cookie`, `fetch` (with `as`), `extract_html`, `intercept` | `${{ vars.token }}` |
| **cookies** | `cookie` step | `${{ cookies.session }}` |
| **data** (rows) | `extract`, `extract_tree`, `fetch` (array result) | `${{ row.field }}` (in `map` only) |

---

## Step types

### `navigate`

Opens a URL in a browser tab. Triggers SSO redirects, establishes session cookies.

```yaml
- step: navigate
  url: "https://example.com/${{ args.page }}"
```

| Parameter | Type | Required | Description |
|---|---|---|---|
| `url` | string | yes | URL to navigate to. Supports `${{ }}` expressions. |

**Capability:** `navigate` (low risk)

---

### `wait`

Waits for a CSS selector to appear in the DOM. Use after `navigate` to confirm the page loaded.

```yaml
- step: wait
  selector: "aside"
  timeout: 30000
```

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `selector` | string | no | — | CSS selector to wait for |
| `timeout` | number | no | 10000 | Max wait time in ms |

**Capability:** `navigate` (low risk)

---

### `extract`

Extracts text data from repeating DOM elements into rows. Each element matching `selector` becomes one row.

```yaml
- step: extract
  selector: "table tbody tr"
  fields:
    name: "td:nth-child(1)"
    score: "td:nth-child(2)"
```

| Parameter | Type | Required | Description |
|---|---|---|---|
| `selector` | string | yes | CSS selector matching row elements |
| `fields` | object | yes | Map of `fieldName: "CSS selector"` — resolved relative to each row element |

Each field's value is the matched sub-element's `textContent`, trimmed. Missing sub-elements produce `""`.

**Capability:** `dom_read` (low risk)
**Output:** Sets pipeline data (array of row objects)

---

### `extract_tree`

Recursively walks a DOM tree to extract leaf nodes with computed ancestry. Designed for navigation sidebars, hierarchical menus, and nested category structures.

```yaml
- step: extract_tree
  root: "aside > *:nth-child(2)"
  group:
    match: "div:has(> button), section:has(> button)"
    title: ":scope > button"
    children: ":scope > div"
  leaf:
    match: "a[href^='/docs/']"
    fields:
      title: textContent
      url: href
  pathSeparator: " / "
```

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `root` | string | yes | — | CSS selector for the tree root container |
| `group.match` | string | yes | — | Selector identifying section/group wrappers (relative to current container) |
| `group.title` | string | yes | — | Selector for the group's title element (relative to the group) |
| `group.children` | string | yes | — | Selector for the group's child container (relative to the group) |
| `leaf.match` | string | yes | — | Selector identifying leaf nodes (relative to current container) |
| `leaf.fields` | object | yes | — | Map of `fieldName: extractionSpec` |
| `pathSeparator` | string | no | `" / "` | Separator used in the breadcrumb `path` field |

**Leaf field extraction specs:**

| Spec | Extracts |
|---|---|
| `textContent` | Element's trimmed text content |
| `href` | The `href` attribute |
| `attr:<name>` | Any named attribute (e.g., `attr:data-id`) |

**Auto-computed fields** added to every output row:

| Field | Description |
|---|---|
| `section` | Title of the top-level ancestor group |
| `path` | Breadcrumb string of all ancestor titles + leaf title, joined by `pathSeparator` |
| `depth` | Nesting level (0 = direct child of root) |

**Walk behavior:** For each child of the current container:
1. If it matches `leaf.match` → extract fields, emit a row
2. If it matches `group.match` → extract title, recurse into `group.children`
3. Otherwise → recurse into the child's own children (transparent wrapper pass-through)

**Capability:** `dom_read` (low risk)
**Output:** Sets pipeline data (array of row objects)

---

### `extract_html`

Captures an element's raw `innerHTML` as a pipeline variable. Typically paired with a `transform` step to convert the HTML server-side.

```yaml
- step: extract_html
  selector: "article"
  as: rawHtml
```

| Parameter | Type | Required | Description |
|---|---|---|---|
| `selector` | string | yes | CSS selector for the target element |
| `as` | string | yes | Variable name to store the HTML string |

**Capability:** `dom_read` (low risk)
**Output:** Stores HTML string in `vars.<as>`

---

### `click`

Clicks a single DOM element.

```yaml
- step: click
  selector: "#submit-button"
```

| Parameter | Type | Required | Description |
|---|---|---|---|
| `selector` | string | yes | CSS selector for the element to click |

Throws an error if the element is not found.

**Capability:** `dom_write` (medium risk)

---

### `click_all`

Clicks all elements matching a selector, re-scanning after each round to handle dynamically revealed elements (e.g., expanding collapsed sidebar sections reveals new collapsible sections).

```yaml
- step: click_all
  selector: "aside button[aria-expanded='false']"
  pause: 200
  maxRounds: 10
  settle: 300
```

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `selector` | string | yes | — | CSS selector for elements to click |
| `pause` | number | no | 200 | Milliseconds to wait between individual clicks |
| `maxRounds` | number | no | 10 | Maximum re-scan iterations (prevents infinite loops) |
| `settle` | number | no | 300 | Milliseconds to wait after all clicks complete |

**Behavior loop:**
1. `querySelectorAll(selector)` — if no matches, stop
2. Click each matched element, waiting `pause` ms between clicks
3. Go to step 1 (repeat until no matches or `maxRounds` reached)
4. Wait `settle` ms for final DOM updates

**Capability:** `dom_write` (medium risk)

---

### `type`

Types text into an input element.

```yaml
- step: type
  selector: "input[aria-label='Search']"
  value: "${{ args.query }}"
```

| Parameter | Type | Required | Description |
|---|---|---|---|
| `selector` | string | yes | CSS selector for the input element |
| `value` | string | yes | Text to type. Supports `${{ }}` expressions. |

**Capability:** `dom_write` (medium risk)

---

### `fetch`

Executes a `fetch()` call from the page's content script with `credentials: 'include'`, sending the browser's session cookies automatically.

```yaml
- step: fetch
  url: "https://api.example.com/v1/items?date=${{ args.date }}"
  method: "GET"
  headers:
    Accept: "application/json"
    Authorization: "Bearer ${{ vars.token }}"
  as: apiResponse
```

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `url` | string | yes | — | Request URL. Supports `${{ }}` expressions. |
| `method` | string | no | `"GET"` | HTTP method |
| `headers` | object | no | — | Request headers. Values support `${{ }}` expressions. |
| `body` | string | no | — | Request body. Supports `${{ }}` expressions. |
| `as` | string | no | — | Variable name to store the response |

If the response is a JSON array and `as` is not set, the array becomes pipeline data. If `as` is set, the full response is stored as a variable.

**Capability:** `cookie_read` (medium risk)
**Output:** Sets pipeline data (if array) or stores in `vars.<as>`

---

### `cookie`

Reads cookies for a domain.

```yaml
- step: cookie
  domain: "example.com"
  name: "session"
  as: sessionToken
```

| Parameter | Type | Required | Description |
|---|---|---|---|
| `domain` | string | yes | Cookie domain (must be in the connector's `domains` list) |
| `name` | string | no | Specific cookie name to extract |
| `as` | string | no | Variable name to store the cookie value |

**Capability:** `cookie_read` (medium risk)

---

### `intercept`

Intercepts network responses matching a URL pattern. Used to capture data from requests the page makes on its own (e.g., GraphQL calls triggered by UI interactions).

```yaml
- step: intercept
  urlPattern: "*graphql*"
  as: captured
```

| Parameter | Type | Required | Description |
|---|---|---|---|
| `urlPattern` | string | yes | URL pattern to match (glob-style) |
| `as` | string | no | Variable name to store the captured response |

**Capability:** `intercept_response` (medium risk)

---

### `set`

Sets a pipeline variable to a value. Useful for computed values or constants.

```yaml
- step: set
  name: baseUrl
  value: "https://api.example.com"
```

| Parameter | Type | Required | Description |
|---|---|---|---|
| `name` | string | yes | Variable name |
| `value` | string | yes | Value. Supports `${{ }}` expressions. |

**Capability:** None

---

### `map`

Transforms pipeline data rows by selecting, renaming, or computing fields.

```yaml
- step: map
  fields:
    id: "${{ row.id }}"
    fullName: "${{ row.firstName }} ${{ row.lastName }}"
    status: "${{ row.status | default('unknown') }}"
```

| Parameter | Type | Required | Description |
|---|---|---|---|
| `fields` | object | yes | Map of `outputField: expression` |

Each row in the pipeline data is replaced with only the fields defined in the map. Use `${{ row.<field> }}` to access the current row's fields.

**Capability:** None
**Output:** Replaces pipeline data with mapped rows

---

### `filter`

Filters pipeline data rows, keeping only those matching a condition.

```yaml
- step: filter
  field: hours
  operator: gt
  value: "0"
```

| Parameter | Type | Required | Description |
|---|---|---|---|
| `field` | string | yes | Row field to test |
| `operator` | enum | yes | One of: `eq`, `ne`, `gt`, `lt`, `gte`, `lte`, `contains`, `matches` |
| `value` | string | yes | Comparison value. Supports `${{ }}` expressions. |

**Capability:** None
**Output:** Filters pipeline data in place

---

### `transform`

Runs a named data transformation **server-side in the daemon** (not in the browser). This is the only step type that executes outside the Chrome extension.

```yaml
- step: transform
  type: html_to_markdown
  input: rawHtml
  as: content
```

| Parameter | Type | Required | Description |
|---|---|---|---|
| `type` | string | yes | Transform name (see table below) |
| `input` | string | yes | Variable name containing the input data |
| `as` | string | yes | Variable name to store the result |
| `options` | object | no | Transform-specific options |

**Available transforms:**

| Name | Input | Output | Description |
|---|---|---|---|
| `html_to_markdown` | HTML string | Markdown string | Converts HTML to Markdown (headings, code blocks, tables, lists, links preserved) |
| `split_metadata` | Delimited string | Record of named fields | Splits a string by delimiter into named fields |

**`split_metadata` options:**

```yaml
- step: transform
  type: split_metadata
  input: authorPill
  as: meta
  options:
    delimiter: "|"
    fields:
      - author
      - lastUpdated
```

When `split_metadata` runs, each named field is stored as a separate variable (e.g., `vars.author`, `vars.lastUpdated`), not as a single object.

**Capability:** None (runs server-side)
**Pipeline ordering:** All `transform` steps must come after all browser-side steps. The daemon splits the pipeline at the first `transform` step — everything before runs in the extension, everything after runs in the daemon.

---

### `js_evaluate`

Executes arbitrary JavaScript in the page's **MAIN world** (same context as the website's own scripts). This is the most powerful and least restricted step type.

```yaml
- step: js_evaluate
  file: my-connector.eval.js
```

Or with inline code:

```yaml
- step: js_evaluate
  code: "return document.title;"
  as: pageTitle
```

| Parameter | Type | Required | Description |
|---|---|---|---|
| `code` | string | no* | JavaScript code to execute |
| `file` | string | no* | Path to a `.eval.js` file (relative to the connector YAML) |
| `as` | string | no | Variable name to store the return value |

*One of `code` or `file` is required.

If the code returns an array and `as` is not set, the array becomes pipeline data. Template expressions `${{ }}` in the code string are interpolated before execution.

**Capability:** `js_evaluate` (high risk)

> **Security warning:** `js_evaluate` runs in the page's MAIN world with full access to cookies, sessionStorage, page APIs, and network. Prefer declarative steps (`extract`, `extract_tree`, `click_all`, `fetch`) whenever possible. See the [security analysis](./plans/js-evaluate-security-analysis.md) for details.

---

## Capabilities and risk levels

Every step requires a capability declared in the connector's `capabilities` list. The risk level determines whether approval is needed before execution.

| Capability | Risk | Required by |
|---|---|---|
| `navigate` | low | `navigate`, `wait` |
| `dom_read` | low | `extract`, `extract_tree`, `extract_html` |
| `dom_write` | medium | `click`, `click_all`, `type` |
| `cookie_read` | medium | `cookie`, `fetch` |
| `intercept_response` | medium | `intercept` |
| `js_evaluate` | **high** | `js_evaluate` |

Steps with no capability (`map`, `filter`, `set`, `transform`) are always allowed.

---

## Execution model

### Extension steps (browser-side)

Steps run sequentially inside the Chrome extension's content script (**ISOLATED world**). They can read and manipulate the DOM but cannot access page JavaScript, cookies via `document.cookie`, or `sessionStorage`. Click events dispatched from ISOLATED world propagate to the page's MAIN world handlers normally.

Exception: `js_evaluate` runs in the **MAIN world** with full page access.

### Daemon steps (server-side)

`transform` steps run in the daemon's Node.js process after the extension returns. They receive pipeline variables and data from the extension response and can run computations (like HTML→Markdown conversion) without browser access.

### Pipeline split

The daemon automatically splits the pipeline at the first daemon-side step. Extension steps execute first in the browser, then daemon steps execute locally:

```
pipeline:
  - navigate    ─┐
  - wait         │  extension segment
  - extract      │  (runs in Chrome)
  - extract_html─┘
  - transform   ─┐  daemon segment
  - transform   ─┘  (runs in Node.js)
```

Variables set by extension steps (via `extract_html`, `set`, etc.) are returned to the daemon and available to `transform` steps. Data rows from `extract` are also available.
