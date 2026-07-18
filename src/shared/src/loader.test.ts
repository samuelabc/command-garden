import { describe, it, expect } from 'vitest';
import { parseConnectorYaml, validateConnectorSemantics, type LoadError } from './loader';

const VALID_YAML = `
site: timetracking
name: report
version: "1.0"
domains:
  - "timetracking.example.com"
capabilities:
  - navigate
  - dom_read
pipeline:
  - step: navigate
    url: "https://timetracking.example.com/report"
  - step: extract
    selector: "tr"
    fields:
      date: "td:nth-child(1)"
`;

const MISSING_CAPABILITY_YAML = `
site: test
name: cmd
version: "1.0"
domains:
  - "example.com"
capabilities:
  - navigate
pipeline:
  - step: navigate
    url: "https://example.com"
  - step: extract
    selector: "tr"
    fields:
      name: "td"
`;

const UNDECLARED_DOMAIN_YAML = `
site: test
name: cmd
version: "1.0"
domains:
  - "example.com"
capabilities:
  - navigate
pipeline:
  - step: navigate
    url: "https://other.com/page"
`;

describe('parseConnectorYaml', () => {
  it('parses valid YAML into ConnectorDef', () => {
    const result = parseConnectorYaml(VALID_YAML);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.site).toBe('timetracking');
      expect(result.data.name).toBe('report');
      expect(result.data.pipeline).toHaveLength(2);
    }
  });

  it('returns error for invalid YAML syntax', () => {
    const result = parseConnectorYaml('{ bad yaml: [');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('YAML_PARSE_ERROR');
    }
  });

  it('returns error for schema validation failure', () => {
    const result = parseConnectorYaml('site: test\nname: cmd\nversion: "1.0"');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('SCHEMA_VALIDATION_ERROR');
    }
  });
});

describe('validateConnectorSemantics', () => {
  it('returns empty errors for valid connector', () => {
    const result = parseConnectorYaml(VALID_YAML);
    if (!result.ok) throw new Error('Parse failed');
    const errors = validateConnectorSemantics(result.data);
    expect(errors).toEqual([]);
  });

  it('detects missing capability for extract step', () => {
    const result = parseConnectorYaml(MISSING_CAPABILITY_YAML);
    if (!result.ok) throw new Error('Parse failed');
    const errors = validateConnectorSemantics(result.data);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('dom_read');
    expect(errors[0]).toContain('extract');
  });

  it('detects undeclared domain in navigate URL', () => {
    const result = parseConnectorYaml(UNDECLARED_DOMAIN_YAML);
    if (!result.ok) throw new Error('Parse failed');
    const errors = validateConnectorSemantics(result.data);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('other.com');
  });

  it('detects vars map domain not in declared domains', () => {
    const yaml = `
site: test
name: cmd
version: "1.0"
vars:
  domains:
    a: a.example.com
    b: b.example.com
    c: c.undeclared.com
domains:
  - "a.example.com"
  - "b.example.com"
capabilities:
  - navigate
pipeline:
  - step: navigate
    url: "https://a.example.com"
`;
    const result = parseConnectorYaml(yaml);
    if (!result.ok) throw new Error('Parse failed');
    const errors = validateConnectorSemantics(result.data);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('vars.domains.c');
    expect(errors[0]).toContain('c.undeclared.com');
  });

  it('passes when all vars map domains are declared', () => {
    const yaml = `
site: test
name: cmd
version: "1.0"
vars:
  domains:
    a: a.example.com
    b: b.example.com
domains:
  - "a.example.com"
  - "b.example.com"
capabilities:
  - navigate
pipeline:
  - step: navigate
    url: "https://a.example.com"
`;
    const result = parseConnectorYaml(yaml);
    if (!result.ok) throw new Error('Parse failed');
    const errors = validateConnectorSemantics(result.data);
    expect(errors).toEqual([]);
  });
});
