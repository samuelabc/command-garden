# ADR 0001: Daemon-level fan-out for multi-region connectors

## Status

Accepted

## Context

TokenMaster has three regional deployments (EMEA, AMAP, CN) with identical APIs on different domains. Users frequently need aggregated data across all regions. We needed a way to run one connector against multiple regions and merge results.

Three approaches were considered:

1. **Pipeline-level `foreach` step** — a new control-flow primitive in the YAML pipeline that iterates over values. Powerful but adds complexity to the declarative pipeline model.
2. **`js_evaluate` loop** — use JavaScript to iterate. Avoids new primitives but requires the high-risk `js_evaluate` capability.
3. **Daemon-level fan-out** — the connector YAML stays single-region. The daemon detects `--region all` on an enum arg, runs the pipeline once per enum value sequentially, and merges rows.

## Decision

Option 3: daemon-level fan-out. The connector declares an `enum` on its arg and a `vars` lookup table for the domain mapping. When any enum arg has the value `"all"`, the daemon runs the connector once per enum value and concatenates the results, injecting the arg name as an extra column.

## Consequences

- Connectors stay purely declarative — no loops, no control flow
- Fan-out generalizes to any connector with enum args, not just TokenMaster
- Sequential execution means 3× latency (~3-9s for three regions)
- `"all"` is a reserved keyword for enum args — cannot be used as a literal enum value
- The extension processes one pipeline at a time (no concurrent tab management needed)
