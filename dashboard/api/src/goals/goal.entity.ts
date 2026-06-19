import { Column, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';

@Entity('goals')
@Unique(['month', 'projectId'])
export class Goal {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'text' })
  month: string;

  @Column({ type: 'text' })
  projectId: string;

  @Column({ type: 'real' })
  targetDays: number;

  @Column({ type: 'real' })
  targetHours: number;

  @Column({ type: 'datetime', default: () => "datetime('now')" })
  createdAt: string;

  @Column({ type: 'datetime', default: () => "datetime('now')" })
  updatedAt: string;
}
