import { Injectable } from '@nestjs/common';
import { OpencliService } from '../opencli/opencli.service';
import { AuditService } from '../audit/audit.service';
import { OpencliStatus } from '../opencli/opencli.types';

export interface SabaTrainingRow {
  title?: string;
  type?: string;
  status?: string;
  dueDate?: string;
  daysUntilDue?: number;
  isOverdue?: boolean;
}

export interface SabaPendingTrainingResponse {
  status: OpencliStatus;
  items: SabaTrainingRow[];
  overdueCount: number;
  dueSoonCount: number;
  errorMessage?: string;
}

@Injectable()
export class SabaService {
  constructor(
    private readonly opencli: OpencliService,
    private readonly audit: AuditService,
  ) {}

  async pendingTraining(): Promise<SabaPendingTrainingResponse> {
    const result = await this.opencli.run<SabaTrainingRow>(['saba', 'pending-training']);

    await this.audit.record({
      command: 'saba pending-training',
      args: {},
      status: result.status,
      exitCode: result.exitCode,
      durationMs: result.durationMs,
      rowCount: result.rowCount,
      errorCode: result.errorCode,
      errorMessage: result.errorMessage,
    });

    const items = result.data;
    const overdueCount = items.filter(i => i.isOverdue).length;
    const dueSoonCount = items.filter(
      i => !i.isOverdue && typeof i.daysUntilDue === 'number' && i.daysUntilDue <= 30,
    ).length;

    return {
      status: result.status,
      items,
      overdueCount,
      dueSoonCount,
      errorMessage: result.errorMessage,
    };
  }
}
