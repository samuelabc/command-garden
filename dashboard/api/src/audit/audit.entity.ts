import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

export type AuditStatus = 'success' | 'auth_required' | 'empty' | 'error';

@Entity('audit_log')
export class AuditLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'datetime' })
  timestamp: string;

  @Column()
  command: string;

  @Column({ type: 'text' })
  argsJson: string;

  @Column()
  status: AuditStatus;

  @Column({ type: 'integer', nullable: true })
  exitCode: number | null;

  @Column({ type: 'integer' })
  durationMs: number;

  @Column({ type: 'integer' })
  rowCount: number;

  @Column({ type: 'text', nullable: true })
  errorCode: string | null;

  @Column({ type: 'text', nullable: true })
  errorMessage: string | null;
}
