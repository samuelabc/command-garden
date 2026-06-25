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
  it('timetracking/report passes semantic validation', () => {
    const result = loadConnector('timetracking-report.yaml');
    if (!result.ok) throw new Error(result.error.message);
    const errors = validateConnectorSemantics(result.data);
    expect(errors).toEqual([]);
  });
});

describe('sample connectors — field correctness', () => {
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
