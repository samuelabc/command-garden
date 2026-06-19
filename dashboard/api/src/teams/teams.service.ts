import { Injectable } from '@nestjs/common';
import { OpencliService } from '../opencli/opencli.service';
import { AuditService } from '../audit/audit.service';
import { OpencliStatus } from '../opencli/opencli.types';

export interface TimelineRow { room?: string; date?: string; state?: string; start?: string; end?: string; durationMin?: number; }
export interface RoomFreeBusyResponse { status: OpencliStatus; timeline: TimelineRow[]; errorMessage?: string; }
export interface RoomFreeBusyInput { room: string; date?: string; }

@Injectable()
export class TeamsService {
  constructor(private readonly opencli: OpencliService, private readonly audit: AuditService) {}

  async roomFreeBusy(input: RoomFreeBusyInput): Promise<RoomFreeBusyResponse> {
    const args = ['teams', 'roomfreebusy', '--room', input.room];
    if (input.date) args.push('--date', input.date);
    const result = await this.opencli.run<TimelineRow>(args);

    await this.audit.record({
      command: 'teams roomfreebusy',
      args: input as unknown as Record<string, unknown>,
      status: result.status,
      exitCode: result.exitCode,
      durationMs: result.durationMs,
      rowCount: result.rowCount,
      errorCode: result.errorCode,
      errorMessage: result.errorMessage,
    });

    return { status: result.status, timeline: result.data, errorMessage: result.errorMessage };
  }
}
