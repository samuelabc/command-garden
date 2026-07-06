# ADR 0002: Split pipeline execution between extension and daemon

## Status

Proposed

## Context

All pipeline steps currently execute inside the Chrome extension. The extension sends the final result back to the daemon, which forwards it to the CLI. This means every step — including data transformations — must run in the browser tab's content script or page context.

To eliminate `js_evaluate` from DOM-only connectors, we need new declarative steps. One of these — `transform` (e.g. HTML→Markdown conversion) — is pure data processing with no browser dependency. Running it in the extension would mean bundling a Markdown conversion library into the content script (bloating it and increasing attack surface) or using `js_evaluate` in MAIN world (defeating the purpose).

Three approaches were considered:

1. **All steps in the extension** — keep current architecture. Bundle `turndown` into the content script or run conversion in MAIN world. Simpler architecture but defeats the security goal.
2. **Pre-split the pipeline** — daemon divides the pipeline into an extension segment (DOM access) and a daemon segment (transforms). Extension runs its segment, returns intermediate data, daemon runs the rest. Sequential, no interleaving.
3. **Step-by-step orchestration** — daemon sends steps one at a time, routing each to extension or local execution. Supports interleaving extension and daemon steps. More flexible but more complex.

## Decision

Option 2: pre-split the pipeline at the boundary between extension and daemon steps. The split is static (determined at pipeline load time): all extension steps come first, all daemon steps come after. No interleaving.

## Consequences

- Data transformations run in Node.js where proper libraries are available and code is auditable
- Content scripts stay small — only DOM access functions, no heavy dependencies
- Extension API is unchanged — it still receives a pipeline and returns a result. It just receives fewer steps
- The `transform` step type cannot appear before any extension-side step (no interleaving). If this becomes limiting, we can upgrade to step-by-step orchestration later
- New `DaemonRunner` class in the daemon mirrors the extension's `PipelineRunner` for server-side steps
- `turndown` becomes a daemon dependency (well-maintained, 0 transitive deps)
