# Plan: Remove redundant manual type declarations

## Context

The `chrome/tsconfig.json` now includes `"lib": ["ES2022", "WebWorker"]`, which
provides ambient types for `setTimeout`, `clearTimeout`, `setInterval`,
`clearInterval`, `fetch`, and `atob`. Three files have manual `declare function`
lines that are now redundant and should be removed.

## Steps

### 1. Remove 5 manual declares from `ws-client.ts`

Delete lines 2–6 (`declare function setTimeout/clearTimeout/setInterval/clearInterval/fetch`).

### 2. Remove 2 manual declares from `service-worker.ts`

Delete lines 2–3 (`declare function setTimeout/clearTimeout`).

### 3. Remove `atob` declaration + comment from `chrome-adapter.ts`

Delete lines 6–7 (`// atob is available…` comment and `declare function atob`).

### 4. Verify chrome package compiles

Run `npx tsc --noEmit -p chrome/tsconfig.json` and fix any errors.

### 5. Verify app package compiles

Run `npx tsc --noEmit -p app/tsconfig.json` (project-references changes are
already in the working tree — confirm they still build).

## Decisions

- **Popup tsconfig:** Keep `/// <reference lib="dom" />` in `popup.ts`. Only one
  file needs DOM today; a separate tsconfig is over-engineering at this scale.
- **Scope:** Include `service-worker.ts` for consistency — same root cause.
