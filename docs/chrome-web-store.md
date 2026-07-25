# Publishing the Chrome Extension

Publishing the `commandGarden` Chrome extension to the Chrome Web Store (CWS).

---

## Prerequisites

- [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole) account (one-time $5 registration fee)
- Optionally, a verified publisher identity (domain or Google Group) so the listing shows a publisher name instead of an individual email

---

## Build the extension zip

The build script (`src/chrome/build.mjs`) outputs a ready-to-upload directory at `src/chrome/dist/`:

```bash
npm run build          # builds all packages (shared → daemon → cli → chrome → app)
cd src/chrome/dist
zip -r ../commandgarden-chrome.zip .
```

The zip must contain `manifest.json` at its root (not nested in a subfolder). The build script already copies it there.

---

## Listing visibility

CWS offers three visibility tiers:

| Visibility | Discoverability | Use case |
|---|---|---|
| Public | Searchable by anyone on CWS | Open distribution |
| Unlisted | Accessible only via direct link | Enterprise — IT pushes via policy |
| Private | Restricted to a Google Workspace domain | Internal-only |

For enterprise distribution, **Unlisted** is recommended: IT can force-install via `ExtensionSettings` policy without exposing the extension publicly.

---

## Submission steps

1. **Upload** — In the Developer Dashboard, create a new item and upload the zip.
2. **Store listing** — Use the content from the [Store listing content](#store-listing-content) section below.
3. **Privacy practices** — Use the content from the [Privacy practices form content](#privacy-practices-form-content) section below.
4. **Distribution** — Select Public, Unlisted, or Private.
5. **Submit for review.**

---

## Store listing content

Paste-ready content for the CWS store listing form.

**Name:** commandGarden

**Short description (132 char max):**

> Enterprise browser automation — run secure, auditable data-extraction commands against internal web apps from the CLI.

**Detailed description:**

> commandGarden is an enterprise browser automation tool that lets IT teams define YAML-based "connectors" to extract structured data from internal web applications (Jira, Azure DevOps, Outlook, time-tracking systems, etc.) and surface it through a local CLI.
>
> This extension is the browser runtime for commandGarden. It receives commands from a local daemon process running on the same machine (localhost WebSocket on 127.0.0.1:9091), navigates to connector-declared pages, extracts the requested data, and returns it to the CLI. It does not communicate with any external server.
>
> Key security properties:
> - Every connector declares the exact domains it may access. A built-in domain guard blocks navigation and network requests to any domain not declared by the active connector.
> - High-risk operations (script injection, cookie access, network interception) require explicit per-connector approval from the user before execution.
> - The extension only acts when commanded by the local daemon — it has no autonomous behavior beyond maintaining the localhost WebSocket connection.
> - All connector runs are logged in the popup with pass/fail status for auditability.
>
> This extension is intended for enterprise IT deployment and is not useful without the commandGarden CLI installed on the same machine.

**Category:** Developer Tools

**Language:** English

---

## Privacy practices form content

Paste-ready answers for the CWS Developer Dashboard privacy practices section.

### Single purpose description

> This extension executes data-extraction commands against enterprise web applications on behalf of the commandGarden CLI. It receives instructions from a localhost-only daemon, navigates to connector-declared pages, extracts structured data, and returns it to the local CLI. It has no other purpose.

### Permission justifications

Paste each justification into the corresponding field in the "Privacy practices" tab.

**Host permissions — `<all_urls>`:**

> commandGarden connectors are YAML definitions that target enterprise-internal web applications. Different organizations use different internal tools (Jira, Azure DevOps, Outlook, SharePoint, custom portals), so the set of target domains cannot be known at publish time. However, the extension enforces strict runtime domain restrictions: each connector declares its allowed domains, and a domain guard (domain-guard.ts) blocks all navigation and network requests to any domain not listed in the active connector's definition. The extension never accesses any URL autonomously — it only navigates to URLs specified by the locally-running connector when triggered by the user through the CLI.

**`debugger`:**

> The Chrome DevTools Protocol (debugger API) is used to intercept network responses on specific enterprise web applications that use Service Workers to mediate their API traffic. Standard content-script fetch interception cannot observe requests handled by Service Workers, so the debugger API's Network.enable and Fetch.enable are required to capture API response bodies (e.g., GraphQL responses from Azure DevOps, Microsoft Graph getSchedule responses). The debugger is only attached to a single tab during an active connector run, only when the connector definition explicitly opts into CDP mode (cdp: true), and is immediately detached when the run completes. Users see Chrome's standard "this extension is debugging this browser" banner while the debugger is attached.

**`cookies`:**

> Cookie access is used to read authentication tokens from enterprise SSO-protected web applications during a connector run. Many enterprise internal tools (Jira, Azure DevOps, etc.) use cookie-based authentication, and connectors need to include these cookies when making same-origin API requests to extract data. The extension only reads cookies for the specific domain declared by the active connector — it does not read, modify, or exfiltrate cookies from any other domain. Cookie values are used transiently within the connector pipeline and are not stored or transmitted outside the local machine.

**`scripting`:**

> The scripting API is used for two purposes: (1) injecting a content script into the active connector's target page to perform DOM-based data extraction (reading table rows, list items, or other structured content defined in the connector's YAML pipeline), and (2) executing connector-defined JavaScript evaluation code in the page context when DOM-only extraction is insufficient (e.g., processing client-side-rendered data). Scripts are only injected into the single tab opened by the active connector run, and only target domains declared in the connector definition. The user must explicitly approve connectors that use JavaScript evaluation before they can run.

**`tabs`:**

> The tabs API is used to create, navigate, and monitor the loading state of a single browser tab during a connector run. The extension creates a new tab, navigates it to the connector's declared URL, polls tab.status to detect when the page has finished loading, and closes the tab when the run completes. It does not enumerate or monitor the user's other open tabs.

**`declarativeNetRequest`:**

> The declarativeNetRequest API provides a network-level security sandbox for connector runs that execute JavaScript in the page context (js_evaluate steps). When such a step runs, the extension installs session-scoped rules that allow network requests only to the connector's declared domains and block all other outbound requests from that tab. This prevents injected code from exfiltrating data to undeclared domains. The rules are scoped to the single active tab and are removed immediately after the step completes.

**`alarms`:**

> A single periodic alarm ("keepalive", every 24 seconds) is used to maintain the WebSocket connection to the localhost daemon process. Chrome's Manifest V3 service worker can be suspended by the browser at any time; the alarm wakes it to check and reconnect the local WebSocket if needed. No alarms are used for any user-facing scheduling or data collection.

**`idle`:**

> The idle API listens for the user returning from idle state. When Chrome signals the user is active again, the extension checks whether the localhost WebSocket connection was lost during the idle period and reconnects it if needed. This avoids the extension appearing disconnected when the user returns to the browser. No data is collected based on idle state.

**`storage`:**

> The storage API (chrome.storage.local) persists a single boolean — whether the user has toggled the extension on or off via the popup. This preference survives browser restarts so the extension does not reconnect if the user explicitly disabled it. No browsing data, connector data, or personal information is stored.

### Remote code

The CWS form asks: *"Are you using remote code? Remote code is any JS or Wasm that is not included in the extension's package. This includes references to external files in `<script>` tags, modules pointing to external files and strings evaluated through `eval()`."*

Answer: **Yes.**

The extension evaluates code strings received from the locally-running daemon via two mechanisms:

1. `new AsyncFunction(codeStr)()` — used by `evaluateInPage()` in `chrome-adapter.ts` to run connector-defined JavaScript in the page context.
2. `chrome.debugger.sendCommand(debuggee, 'Runtime.evaluate', { expression })` — used by `evaluateViaCdp()` as a fallback when the page's CSP blocks `AsyncFunction`.

Paste this justification:

> The extension evaluates JavaScript code strings received from a daemon process running on the same machine, connected via a localhost-only WebSocket (ws://127.0.0.1:9091). The code originates from "connector" definition files (.eval.js) that are installed on the user's local filesystem as part of the commandGarden CLI package — they are not fetched from any remote server.
>
> The extension uses two evaluation mechanisms depending on the target page's Content Security Policy: (1) the AsyncFunction constructor for pages that allow eval, and (2) the Chrome DevTools Protocol Runtime.evaluate command (via the debugger API) for pages with strict CSP that blocks AsyncFunction.
>
> This evaluation is gated by the extension's capability and approval system: connectors that use JavaScript evaluation must declare the js_evaluate capability, and the user must explicitly approve each such connector before it can run. Additionally, when evaluated code runs, the extension installs declarativeNetRequest session rules that restrict all network requests from the tab to only the connector's declared domains, preventing any data exfiltration.
>
> No code is fetched from the internet. No `<script>` tags reference external files. No external modules are loaded.

Note: `popup.html` loads Google Fonts CSS (not JS) from `fonts.googleapis.com`. This is a stylesheet, not remote code per the CWS definition, but if a reviewer flags it, self-host the font files inside the extension package.

---

### Data usage disclosures

For the "Data usage" section, select these options:

- **Does not collect or use any personal data.** The extension processes enterprise web application data transiently during connector runs but does not collect, store, or transmit any personal data. All extracted data stays on the local machine.
- **Does not sell data to third parties.**
- **Does not use or transfer data for purposes unrelated to the item's core functionality.**
- **Does not use or transfer data to determine creditworthiness or for lending purposes.**

---

## Review tips

Expect the first submission to be rejected with a request for more detail — this is normal for extensions requesting `debugger` + `<all_urls>`. When responding to a rejection:

- Provide a screencast showing a connector run end-to-end (CLI command, extension opening a tab, data extraction, tab closing).
- Link to the connector YAML format documentation to demonstrate that the extension only follows declarative instructions.
- Emphasize the localhost-only architecture — the extension never contacts any external server.
- Highlight the domain-guard and declarativeNetRequest sandboxing as defense-in-depth measures.

---

## Review timeline

- First review: typically 1–5 business days, longer for sensitive permissions
- Rejection + resubmission cycles are common; budget 2–4 weeks for initial approval
- Subsequent version updates: usually 1–2 days

---

## Enterprise force-install

Once the extension is listed (Public or Unlisted), IT can push it to managed Chrome browsers via policy. The extension ID is assigned by CWS upon first upload.

```json
{
  "ExtensionSettings": {
    "<extension-id>": {
      "installation_mode": "force_installed",
      "update_url": "https://clients2.google.com/service/update2/crx"
    }
  }
}
```

This works with Chrome Browser Cloud Management, Windows GPO, or macOS managed preferences.

---

## Version updates

1. Bump `version` in `src/chrome/manifest.json`
2. Rebuild and re-zip (same steps as initial build)
3. Upload the new zip in the Developer Dashboard under the existing listing
4. Submit for review

Adding new permissions in an update triggers a re-review and disables the extension for existing users until they accept the new permissions.

---

## If `debugger` blocks approval

The `debugger` permission is the most likely review blocker. Fallback options:

- **Make it optional** — Move `debugger` to `optional_permissions` in the manifest and request it at runtime only when a connector needs it. Reduces review friction at the cost of a runtime permission prompt.
- **Self-host outside CWS** — Use Chrome Enterprise to distribute a self-hosted `.crx` file. Bypasses CWS review entirely but only works on IT-managed devices.
