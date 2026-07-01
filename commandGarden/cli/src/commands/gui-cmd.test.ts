import { describe, it, expect } from 'vitest';
import { executeGuiStatus, executeGuiStop } from './gui-cmd.js';

describe('gui-cmd', () => {
  describe('executeGuiStatus', () => {
    it('reports not running when no PID file', () => {
      expect(executeGuiStatus('/nonexistent')).toBe('GUI: not running (no PID file found).');
    });
  });

  describe('executeGuiStop', () => {
    it('reports not running when no PID file', () => {
      expect(executeGuiStop('/nonexistent')).toBe('GUI is not running (no PID file found).');
    });
  });
});
