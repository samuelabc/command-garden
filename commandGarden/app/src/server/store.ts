import initSqlJs from 'sql.js';
import { existsSync, readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

// sql.js ships no .d.ts; derive Database from the init function's return type.
type Database = InstanceType<Awaited<ReturnType<typeof initSqlJs>>['Database']>;

type SqlParam = string | number | null;

export interface SavedView {
  id: string;
  app: string;
  name: string;
  config: string;
  created_at: string;
}

export interface Goal {
  id: number;
  month: string;
  projectId: string;
  activity: string;
  targetDays: number;
  targetHours: number;
  createdAt: string;
  updatedAt: string;
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
    return values.map((row: unknown[]) => {
      const obj: Record<string, unknown> = {};
      columns.forEach((col: string, i: number) => { obj[col] = row[i]; });
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
    // Drop legacy goals table (had category column) and recreate with activity
    try { this.db.run(`DROP TABLE IF EXISTS goals_old`); } catch { /* ignore */ }
    // Migrate: if goals table has 'category' column but not 'activity', recreate
    try {
      this.db.run(`SELECT activity FROM goals LIMIT 0`);
    } catch {
      // 'activity' column missing — drop and recreate
      try { this.db.run(`DROP TABLE goals`); } catch { /* ignore */ }
    }
    this.db.run(`CREATE TABLE IF NOT EXISTS goals (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      month        TEXT NOT NULL,
      project_id   TEXT NOT NULL,
      activity     TEXT NOT NULL DEFAULT '',
      target_days  REAL NOT NULL,
      target_hours REAL NOT NULL,
      created_at   TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(month, project_id, activity)
    )`);
    this.db.run(`CREATE TABLE IF NOT EXISTS report_cache (
      month      TEXT PRIMARY KEY,
      data       TEXT NOT NULL,
      fetched_at TEXT NOT NULL
    )`);
    this.db.run(`CREATE TABLE IF NOT EXISTS projects_cache (
      id         INTEGER PRIMARY KEY CHECK (id = 1),
      data       TEXT NOT NULL,
      fetched_at TEXT NOT NULL
    )`);
    this.db.run(`CREATE TABLE IF NOT EXISTS security_news_cache (
      id         INTEGER PRIMARY KEY CHECK (id = 1),
      data       TEXT NOT NULL,
      fetched_at TEXT NOT NULL
    )`);
    this.db.run(`CREATE TABLE IF NOT EXISTS trusted_peers_cache (
      id         INTEGER PRIMARY KEY CHECK (id = 1),
      data       TEXT NOT NULL,
      fetched_at TEXT NOT NULL
    )`);
    this.db.run(`CREATE TABLE IF NOT EXISTS room_availability_cache (
      date       TEXT PRIMARY KEY,
      data       TEXT NOT NULL,
      fetched_at TEXT NOT NULL
    )`);
    // Keyed by weekStart + the enabled-sources signature, since different
    // source combinations produce different results for the same week.
    this.db.run(`CREATE TABLE IF NOT EXISTS journal_cache (
      week_start TEXT PRIMARY KEY,
      data       TEXT NOT NULL,
      fetched_at TEXT NOT NULL
    )`);
    // saba_data holds the last Saba "pending training" connector result for
    // the week, saved separately from `data` since it's fetched client-side
    // (not part of JournalService.generate()) and can complete at a
    // different time than the main journal fetch.
    try { this.db.run(`ALTER TABLE journal_cache ADD COLUMN saba_data TEXT`); } catch { /* column already exists */ }
    // Remembers the last-selected source toggles (Timetracking/Meetings/Jira/
    // Git/Saba) so the UI can restore the user's picks on next load, instead
    // of always resetting to "all enabled".
    this.db.run(`CREATE TABLE IF NOT EXISTS journal_source_prefs (
      id           INTEGER PRIMARY KEY CHECK (id = 1),
      timetracking INTEGER NOT NULL DEFAULT 1,
      meetings     INTEGER NOT NULL DEFAULT 1,
      jira         INTEGER NOT NULL DEFAULT 1,
      git          INTEGER NOT NULL DEFAULT 1,
      saba         INTEGER NOT NULL DEFAULT 1,
      updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
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

  upsertGoal(month: string, projectId: string, activity: string, targetDays: number): Goal {
    const targetHours = targetDays * 8;
    const now = new Date().toISOString();
    const existing = this.query(
      'SELECT id FROM goals WHERE month = ? AND project_id = ? AND activity = ?',
      [month, projectId, activity],
    );
    if (existing.length > 0) {
      this.db.run(
        'UPDATE goals SET target_days = ?, target_hours = ?, updated_at = ? WHERE month = ? AND project_id = ? AND activity = ?',
        [targetDays, targetHours, now, month, projectId, activity],
      );
    } else {
      this.db.run(
        'INSERT INTO goals (month, project_id, activity, target_days, target_hours, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [month, projectId, activity, targetDays, targetHours, now, now],
      );
    }
    this.persist();
    const rows = this.query(
      'SELECT * FROM goals WHERE month = ? AND project_id = ? AND activity = ?',
      [month, projectId, activity],
    );
    return this.rowToGoal(rows[0]);
  }

  getGoalsByMonth(month: string): Goal[] {
    const rows = this.query(
      'SELECT * FROM goals WHERE month = ? ORDER BY project_id ASC',
      [month],
    );
    return rows.map((r) => this.rowToGoal(r));
  }

  deleteGoal(id: number): boolean {
    this.db.run('DELETE FROM goals WHERE id = ?', [id]);
    const changes = this.db.getRowsModified();
    if (changes > 0) this.persist();
    return changes > 0;
  }

  private rowToGoal(row: Record<string, unknown>): Goal {
    return {
      id: row.id as number,
      month: row.month as string,
      projectId: row.project_id as string,
      activity: (row.activity as string) ?? '',
      targetDays: row.target_days as number,
      targetHours: row.target_hours as number,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };
  }

  cacheReport(month: string, data: Record<string, unknown>[]): void {
    const now = new Date().toISOString();
    this.db.run(
      'INSERT OR REPLACE INTO report_cache (month, data, fetched_at) VALUES (?, ?, ?)',
      [month, JSON.stringify(data), now],
    );
    this.persist();
  }

  getCachedReport(month: string): { data: Record<string, unknown>[]; fetchedAt: string } | null {
    const rows = this.query('SELECT data, fetched_at FROM report_cache WHERE month = ?', [month]);
    if (rows.length === 0) return null;
    return {
      data: JSON.parse(rows[0].data as string),
      fetchedAt: rows[0].fetched_at as string,
    };
  }

  cacheProjects(data: Record<string, unknown>[]): void {
    const now = new Date().toISOString();
    this.db.run(
      'INSERT OR REPLACE INTO projects_cache (id, data, fetched_at) VALUES (1, ?, ?)',
      [JSON.stringify(data), now],
    );
    this.persist();
  }

  getCachedProjects(): { data: Record<string, unknown>[]; fetchedAt: string } | null {
    const rows = this.query('SELECT data, fetched_at FROM projects_cache WHERE id = 1');
    if (rows.length === 0) return null;
    return {
      data: JSON.parse(rows[0].data as string),
      fetchedAt: rows[0].fetched_at as string,
    };
  }

  cacheTrustedPeers(data: Record<string, unknown>[]): void {
    const now = new Date().toISOString();
    this.db.run(
      'INSERT OR REPLACE INTO trusted_peers_cache (id, data, fetched_at) VALUES (1, ?, ?)',
      [JSON.stringify(data), now],
    );
    this.persist();
  }

  getCachedTrustedPeers(): { data: Record<string, unknown>[]; fetchedAt: string } | null {
    const rows = this.query('SELECT data, fetched_at FROM trusted_peers_cache WHERE id = 1');
    if (rows.length === 0) return null;
    return {
      data: JSON.parse(rows[0].data as string),
      fetchedAt: rows[0].fetched_at as string,
    };
  }

  cacheSecurityNews(data: Record<string, unknown>[]): void {
    const now = new Date().toISOString();
    this.db.run(
      'INSERT OR REPLACE INTO security_news_cache (id, data, fetched_at) VALUES (1, ?, ?)',
      [JSON.stringify(data), now],
    );
    this.persist();
  }

  getCachedSecurityNews(): { data: Record<string, unknown>[]; fetchedAt: string } | null {
    const rows = this.query('SELECT data, fetched_at FROM security_news_cache WHERE id = 1');
    if (rows.length === 0) return null;
    return {
      data: JSON.parse(rows[0].data as string),
      fetchedAt: rows[0].fetched_at as string,
    };
  }

  cacheJournal(cacheKey: string, weekStart: string, data: Record<string, unknown>): string {
    const now = new Date().toISOString();
    this.db.run(
      'INSERT OR REPLACE INTO journal_cache (cache_key, week_start, data, fetched_at) VALUES (?, ?, ?, ?)',
      [cacheKey, weekStart, JSON.stringify(data), now],
    );
    this.persist();
    return now;
  }

  getCachedJournal(cacheKey: string): { data: Record<string, unknown>; fetchedAt: string } | null {
    const rows = this.query('SELECT data, fetched_at FROM journal_cache WHERE cache_key = ?', [cacheKey]);
    if (rows.length === 0) return null;
    return {
      data: JSON.parse(rows[0].data as string),
      fetchedAt: rows[0].fetched_at as string,
    };
  }

  close(): void {
    this.db.close();
  }
}
