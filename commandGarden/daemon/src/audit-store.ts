// src/audit-store.ts
import Database from 'better-sqlite3';
import { chmodSync } from 'node:fs';
import type { AuditEvent, StepSummary } from '@commandgarden/shared';

export class AuditStore {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(`CREATE TABLE IF NOT EXISTS audit_events (
      id TEXT PRIMARY KEY, timestamp TEXT NOT NULL, type TEXT NOT NULL,
      user TEXT NOT NULL, connector TEXT NOT NULL, args TEXT NOT NULL,
      domains TEXT NOT NULL, capabilities TEXT NOT NULL, row_count INTEGER,
      columns TEXT, duration_ms INTEGER NOT NULL, error TEXT, denial_reason TEXT
    )`);
    this.migrate();
    if (dbPath !== ':memory:') {
      try { chmodSync(dbPath, 0o600); } catch { /* ignore for read-only fs */ }
    }
  }

  private migrate(): void {
    const cols = new Set(
      (this.db.pragma('table_info(audit_events)') as { name: string }[]).map(c => c.name),
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
        this.db.exec(`ALTER TABLE audit_events ADD COLUMN ${name} ${type}`);
      }
    }
  }

  insert(event: AuditEvent): void {
    this.db.prepare(
      `INSERT INTO audit_events (id, timestamp, type, user, connector, args, domains,
       capabilities, row_count, columns, duration_ms, error, denial_reason,
       correlation_id, connector_hash, steps, source, previous_value, new_value)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      event.id, event.timestamp, event.type, event.user, event.connector,
      JSON.stringify(event.args), JSON.stringify(event.domains),
      JSON.stringify(event.capabilities), event.rowCount ?? null,
      event.columns ? JSON.stringify(event.columns) : null,
      event.durationMs, event.error ?? null, event.denialReason ?? null,
      event.correlationId ?? null, event.connectorHash ?? null,
      event.steps ? JSON.stringify(event.steps) : null,
      event.source ?? null, event.previousValue ?? null, event.newValue ?? null,
    );
  }

  list(opts?: { connector?: string; since?: Date; limit?: number; type?: string }): AuditEvent[] {
    let sql = 'SELECT * FROM audit_events WHERE 1=1';
    const params: unknown[] = [];
    if (opts?.connector) { sql += ' AND connector LIKE ?'; params.push(opts.connector.replace('*', '%')); }
    if (opts?.type) { sql += ' AND type LIKE ?'; params.push(opts.type.replace('*', '%')); }
    if (opts?.since) { sql += ' AND timestamp >= ?'; params.push(opts.since.toISOString()); }
    sql += ' ORDER BY timestamp DESC';
    if (opts?.limit) { sql += ' LIMIT ?'; params.push(opts.limit); }
    return (this.db.prepare(sql).all(...params) as Record<string, unknown>[]).map(r => this.toEvent(r));
  }

  getById(id: string): AuditEvent | undefined {
    const row = this.db.prepare('SELECT * FROM audit_events WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    return row ? this.toEvent(row) : undefined;
  }

  prune(retentionDays: number): number {
    const cutoff = new Date(Date.now() - retentionDays * 86_400_000).toISOString();
    return this.db.prepare('DELETE FROM audit_events WHERE timestamp < ?').run(cutoff).changes;
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
