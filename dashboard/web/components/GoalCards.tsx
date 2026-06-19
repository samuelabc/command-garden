'use client';
import type { Goal, TtGroup } from '@/lib/types';
import { computeGoalProgress } from '@/lib/goals';
import { GoalProgressBar } from './GoalProgressBar';
import { CheckCircle } from 'lucide-react';

function actualHoursForProject(projectId: string, aggregated: TtGroup[]): number {
  return aggregated
    .filter((g) => g.projectId === projectId)
    .reduce((sum, g) => sum + g.totalHours, 0);
}

export function GoalCards({ goals, aggregated, month, today }: {
  goals: Goal[];
  aggregated: TtGroup[];
  month: string;
  today: string;
}) {
  if (goals.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-4">
      {goals.map((goal) => {
        const actual = actualHoursForProject(goal.projectId, aggregated);
        const progress = computeGoalProgress({
          targetHours: goal.targetHours,
          actualHours: actual,
          month,
          today,
        });

        return (
          <div key={goal.id} className="card bg-base-200 shadow-sm w-72">
            <div className="card-body p-4">
              <h3 className="card-title text-sm font-mono">{goal.projectId}</h3>
              <GoalProgressBar percentage={progress.percentage} status={progress.status} className="w-full" />
              <p className="text-sm">
                {Math.round(actual * 10) / 10} / {goal.targetHours}h ({Math.round(progress.percentage)}%)
              </p>
              {progress.status === 'reached' ? (
                <p className="text-success flex items-center gap-1 text-sm">
                  <CheckCircle size={16} /> Goal reached!
                </p>
              ) : (
                <>
                  <p className="text-sm opacity-70">
                    {Math.round(progress.daysRemaining * 10) / 10} days remaining
                  </p>
                  {progress.workingDaysRemaining > 0 && (
                    <p className="text-xs opacity-50">
                      Book {Math.round(progress.hoursPerDayNeeded * 10) / 10}h/day for the remaining {progress.workingDaysRemaining} work days
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
