# commandGarden Sample Connector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create sample YAML connectors that validate, load, and execute through the full commandGarden pipeline — proving the end-to-end system works from YAML definition through pipeline execution.

**Architecture:** Two connectors: a demo DOM-scraping connector (exercises navigate → wait → extract → map → filter) and the real timetracking/report connector (exercises navigate → fetch with token). Both pass schema + semantic validation. Integration tests verify YAML → load → validate → pipeline-run with mocked Chrome adapter.

**Tech Stack:** YAML connectors, Vitest 2.x, existing `@commandgarden/shared` + `@commandgarden/chrome` test infrastructure

**Branch:** `feat/commandgarden-connectors` (branch from `feat/commandgarden-cli`)

**Depends on:** Plans 1-4 (shared 97 tests, daemon 50 tests, chrome 52 tests, CLI 60 tests)

---

## File Map

```
commandGarden/
  connectors/
    demo-extract-table.yaml        # CREATE: DOM extraction sample connector
    timetracking-report.yaml       # CREATE: real-world API connector
  shared/src/
    connector-samples.test.ts      # CREATE: load + validate sample YAML files
  chrome/src/pipeline/
    connector-e2e.test.ts          # CREATE: full pipeline execution with real connector defs
```

---

### Task 1: Create connectors directory and demo connector YAML

**Files:**
- Create: `commandGarden/connectors/demo-extract-table.yaml`

- [ ] **Step 1: Create the demo connector YAML**

This connector scrapes rows from an HTML table page. It demonstrates: navigate, wait, extract, map, filter.

```yaml
site: demo
name: extract-table
version: "1.0"
description: "Extract rows from an HTML table — sample connector for testing"
access: read

domains:
  - "demo.example.com"
capabilities:
  - navigate
  - dom_read

args:
  - name: minScore
    type: number
    required: false
    default: 0
    help: "Minimum score to include in results"

columns:
  - name: name
    type: string
  - name: email
    type: string
  - name: score
    type: number
  - name: status
    type: string

pipeline:
  - step: navigate
    url: "https://demo.example.com/users"
  - step: wait
    selector: "#data-table tbody"
    timeout: 5000
  - step: extract
    selector: "#data-table tbody tr"
    fields:
      name: "td:nth-child(1)"
      email: "td:nth-child(2)"
      rawScore: "td:nth-child(3)"
      status: "td:nth-child(4)"
  - step: map
    fields:
      name: "${{ row.name | trim }}"
      email: "${{ row.email | trim | lower }}"
      score: "${{ row.rawScore | number }}"
      status: "${{ row.status | trim | upper }}"
  - step: filter
    field: score
    operator: gte
    value: "${{ args.minScore }}"
```

- [ ] **Step 2: Verify YAML is valid**

No automated step yet — verification happens in Task 3.

---

### Task 2: Create timetracking connector YAML

**Files:**
- Create: `commandGarden/connectors/timetracking-report.yaml`

- [ ] **Step 1: Create the timetracking connector YAML**

This connector fetches the MBTI time tracking monthly report via the ReportFAK API. It navigates to the app page (to establish the authenticated session), then uses the `fetch` step to call the API from the page context (which sends session cookies via `credentials: 'include'`).

> **Note:** The real MSAL app stores the access token in sessionStorage (not cookies) and requires it as a Bearer header. A `js_evaluate` pipeline step would be needed for full parity with the OpenCLI adapter. This connector demonstrates the YAML format and validates against the schema; pipeline execution is tested with mocked adapter responses.

```yaml
site: timetracking
name: report
version: "1.0"
description: "MBTI Time Tracking monthly report — one row per booking line"
access: read

domains:
  - "timetracking.mercedes-benz-techinnovation.com"
  - "mbti-bam-wzde-prd-ejdchtb0g9afexhr.a01.azurefd.net"
capabilities:
  - navigate
  - cookie_read

args:
  - name: month
    type: string
    required: false
    help: "Month in YYYY-MM format (default: current month)"
    pattern: "^\\d{4}-\\d{2}$"

columns:
  - name: month
    type: string
  - name: date
    type: string
  - name: projectId
    type: string
  - name: category
    type: string
  - name: activity
    type: string
  - name: hours
    type: number
  - name: status
    type: string
  - name: journalId
    type: string
  - name: lineNumber
    type: number

pipeline:
  - step: navigate
    url: "https://timetracking.mercedes-benz-techinnovation.com/"
  - step: wait
    selector: "body"
    timeout: 10000
  - step: fetch
    url: "https://mbti-bam-wzde-prd-ejdchtb0g9afexhr.a01.azurefd.net/api/ReportFAK?date=${{ args.month | default(\"2026-06\") }}-01"
    method: GET
    headers:
      Accept: "application/json"
    as: reportData
```

---

### Task 3: Integration tests — load and validate sample connectors

**Files:**
- Create: `commandGarden/shared/src/connector-samples.test.ts`

These tests read the actual YAML files from `connectors/` and validate them through the schema parser and semantic validator.

- [ ] **Step 1: Write tests**

```typescript
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseConnectorYaml, validateConnectorSemantics } from './loader';

const CONNECTORS_DIR = join(__dirname, '../../connectors');

function loadConnector(filename: string) {
  const yaml = readFileSync(join(CONNECTORS_DIR, filename), 'utf-8');
  return parseConnectorYaml(yaml);
}

describe('sample connectors — schema validation', () => {
  it('demo/extract-table passes schema validation', () => {
    const result = loadConnector('demo-extract-table.yaml');
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.data.site).toBe('demo');
    expect(result.data.name).toBe('extract-table');
    expect(result.data.pipeline).toHaveLength(5);
    expect(result.data.args).toHaveLength(1);
    expect(result.data.columns).toHaveLength(4);
  });

  it('timetracking/report passes schema validation', () => {
    const result = loadConnector('timetracking-report.yaml');
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.data.site).toBe('timetracking');
    expect(result.data.name).toBe('report');
    expect(result.data.pipeline).toHaveLength(3);
    expect(result.data.args).toHaveLength(1);
    expect(result.data.columns).toHaveLength(9);
  });
});

describe('sample connectors — semantic validation', () => {
  it('demo/extract-table passes semantic validation', () => {
    const result = loadConnector('demo-extract-table.yaml');
    if (!result.ok) throw new Error(result.error.message);
    const errors = validateConnectorSemantics(result.data);
    expect(errors).toEqual([]);
  });

  it('timetracking/report passes semantic validation', () => {
    const result = loadConnector('timetracking-report.yaml');
    if (!result.ok) throw new Error(result.error.message);
    const errors = validateConnectorSemantics(result.data);
    expect(errors).toEqual([]);
  });
});

describe('sample connectors — field correctness', () => {
  it('demo/extract-table declares required capabilities for all steps', () => {
    const result = loadConnector('demo-extract-table.yaml');
    if (!result.ok) throw new Error(result.error.message);
    const caps = new Set(result.data.capabilities);
    expect(caps.has('navigate')).toBe(true);
    expect(caps.has('dom_read')).toBe(true);
  });

  it('demo/extract-table columns match map step output fields', () => {
    const result = loadConnector('demo-extract-table.yaml');
    if (!result.ok) throw new Error(result.error.message);
    const mapStep = result.data.pipeline.find(s => s.step === 'map');
    expect(mapStep).toBeDefined();
    if (mapStep?.step === 'map') {
      const mapFields = Object.keys(mapStep.fields);
      const columnNames = result.data.columns!.map(c => c.name);
      expect(mapFields.sort()).toEqual(columnNames.sort());
    }
  });

  it('timetracking/report domains include both app and API origins', () => {
    const result = loadConnector('timetracking-report.yaml');
    if (!result.ok) throw new Error(result.error.message);
    expect(result.data.domains).toContain('timetracking.mercedes-benz-techinnovation.com');
    expect(result.data.domains).toContain('mbti-bam-wzde-prd-ejdchtb0g9afexhr.a01.azurefd.net');
  });

  it('timetracking/report month arg has pattern validation', () => {
    const result = loadConnector('timetracking-report.yaml');
    if (!result.ok) throw new Error(result.error.message);
    const monthArg = result.data.args!.find(a => a.name === 'month');
    expect(monthArg).toBeDefined();
    expect(monthArg!.pattern).toBe('^\\d{4}-\\d{2}$');
  });
});
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `npx vitest run src/connector-samples.test.ts` (from `commandGarden/shared`)
Expected: All 7 tests pass.

- [ ] **Step 3: Commit**

```bash
git add connectors/ shared/src/connector-samples.test.ts
git commit -m "feat(connectors): add sample connector YAMLs with validation tests"
```

---

### Task 4: Pipeline end-to-end tests with real connector definitions

**Files:**
- Create: `commandGarden/chrome/src/pipeline/connector-e2e.test.ts`

These tests load real connector YAML, then execute the pipeline with a mocked `ChromeAdapter` to verify the full flow: args → interpolation → step execution → data collection → map → filter.

- [ ] **Step 1: Write end-to-end pipeline tests**

```typescript
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseConnectorYaml } from '@commandgarden/shared';
import { PipelineRunner, type ChromeAdapter } from './runner';

const CONNECTORS_DIR = join(__dirname, '../../../connectors');

function loadConnectorDef(filename: string) {
  const yaml = readFileSync(join(CONNECTORS_DIR, filename), 'utf-8');
  const result = parseConnectorYaml(yaml);
  if (!result.ok) throw new Error(result.error.message);
  return result.data;
}

function mockAdapter(overrides?: Partial<ChromeAdapter>): ChromeAdapter {
  return {
    navigateTab: vi.fn().mockResolvedValue(1),
    waitForTabLoad: vi.fn().mockResolvedValue(undefined),
    executeInContent: vi.fn().mockResolvedValue(undefined),
    getCookies: vi.fn().mockResolvedValue({}),
    ...overrides,
  };
}

describe('demo/extract-table — full pipeline', () => {
  const MOCK_DOM_DATA = [
    { name: ' Alice ', email: ' ALICE@DEMO.COM ', rawScore: '85', status: ' active ' },
    { name: ' Bob ', email: ' BOB@DEMO.COM ', rawScore: '42', status: ' inactive ' },
    { name: ' Carol ', email: ' CAROL@DEMO.COM ', rawScore: '91', status: ' active ' },
  ];

  it('executes full pipeline and returns mapped + filtered data', async () => {
    const connector = loadConnectorDef('demo-extract-table.yaml');
    const executeInContent = vi.fn()
      .mockResolvedValueOnce(undefined) // wait step
      .mockResolvedValueOnce(MOCK_DOM_DATA); // extract step

    const adapter = mockAdapter({ executeInContent });
    const runner = new PipelineRunner(adapter);
    const result = await runner.run(connector, { minScore: 50 });

    expect(result.ok).toBe(true);
    // After map: score becomes number, name trimmed, email lowered, status uppered
    // After filter: score >= 50 → Alice (85) and Carol (91), Bob (42) excluded
    expect(result.data).toHaveLength(2);
    expect(result.data[0]).toEqual({
      name: 'Alice',
      email: 'alice@demo.com',
      score: '85',
      status: 'ACTIVE',
    });
    expect(result.data[1]).toEqual({
      name: 'Carol',
      email: 'carol@demo.com',
      score: '91',
      status: 'ACTIVE',
    });
  });

  it('returns all rows when minScore is 0', async () => {
    const connector = loadConnectorDef('demo-extract-table.yaml');
    const executeInContent = vi.fn()
      .mockResolvedValueOnce(undefined) // wait
      .mockResolvedValueOnce(MOCK_DOM_DATA); // extract

    const adapter = mockAdapter({ executeInContent });
    const runner = new PipelineRunner(adapter);
    const result = await runner.run(connector, { minScore: 0 });

    expect(result.ok).toBe(true);
    expect(result.data).toHaveLength(3);
  });

  it('navigates to the correct URL', async () => {
    const connector = loadConnectorDef('demo-extract-table.yaml');
    const adapter = mockAdapter({
      executeInContent: vi.fn()
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce([]),
    });
    const runner = new PipelineRunner(adapter);
    await runner.run(connector, { minScore: 0 });

    expect(adapter.navigateTab).toHaveBeenCalledWith('https://demo.example.com/users');
  });

  it('returns empty data when no rows match filter', async () => {
    const connector = loadConnectorDef('demo-extract-table.yaml');
    const executeInContent = vi.fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(MOCK_DOM_DATA);

    const adapter = mockAdapter({ executeInContent });
    const runner = new PipelineRunner(adapter);
    const result = await runner.run(connector, { minScore: 100 });

    expect(result.ok).toBe(true);
    expect(result.data).toHaveLength(0);
  });
});

describe('timetracking/report — pipeline execution', () => {
  it('navigates to timetracking page and calls fetch step', async () => {
    const connector = loadConnectorDef('timetracking-report.yaml');
    const mockReportData = [
      { date: '2026-06-02', calendarHeader: { status: 'RELEASED' }, calendarLines: [
        { mserp_projectid: 'P001', mserp_category: 'Dev', mserp_activitynumber: 'A001',
          mserp_hours: 8, mserp_journalid: 'J001', mserp_linenumber: 1 },
      ]},
    ];

    const executeInContent = vi.fn()
      .mockResolvedValueOnce(undefined) // wait step
      .mockResolvedValueOnce(mockReportData); // fetch step

    const adapter = mockAdapter({ executeInContent });
    const runner = new PipelineRunner(adapter);
    const result = await runner.run(connector, { month: '2026-06' });

    expect(result.ok).toBe(true);
    expect(adapter.navigateTab).toHaveBeenCalledWith(
      'https://timetracking.mercedes-benz-techinnovation.com/'
    );
  });

  it('interpolates month arg into fetch URL', async () => {
    const connector = loadConnectorDef('timetracking-report.yaml');
    const executeInContent = vi.fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce([]);

    const adapter = mockAdapter({ executeInContent });
    const runner = new PipelineRunner(adapter);
    await runner.run(connector, { month: '2026-07' });

    // The fetch step should have been called with interpolated URL
    const fetchCall = executeInContent.mock.calls[1];
    expect(fetchCall).toBeDefined();
    const fetchStep = fetchCall[1];
    expect(fetchStep.url).toContain('2026-07-01');
  });
});

describe('ConnectorRegistry loads sample connectors', () => {
  // Imported inline to avoid circular dependency issues
  it('loads connectors from the connectors directory', async () => {
    const { ConnectorRegistry } = await import('../../../daemon/src/registry');
    const registry = new ConnectorRegistry([CONNECTORS_DIR]);
    const { loaded, errors } = registry.load();

    expect(errors).toEqual([]);
    expect(loaded).toBe(2);
    expect(registry.get('demo/extract-table')).toBeDefined();
    expect(registry.get('timetracking/report')).toBeDefined();
  });

  it('lists all connectors', async () => {
    const { ConnectorRegistry } = await import('../../../daemon/src/registry');
    const registry = new ConnectorRegistry([CONNECTORS_DIR]);
    registry.load();

    const keys = registry.keys();
    expect(keys).toContain('demo/extract-table');
    expect(keys).toContain('timetracking/report');
  });
});
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `npx vitest run src/pipeline/connector-e2e.test.ts` (from `commandGarden/chrome`)
Expected: All 8 tests pass.

- [ ] **Step 3: Commit**

```bash
git add chrome/src/pipeline/connector-e2e.test.ts
git commit -m "test(connectors): add end-to-end pipeline tests for sample connectors"
```

---

### Task 5: Run full test suite and verify

- [ ] **Step 1: Run all tests across all workspaces**

Run: `npm test` (from `commandGarden/`)
Expected: All tests pass — shared (~97 + 7 new), daemon (~50), chrome (~52 + 8 new), CLI (~60).

- [ ] **Step 2: Final commit if any adjustments needed**

---

## Summary

| What | Count |
|------|-------|
| YAML connectors | 2 (demo + timetracking) |
| New test files | 2 |
| New tests | ~15 |
| Existing tests affected | 0 |

**Known limitation:** The timetracking connector can't fully replicate the OpenCLI adapter's behavior because it reads the MSAL access token from `sessionStorage`, which requires a `js_evaluate` pipeline step not yet implemented. The connector validates and executes with mocked responses; full runtime parity is a future enhancement.
