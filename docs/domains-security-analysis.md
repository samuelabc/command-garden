# Domain Allowlist Security Analysis

Analysis of the `domains` field in the connector pipeline: what it enforces, what it does not, and where runtime hardening is needed.

---

## What `domains` is

Every connector YAML declares a required `domains` array — a flat list of exact hostnames the connector intends to contact:

```yaml
domains:
  - "blog.trailofbits.com"
```

The schema enforces non-empty (`z.array(z.string()).min(1)` in `src/shared/src/connector.ts`). No wildcards, no URLs — just bare hostnames.

Multi-domain connectors list every host they touch, including CDN/API origins:

```yaml
domains:
  - "timetracking.mercedes-benz-techinnovation.com"
  - "mbti-bam-wzde-prd-ejdchtb0g9afexhr.a01.azurefd.net"
```

Regional domain lookups via `vars` must also be declared:

```yaml
vars:
  domains:
    emea: tma.query.api.dvb.corpinter.net
    amap: tma.query.api.am.dvb.corpinter.net

domains:
  - "tma.query.api.dvb.corpinter.net"
  - "tma.query.api.am.dvb.corpinter.net"
```

---

## Load-time validation

`validateConnectorSemantics()` in `src/shared/src/loader.ts` cross-checks every pipeline step against declared domains:

| Check | Rule |
|---|---|
| `navigate` step | `new URL(step.url).hostname` must be in `domains` |
| `fetch` step | Same hostname-in-domains check |
| `cookie` step | `step.domain` must be in `domains` |
| `vars` string maps | Every string value must be in `domains` |
| Template URLs (`${{ }}`) | **Skipped** — hostname can't be resolved statically |
| `js_evaluate` | **Not checked** |

Connectors that fail validation are rejected at three gates:

| Gate | Location |
|---|---|
| Daemon startup | `src/daemon/src/registry.ts` — connector not loaded |
| `cg validate` CLI | `src/cli/src/commands/validate.ts` — reports errors |
| CI tests | `src/shared/src/connector-samples.test.ts` — fails build |

Subdomain matching is **exact** — declaring `example.com` does not cover `api.example.com`.

---

## Audit trail

The daemon logs declared domains on every execution event (`src/daemon/src/server.ts`):

```typescript
deps.auditStore.insert(createAuditEvent({
  type: 'command.start',
  connector: body.connector,
  domains: connector.domains,       // YAML declaration, not runtime
  capabilities: [...connector.capabilities],
  correlationId,
  connectorHash,
}));
```

This records **what the connector says it will contact**, not which hosts were actually reached at runtime.

---

## Security guarantees

| Guarantee | Strength | Mechanism |
|---|---|---|
| Author-time contract | **Strong** | Static URLs in `navigate`/`fetch`/`cookie`/`vars` must match `domains` or the connector won't load |
| Transparency | **Strong** | `cg list`, `/api/connectors`, and GUI surface declared domains to users and reviewers |
| Audit attribution | **Medium** | Declared domains logged per execution, enabling post-hoc review |
| Runtime network isolation | **Not implemented** | `domain-guard.ts` exists but is not wired into the execution path |
| `js_evaluate` egress control | **None** | MAIN-world code can `fetch()` to any origin |

---

## Runtime enforcement gap

### What the docs/UI claim

- Overview page: *"Connectors declare allowed domains. Undeclared domains are blocked by the daemon."*
- Architecture page: *"Extension refuses to run on undeclared domains."*

### What the code actually does

**Neither claim is implemented.** The pipeline runner executes steps without consulting `connector.domains`:

1. **`domain-guard.ts` is unwired.** `isUrlAllowed()` and `buildAllowlist()` in `src/chrome/src/domain-guard.ts` are only imported in tests. The pipeline runner (`src/chrome/src/pipeline/runner.ts`), service worker, and Chrome adapter never call them.

2. **Pipeline runner doesn't check.** `runner.ts` calls `adapter.navigateTab(url)` and `adapter.executeInContent(fetchStep)` directly with no domain guard.

3. **Chrome adapter navigates anywhere.** `chrome-adapter.ts` calls `chrome.tabs.update({ url })` with no allowlist, and the extension manifest declares `"host_permissions": ["<all_urls>"]`.

4. **Content script fetches unchecked.** `dom-executor.ts` calls `fetch(url)` with no domain validation.

5. **Daemon validator skips domains.** `src/daemon/src/validator.ts` only checks connector existence and high-risk capability approval — no domain enforcement.

---

## Known bypass paths

### 1. Template URLs

URLs containing `${{ }}` skip static domain validation at load time. After interpolation at runtime, no re-check occurs. A connector with `url: "https://${{ args.host }}/api"` can navigate to any host the caller provides.

### 2. `js_evaluate` egress

`js_evaluate` runs in the page's MAIN world. The code can call `fetch()` to arbitrary origins. The domain allowlist has no effect — as explicitly noted in `docs/plans/js-evaluate-security-analysis.md`:

> Domain allowlist in YAML: Only enforced for `navigate` and `fetch` steps, **not for `js_evaluate`** (the JS can `fetch()` anywhere)

### 3. User-installed connectors

Connectors in `~/.commandgarden/connectors/` can declare any domains. Load-time validation only checks internal consistency (are the step URLs within the declared domains?), not whether those domains are trustworthy.

### 4. Chrome `<all_urls>` permission

The extension manifest grants access to all URLs at the browser permission level. Domain scoping is not enforced via manifest or `declarativeNetRequest`.

---

## Planned hardening

From `docs/plans/js-evaluate-security-analysis.md`:

### Wire `domain-guard.ts` into the pipeline runner

The module already implements exact hostname matching. Integration points:

- **`runner.ts`**: Before `navigate`, `fetch`, and `cookie` steps, call `isUrlAllowed(resolvedUrl, allowlist)` and abort if it fails. This catches template URL bypasses after interpolation.
- **`chrome-adapter.ts`**: Validate the URL in `navigateTab()` before calling `chrome.tabs.update()`.

### Network egress control for `js_evaluate`

Use `chrome.declarativeNetRequest` to block `fetch()`/`XHR` from the tab to domains not in the connector's `domains` list during `js_evaluate` execution. This would close the MAIN-world egress gap.

### Audit actual hostnames

Record hostnames contacted at runtime (from `navigate`/`fetch` calls and intercepted network requests) in audit events alongside the declared `domains`.

---

*Analysis date: 2025-07-25*
*Codebase: commandGarden (monorepo)*
