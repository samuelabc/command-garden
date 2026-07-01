import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

export interface SavedView {
  id: string;
  app: string;
  name: string;
  config: string;
  created_at: string;
}

export class AppStore {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS preferences (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS saved_views (
        id          TEXT PRIMARY KEY,
        app         TEXT NOT NULL,
        name        TEXT NOT NULL,
        config      TEXT NOT NULL,
        created_at  TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
  }

  getPreference(key: string): string | undefined {
    const row = this.db.prepare('SELECT value FROM preferences WHERE key = ?').get(key) as { value: string } | undefined;
    return row?.value;
  }

  setPreference(key: string, value: string): void {
    this.db.prepare('INSERT OR REPLACE INTO preferences (key, value) VALUES (?, ?)').run(key, value);
  }

  getAllPreferences(): Record<string, string> {
    const rows = this.db.prepare('SELECT key, value FROM preferences').all() as { key: string; value: string }[];
    const result: Record<string, string> = {};
    for (const row of rows) result[row.key] = row.value;
    return result;
  }

  listViews(app: string): SavedView[] {
    return this.db.prepare('SELECT * FROM saved_views WHERE app = ? ORDER BY created_at DESC').all(app) as SavedView[];
  }

  createView(app: string, name: string, config: string): SavedView {
    const id = randomUUID();
    const created_at = new Date().toISOString();
    this.db.prepare('INSERT INTO saved_views (id, app, name, config, created_at) VALUES (?, ?, ?, ?, ?)').run(id, app, name, config, created_at);
    return { id, app, name, config, created_at };
  }

  deleteView(id: string): boolean {
    const result = this.db.prepare('DELETE FROM saved_views WHERE id = ?').run(id);
    return result.changes > 0;
  }

  close(): void {
    this.db.close();
  }
}
