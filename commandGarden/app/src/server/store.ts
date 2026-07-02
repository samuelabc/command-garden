import initSqlJs, { type Database } from 'sql.js';
import { existsSync, readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

type SqlParam = string | number | null;

export interface SavedView {
  id: string;
  app: string;
  name: string;
  config: string;
  created_at: string;
}

export class AppStore {
  private db: Database;
  private dbPath: string;

  private constructor(db: Database, dbPath: string) {
    this.db = db;
    this.dbPath = dbPath;
  }

  static async create(dbPath: string): Promise<AppStore> {
    const SQL = await initSqlJs();
    let db: Database;
    if (dbPath !== ':memory:' && existsSync(dbPath)) {
      const buf = readFileSync(dbPath);
      db = new SQL.Database(buf);
    } else {
      db = new SQL.Database();
    }
    const store = new AppStore(db, dbPath);
    store.migrate();
    if (dbPath !== ':memory:') store.persist();
    return store;
  }

  // sql.js requires full-DB export on every write; acceptable for small app databases.
  // Write to a temp file then atomically rename to prevent corruption on crash.
  private persist(): void {
    if (this.dbPath === ':memory:') return;
    const data = this.db.export();
    const dir = dirname(this.dbPath);
    mkdirSync(dir, { recursive: true });
    const tmpPath = this.dbPath + '.tmp';
    writeFileSync(tmpPath, Buffer.from(data));
    renameSync(tmpPath, this.dbPath);
  }

  private query(sql: string, params: SqlParam[] = []): Record<string, unknown>[] {
    const results = this.db.exec(sql, params);
    if (results.length === 0) return [];
    const { columns, values } = results[0];
    return values.map(row => {
      const obj: Record<string, unknown> = {};
      columns.forEach((col, i) => { obj[col] = row[i]; });
      return obj;
    });
  }

  private migrate(): void {
    this.db.run(`CREATE TABLE IF NOT EXISTS preferences (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )`);
    this.db.run(`CREATE TABLE IF NOT EXISTS saved_views (
      id          TEXT PRIMARY KEY,
      app         TEXT NOT NULL,
      name        TEXT NOT NULL,
      config      TEXT NOT NULL,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
  }

  getPreference(key: string): string | undefined {
    const rows = this.query('SELECT value FROM preferences WHERE key = ?', [key]);
    return rows.length > 0 ? rows[0].value as string : undefined;
  }

  setPreference(key: string, value: string): void {
    this.db.run('INSERT OR REPLACE INTO preferences (key, value) VALUES (?, ?)', [key, value]);
    this.persist();
  }

  getAllPreferences(): Record<string, string> {
    const rows = this.query('SELECT key, value FROM preferences');
    const result: Record<string, string> = {};
    for (const row of rows) result[row.key as string] = row.value as string;
    return result;
  }

  listViews(app: string): SavedView[] {
    return this.query('SELECT * FROM saved_views WHERE app = ? ORDER BY created_at DESC', [app]) as unknown as SavedView[];
  }

  createView(app: string, name: string, config: string): SavedView {
    const id = randomUUID();
    const created_at = new Date().toISOString();
    this.db.run('INSERT INTO saved_views (id, app, name, config, created_at) VALUES (?, ?, ?, ?, ?)', [id, app, name, config, created_at]);
    this.persist();
    return { id, app, name, config, created_at };
  }

  deleteView(id: string): boolean {
    this.db.run('DELETE FROM saved_views WHERE id = ?', [id]);
    const changes = this.db.getRowsModified();
    if (changes > 0) this.persist();
    return changes > 0;
  }

  close(): void {
    this.db.close();
  }
}
