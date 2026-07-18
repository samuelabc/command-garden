import { describe, it, expect } from 'vitest';
import { connectorSchema, type ConnectorDef } from './connector';

const VALID_CONNECTOR: ConnectorDef = {
  site: 'timetracking',
  name: 'report',
  version: '1.0',
  description: 'Fetch monthly time tracking report',
  access: 'read',
  domains: ['timetracking.example.com'],
  capabilities: ['navigate', 'dom_read'],
  args: [
    { name: 'month', type: 'string', required: false, help: 'Month in YYYY-MM format', pattern: '^\\d{4}-\\d{2}$' },
  ],
  columns: [
    { name: 'date', type: 'string' },
    { name: 'hours', type: 'number' },
  ],
  pipeline: [
    { step: 'navigate', url: 'https://timetracking.example.com/report' },
    { step: 'extract', selector: 'tr', fields: { date: 'td:nth-child(1)', hours: 'td:nth-child(2)' } },
  ],
};

describe('connectorSchema', () => {
  it('validates a complete valid connector', () => {
    const result = connectorSchema.safeParse(VALID_CONNECTOR);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.site).toBe('timetracking');
      expect(result.data.name).toBe('report');
    }
  });

  it('applies defaults for optional fields', () => {
    const minimal = {
      site: 'test', name: 'cmd', version: '1.0',
      domains: ['example.com'], capabilities: ['navigate'],
      pipeline: [{ step: 'navigate', url: 'https://example.com' }],
    };
    const result = connectorSchema.safeParse(minimal);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.access).toBe('read');
      expect(result.data.args).toEqual([]);
      expect(result.data.columns).toEqual([]);
    }
  });

  it('rejects missing site', () => {
    const { site, ...rest } = VALID_CONNECTOR;
    expect(connectorSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects empty domains array', () => {
    const bad = { ...VALID_CONNECTOR, domains: [] };
    expect(connectorSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects empty capabilities array', () => {
    const bad = { ...VALID_CONNECTOR, capabilities: [] };
    expect(connectorSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects invalid capability value', () => {
    const bad = { ...VALID_CONNECTOR, capabilities: ['fly'] };
    expect(connectorSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects invalid access value', () => {
    const bad = { ...VALID_CONNECTOR, access: 'delete' };
    expect(connectorSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects empty pipeline', () => {
    const bad = { ...VALID_CONNECTOR, pipeline: [] };
    expect(connectorSchema.safeParse(bad).success).toBe(false);
  });

  it('validates arg schema with pattern', () => {
    const result = connectorSchema.safeParse(VALID_CONNECTOR);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.args![0].pattern).toBe('^\\d{4}-\\d{2}$');
    }
  });

  it('rejects invalid arg type', () => {
    const bad = {
      ...VALID_CONNECTOR,
      args: [{ name: 'x', type: 'date', required: false }],
    };
    expect(connectorSchema.safeParse(bad).success).toBe(false);
  });
});
