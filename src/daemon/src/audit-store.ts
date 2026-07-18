// src/audit-store.ts
import initSqlJs, { type Database } from 'sql.js';
import { chmodSync, existsSync, readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { AuditEvent, StepSummary } from '@commandgarden/shared';

type SqlParam = string | number | null;

export class AuditStore {
  private db: Database;
  private dbPath: string;

  private constructor(db: Database, dbPath: string) {
    this.db = db;
    this.dbPath = dbPath;
  }

  static async create(dbPath: string): Promise<AuditStore> {
    const SQL = await initSqlJs();
    let db: Database;
    if (dbPath !== ':memory:' && existsSync(dbPath)) {
      const buf = readFileSync(dbPath);
      db = new SQL.Database(buf);
    } else {
      db = new SQL.Database();
    }
    db.run(`CREATE TABLE IF NOT EXISTS audit_events (
      id TEXT PRIMARY KEY, timestamp TEXT NOT NULL, type TEXT NOT NULL,
      user TEXT NOT NULL, connector TEXT NOT NULL, args TEXT NOT NULL,
      domains TEXT NOT NULL, capabilities TEXT NOT NULL, row_count INTEGER,
      columns TEXT, duration_ms INTEGER NOT NULL, error TEXT, denial_reason TEXT
    )`);
    const store = new AuditStore(db, dbPath);
    store.migrate();
    if (dbPath !== ':memory:') {
      store.persist();
      try { chmodSync(dbPath, 0o600); } catch { /* ignore for read-only fs */ }
    }
    return store;
  }

  // sql.js requires full-DB export on every write; acceptable for small audit databases.
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
    const colResults = this.db.exec('PRAGMA table_info(audit_events)');
    const cols = new Set(
      colResults.length > 0 ? colResults[0].values.map(row => row[1] as string) : [],
    );
    const additions: [string, string][] = [
      ['correlation_id', 'TEXT'],
      ['connector_hash', 'TEXT'],
      ['steps', 'TEXT'],
      ['source', 'TEXT'],
      ['previous_value', 'TEXT'],
      ['new_value', 'TEXT'],
    ];
    for (const [name, type] of additions) {
      if (!cols.has(name)) {
        this.db.run(`ALTER TABLE audit_events ADD COLUMN ${name} ${type}`);
      }
    }
  }

  insert(event: AuditEvent): void {
    this.db.run(
      `INSERT INTO audit_events (id, timestamp, type, user, connector, args, domains,
       capabilities, row_count, columns, duration_ms, error, denial_reason,
       correlation_id, connector_hash, steps, source, previous_value, new_value)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        event.id, event.timestamp, event.type, event.user, event.connector,
        JSON.stringify(event.args), JSON.stringify(event.domains),
        JSON.stringify(event.capabilities), event.rowCount ?? null,
        event.columns ? JSON.stringify(event.columns) : null,
        event.durationMs, event.error ?? null, event.denialReason ?? null,
        event.correlationId ?? null, event.connectorHash ?? null,
        event.steps ? JSON.stringify(event.steps) : null,
        event.source ?? null, event.previousValue ?? null, event.newValue ?? null,
      ],
    );
    this.persist();
  }

  list(opts?: { connector?: string; since?: Date; limit?: number; type?: string }): AuditEvent[] {
    let sql = 'SELECT * FROM audit_events WHERE 1=1';
    const params: SqlParam[] = [];
    if (opts?.connector) { sql += ' AND connector LIKE ?'; params.push(opts.connector.replace('*', '%')); }
    if (opts?.type) { sql += ' AND type LIKE ?'; params.push(opts.type.replace('*', '%')); }
    if (opts?.since) { sql += ' AND timestamp >= ?'; params.push(opts.since.toISOString()); }
    sql += ' ORDER BY timestamp DESC';
    if (opts?.limit) { sql += ' LIMIT ?'; params.push(opts.limit); }
    return this.query(sql, params).map(r => this.toEvent(r));
  }

  getById(id: string): AuditEvent | undefined {
    const rows = this.query('SELECT * FROM audit_events WHERE id = ?', [id]);
    return rows.length > 0 ? this.toEvent(rows[0]) : undefined;
  }

  prune(retentionDays: number): number {
    const cutoff = new Date(Date.now() - retentionDays * 86_400_000).toISOString();
    this.db.run('DELETE FROM audit_events WHERE timestamp < ?', [cutoff]);
    const changes = this.db.getRowsModified();
    if (changes > 0) this.persist();
    return changes;
  }

  close(): void { this.db.close(); }

  private toEvent(r: Record<string, unknown>): AuditEvent {
    return {
      id: r.id as string, timestamp: r.timestamp as string,
      type: r.type as AuditEvent['type'], user: r.user as string,
      connector: r.connector as string,
      args: JSON.parse(r.args as string), domains: JSON.parse(r.domains as string),
      capabilities: JSON.parse(r.capabilities as string),
      rowCount: r.row_count as number | undefined,
      columns: r.columns ? JSON.parse(r.columns as string) : undefined,
      durationMs: r.duration_ms as number,
      error: r.error as string | undefined,
      denialReason: r.denial_reason as string | undefined,
      correlationId: r.correlation_id as string | undefined,
      connectorHash: r.connector_hash as string | undefined,
      steps: r.steps ? JSON.parse(r.steps as string) as StepSummary[] : undefined,
      source: r.source as string | undefined,
      previousValue: r.previous_value as string | undefined,
      newValue: r.new_value as string | undefined,
    };
  }
}
