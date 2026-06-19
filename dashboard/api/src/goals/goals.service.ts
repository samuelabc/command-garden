import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Goal } from './goal.entity';

export interface UpsertGoalInput {
  month: string;
  projectId: string;
  targetDays: number;
}

@Injectable()
export class GoalsService {
  constructor(@InjectRepository(Goal) private readonly repo: Repository<Goal>) {}

  async upsert(input: UpsertGoalInput): Promise<Goal> {
    const targetHours = input.targetDays * 8;
    const existing = await this.repo.findOne({
      where: { month: input.month, projectId: input.projectId },
    });
    if (existing) {
      existing.targetDays = input.targetDays;
      existing.targetHours = targetHours;
      existing.updatedAt = new Date().toISOString();
      return this.repo.save(existing);
    }
    const goal = this.repo.create({
      month: input.month,
      projectId: input.projectId,
      targetDays: input.targetDays,
      targetHours,
    });
    return this.repo.save(goal);
  }

  async findByMonth(month: string): Promise<Goal[]> {
    return this.repo.find({ where: { month }, order: { projectId: 'ASC' } });
  }

  async remove(id: number): Promise<{ deleted: true } | null> {
    const result = await this.repo.delete(id);
    if (result.affected === 0) return null;
    return { deleted: true };
  }
}
