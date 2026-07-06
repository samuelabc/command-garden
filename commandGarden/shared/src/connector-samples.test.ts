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
    expect(result.data.columns).toHaveLength(11);
  });

  it('tokenmaster/clients-list passes schema validation', () => {
    const result = loadConnector('tokenmaster-clients-list.yaml');
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.data.site).toBe('tokenmaster');
    expect(result.data.name).toBe('clients-list');
    expect(result.data.pipeline).toHaveLength(4);
    expect(result.data.args).toHaveLength(1);
    expect(result.data.columns).toHaveLength(4);
  });

  it('gcs/kb-pages passes schema validation', () => {
    const result = loadConnector('gcs-kb-pages.yaml');
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.data.site).toBe('gcs');
    expect(result.data.name).toBe('kb-pages');
    expect(result.data.pipeline).toHaveLength(3);
    expect(result.data.args).toHaveLength(0);
    expect(result.data.columns).toHaveLength(5);
  });

  it('gcs/kb-content passes schema validation', () => {
    const result = loadConnector('gcs-kb-content.yaml');
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.data.site).toBe('gcs');
    expect(result.data.name).toBe('kb-content');
    expect(result.data.pipeline).toHaveLength(3);
    expect(result.data.args).toHaveLength(1);
    expect(result.data.columns).toHaveLength(5);
  });
});

describe('sample connectors — semantic validation', () => {
  it('timetracking/report passes semantic validation', () => {
    const result = loadConnector('timetracking-report.yaml');
    if (!result.ok) throw new Error(result.error.message);
    const errors = validateConnectorSemantics(result.data);
    expect(errors).toEqual([]);
  });

  it('tokenmaster/clients-list passes semantic validation', () => {
    const result = loadConnector('tokenmaster-clients-list.yaml');
    if (!result.ok) throw new Error(result.error.message);
    const errors = validateConnectorSemantics(result.data);
    expect(errors).toEqual([]);
  });

  it('gcs/kb-pages passes semantic validation', () => {
    const result = loadConnector('gcs-kb-pages.yaml');
    if (!result.ok) throw new Error(result.error.message);
    const errors = validateConnectorSemantics(result.data);
    expect(errors).toEqual([]);
  });

  it('gcs/kb-content passes semantic validation', () => {
    const result = loadConnector('gcs-kb-content.yaml');
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

  it('tokenmaster/clients-list uses cookie_read capability and all region domains', () => {
    const result = loadConnector('tokenmaster-clients-list.yaml');
    if (!result.ok) throw new Error(result.error.message);
    expect(result.data.capabilities).toContain('cookie_read');
    expect(result.data.domains).toContain('tma.query.api.dvb.corpinter.net');
    expect(result.data.domains).toContain('tma.query.api.amap.corpinter.net');
    expect(result.data.domains).toContain('tma.query.api.cn.corpinter.net');
    expect(result.data.columns.map(c => c.name)).toEqual(['id', 'name', 'status', 'admins']);
  });

  it('tokenmaster/clients-list has region arg with enum and default', () => {
    const result = loadConnector('tokenmaster-clients-list.yaml');
    if (!result.ok) throw new Error(result.error.message);
    const regionArg = result.data.args!.find(a => a.name === 'region');
    expect(regionArg).toBeDefined();
    expect(regionArg!.enum).toEqual(['emea', 'amap', 'cn']);
    expect(regionArg!.default).toBe('all');
  });

  it('tokenmaster/clients-list has vars with domain lookup table', () => {
    const result = loadConnector('tokenmaster-clients-list.yaml');
    if (!result.ok) throw new Error(result.error.message);
    expect(result.data.vars).toBeDefined();
    const domains = (result.data.vars as Record<string, Record<string, string>>).domains;
    expect(domains.emea).toBe('tma.query.api.dvb.corpinter.net');
    expect(domains.amap).toBe('tma.query.api.amap.corpinter.net');
    expect(domains.cn).toBe('tma.query.api.cn.corpinter.net');
  });

  it('gcs/kb-pages has correct domain and columns for page index', () => {
    const result = loadConnector('gcs-kb-pages.yaml');
    if (!result.ok) throw new Error(result.error.message);
    expect(result.data.domains).toEqual(['pages.i.mercedes-benz.com']);
    expect(result.data.capabilities).toContain('js_evaluate');
    expect(result.data.columns.map(c => c.name)).toEqual(['title', 'url', 'section', 'path', 'depth']);
  });

  it('gcs/kb-content path arg has pattern constraint', () => {
    const result = loadConnector('gcs-kb-content.yaml');
    if (!result.ok) throw new Error(result.error.message);
    const pathArg = result.data.args!.find(a => a.name === 'path');
    expect(pathArg).toBeDefined();
    expect(pathArg!.required).toBe(true);
    expect(pathArg!.pattern).toBeDefined();
    // Pattern must reject paths without /gcs/KB/ prefix
    const re = new RegExp(pathArg!.pattern!);
    expect(re.test('/gcs/KB/docs/general-security/edr/')).toBe(true);
    expect(re.test('/evil/path')).toBe(false);
    expect(re.test("'; DROP TABLE --")).toBe(false);
  });

  it('gcs/kb-content has correct columns for page content', () => {
    const result = loadConnector('gcs-kb-content.yaml');
    if (!result.ok) throw new Error(result.error.message);
    expect(result.data.columns.map(c => c.name)).toEqual(['title', 'path', 'author', 'lastUpdated', 'content']);
  });
});
