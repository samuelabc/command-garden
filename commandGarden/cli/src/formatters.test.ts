// src/formatters.test.ts
import { describe, it, expect } from 'vitest';
import { formatTable, formatJson, formatCsv, format, escapeCsvField } from './formatters.js';

const DATA = [
  { date: '2026-06-01', project: 'Alpha', hours: 8 },
  { date: '2026-06-02', project: 'Beta', hours: 4 },
];
const COLUMNS = ['date', 'project', 'hours'];

describe('formatTable', () => {
  it('renders a table with headers', () => {
    const out = formatTable(DATA, COLUMNS);
    expect(out).toContain('date');
    expect(out).toContain('project');
    expect(out).toContain('hours');
    expect(out).toContain('Alpha');
    expect(out).toContain('Beta');
  });

  it('returns message for empty data', () => {
    const out = formatTable([], COLUMNS);
    expect(out).toContain('No data');
  });
});

describe('formatJson', () => {
  it('returns JSON envelope', () => {
    const out = formatJson(DATA, COLUMNS, 'test/cmd');
    const parsed = JSON.parse(out);
    expect(parsed.ok).toBe(true);
    expect(parsed.connector).toBe('test/cmd');
    expect(parsed.rowCount).toBe(2);
    expect(parsed.columns).toEqual(COLUMNS);
    expect(parsed.data).toEqual(DATA);
  });
});

describe('formatCsv', () => {
  it('renders CSV with header row', () => {
    const out = formatCsv(DATA, COLUMNS);
    const lines = out.trim().split('\n');
    expect(lines[0]).toBe('date,project,hours');
    expect(lines[1]).toBe('2026-06-01,Alpha,8');
    expect(lines[2]).toBe('2026-06-02,Beta,4');
  });

  it('escapes commas in values', () => {
    const data = [{ name: 'Doe, John', age: 30 }];
    const out = formatCsv(data, ['name', 'age']);
    expect(out).toContain('"Doe, John"');
  });

  it('returns just header for empty data', () => {
    const out = formatCsv([], COLUMNS);
    expect(out.trim()).toBe('date,project,hours');
  });
});

describe('escapeCsvField', () => {
  it('returns plain string unchanged', () => {
    expect(escapeCsvField('hello')).toBe('hello');
  });

  it('wraps and escapes commas', () => {
    expect(escapeCsvField('a,b')).toBe('"a,b"');
  });

  it('wraps and escapes quotes', () => {
    expect(escapeCsvField('say "hi"')).toBe('"say ""hi"""');
  });

  it('wraps newlines', () => {
    expect(escapeCsvField('line1\nline2')).toBe('"line1\nline2"');
  });

  it('handles null/undefined', () => {
    expect(escapeCsvField(null)).toBe('');
    expect(escapeCsvField(undefined)).toBe('');
  });
});

describe('format', () => {
  it('dispatches to table', () => {
    const out = format(DATA, COLUMNS, 'test/cmd', 'table');
    expect(out).toContain('Alpha');
  });

  it('dispatches to json', () => {
    const out = format(DATA, COLUMNS, 'test/cmd', 'json');
    expect(JSON.parse(out).ok).toBe(true);
  });

  it('dispatches to csv', () => {
    const out = format(DATA, COLUMNS, 'test/cmd', 'csv');
    expect(out).toContain('date,project,hours');
  });

  it('throws for unknown format', () => {
    expect(() => format(DATA, COLUMNS, 'test/cmd', 'xml' as never)).toThrow('Unknown format');
  });
});
