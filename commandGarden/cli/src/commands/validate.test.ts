// src/commands/validate.test.ts
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { executeValidate } from './validate.js';

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  existsSync: vi.fn().mockReturnValue(true),
}));

const VALID_YAML = `
site: test
name: cmd
version: "1.0"
domains: ["example.com"]
capabilities: ["navigate"]
pipeline:
  - step: navigate
    url: "https://example.com"
`;

const INVALID_YAML = `
site: test
`;

const BAD_YAML = `
  : broken: yaml: [
`;

describe('executeValidate', () => {
  it('reports valid connector', () => {
    vi.mocked(readFileSync).mockReturnValue(VALID_YAML);
    const output = executeValidate('/path/to/connector.yaml');
    expect(output).toContain('Valid');
    expect(output).toContain('test/cmd');
  });

  it('reports schema errors', () => {
    vi.mocked(readFileSync).mockReturnValue(INVALID_YAML);
    const output = executeValidate('/path/to/bad.yaml');
    expect(output).toContain('Invalid');
  });

  it('reports YAML parse errors', () => {
    vi.mocked(readFileSync).mockReturnValue(BAD_YAML);
    const output = executeValidate('/path/to/broken.yaml');
    expect(output).toContain('Invalid');
  });

  it('reports semantic errors', () => {
    const yaml = `
site: test
name: cmd
version: "1.0"
domains: ["example.com"]
capabilities: ["navigate"]
pipeline:
  - step: extract
    selector: "tr"
    fields:
      name: "td"
`;
    vi.mocked(readFileSync).mockReturnValue(yaml);
    const output = executeValidate('/path/to/sem.yaml');
    expect(output).toContain('requires capability');
  });

  it('handles file read error', () => {
    vi.mocked(readFileSync).mockImplementation(() => { throw new Error('ENOENT'); });
    const output = executeValidate('/missing/file.yaml');
    expect(output).toContain('Error');
  });
});
