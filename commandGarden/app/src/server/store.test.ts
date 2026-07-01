import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AppStore } from './store.js';

describe('AppStore', () => {
  let store: AppStore;

  beforeEach(() => {
    store = new AppStore(':memory:');
  });

  afterEach(() => {
    store.close();
  });

  describe('preferences', () => {
    it('returns undefined for missing key', () => {
      expect(store.getPreference('missing')).toBeUndefined();
    });

    it('sets and gets a preference', () => {
      store.setPreference('theme', 'light');
      expect(store.getPreference('theme')).toBe('light');
    });

    it('overwrites existing preference', () => {
      store.setPreference('theme', 'light');
      store.setPreference('theme', 'dark');
      expect(store.getPreference('theme')).toBe('dark');
    });

    it('returns all preferences', () => {
      store.setPreference('a', '1');
      store.setPreference('b', '2');
      expect(store.getAllPreferences()).toEqual({ a: '1', b: '2' });
    });
  });

  describe('saved views', () => {
    it('returns empty array when no views', () => {
      expect(store.listViews('timetracking')).toEqual([]);
    });

    it('creates and lists a view', () => {
      const view = store.createView('timetracking', 'June report', '{"month":"2026-06"}');
      expect(view.id).toBeDefined();
      expect(view.app).toBe('timetracking');
      expect(view.name).toBe('June report');
      expect(view.config).toBe('{"month":"2026-06"}');

      const views = store.listViews('timetracking');
      expect(views).toHaveLength(1);
      expect(views[0].name).toBe('June report');
    });

    it('filters views by app', () => {
      store.createView('timetracking', 'View A', '{}');
      store.createView('rooms', 'View B', '{}');
      expect(store.listViews('timetracking')).toHaveLength(1);
      expect(store.listViews('rooms')).toHaveLength(1);
    });

    it('deletes a view', () => {
      const view = store.createView('timetracking', 'To delete', '{}');
      expect(store.deleteView(view.id)).toBe(true);
      expect(store.listViews('timetracking')).toHaveLength(0);
    });

    it('returns false when deleting non-existent view', () => {
      expect(store.deleteView('nonexistent')).toBe(false);
    });
  });
});
