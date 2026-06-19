import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog, AuditStatus } from './audit.entity';

export interface RecordInput {
  command: string;
  args: Record<string, unknown>;
  status: AuditStatus;
  exitCode: number | null;
  durationMs: number;
  rowCount: number;
  errorCode?: string;
  errorMessage?: string;
}

export interface QueryInput {
  limit: number;
  offset: number;
  status?: AuditStatus;
  command?: string;
}

@Injectable()
export class AuditService {
  constructor(@InjectRepository(AuditLog) private readonly repo: Repository<AuditLog>) {}

  async record(input: RecordInput): Promise<AuditLog> {
    const row = this.repo.create({
      timestamp: new Date().toISOString(),
      command: input.command,
      argsJson: JSON.stringify(input.args ?? {}),
      status: input.status,
      exitCode: input.exitCode,
      durationMs: input.durationMs,
      rowCount: input.rowCount,
      errorCode: input.errorCode ?? null,
      errorMessage: input.errorMessage ?? null,
    });
    return this.repo.save(row);
  }

  async query(input: QueryInput): Promise<{ items: AuditLog[]; total: number }> {
    const where: Record<string, unknown> = {};
    if (input.status) where.status = input.status;
    if (input.command) where.command = input.command;
    const [items, total] = await this.repo.findAndCount({
      where,
      order: { id: 'DESC' },
      take: input.limit,
      skip: input.offset,
    });
    return { items, total };
  }
}
