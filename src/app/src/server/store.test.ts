import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AppStore } from './store.js';

describe('AppStore', () => {
  let store: AppStore;

  beforeEach(async () => {
    store = await AppStore.create(':memory:');
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

  describe('goals', () => {
    it('returns empty array when no goals', () => {
      expect(store.getGoalsByMonth('2026-07')).toEqual([]);
    });

    it('creates a goal with correct hours calculation', () => {
      const goal = store.upsertGoal('2026-07', 'PID001', 'A000095814', 16.5);
      expect(goal.month).toBe('2026-07');
      expect(goal.projectId).toBe('PID001');
      expect(goal.activity).toBe('A000095814');
      expect(goal.targetDays).toBe(16.5);
      expect(goal.targetHours).toBe(132);
      expect(goal.id).toBeGreaterThan(0);
    });

    it('lists goals by month', () => {
      store.upsertGoal('2026-07', 'PID001', 'A000095814', 16.5);
      store.upsertGoal('2026-07', 'PID002', 'A000100978', 1);
      store.upsertGoal('2026-08', 'PID001', 'A000095814', 20);

      const julyGoals = store.getGoalsByMonth('2026-07');
      expect(julyGoals).toHaveLength(2);

      const augGoals = store.getGoalsByMonth('2026-08');
      expect(augGoals).toHaveLength(1);
    });

    it('upserts existing goal (updates target)', () => {
      store.upsertGoal('2026-07', 'PID001', 'A000095814', 16.5);
      const updated = store.upsertGoal('2026-07', 'PID001', 'A000095814', 20);
      expect(updated.targetDays).toBe(20);
      expect(updated.targetHours).toBe(160);

      const goals = store.getGoalsByMonth('2026-07');
      expect(goals).toHaveLength(1);
    });

    it('deletes a goal', () => {
      const goal = store.upsertGoal('2026-07', 'PID001', 'A000095814', 16.5);
      expect(store.deleteGoal(goal.id)).toBe(true);
      expect(store.getGoalsByMonth('2026-07')).toHaveLength(0);
    });

    it('returns false when deleting non-existent goal', () => {
      expect(store.deleteGoal(999)).toBe(false);
    });
  });

  describe('room availability cache', () => {
    it('returns null when no cached data', () => {
      expect(store.getCachedRoomAvailability('2026-07-13')).toBeNull();
    });

    it('caches and retrieves room availability by date', () => {
      const data = [{ room: 'room1', state: 'free' }, { room: 'room2', state: 'busy' }];
      store.cacheRoomAvailability('2026-07-13', data);
      const cached = store.getCachedRoomAvailability('2026-07-13');
      expect(cached).not.toBeNull();
      expect(cached!.data).toEqual(data);
      expect(cached!.fetchedAt).toBeDefined();
    });

    it('overwrites cache for the same date', () => {
      store.cacheRoomAvailability('2026-07-13', [{ room: 'room1', state: 'free' }]);
      const updated = [{ room: 'room1', state: 'busy' }];
      store.cacheRoomAvailability('2026-07-13', updated);
      const cached = store.getCachedRoomAvailability('2026-07-13');
      expect(cached!.data).toEqual(updated);
    });

    it('keeps separate caches per date', () => {
      store.cacheRoomAvailability('2026-07-13', [{ day: '13' }]);
      store.cacheRoomAvailability('2026-07-14', [{ day: '14' }]);
      expect(store.getCachedRoomAvailability('2026-07-13')!.data).toEqual([{ day: '13' }]);
      expect(store.getCachedRoomAvailability('2026-07-14')!.data).toEqual([{ day: '14' }]);
    });
  });
});
