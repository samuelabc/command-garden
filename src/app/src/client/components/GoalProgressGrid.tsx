import type { Goal } from '../api';
import type { PaceStatus } from '../lib/goals';
import { computeGoalProgress } from '../lib/goals';
import { GoalProgressBar } from './GoalProgressBar';
import { TrendingUp, CircleCheckBig, Clock, AlertTriangle } from 'lucide-react';

interface ActivityHours {
  projectId: string;
  activity: string;
  totalHours: number;
}

const statusIcon: Record<PaceStatus, typeof TrendingUp> = {
  reached: CircleCheckBig,
  on_track: TrendingUp,
  behind: Clock,
  at_risk: AlertTriangle,
};

const statusIconColor: Record<PaceStatus, string> = {
  reached: 'text-success',
  on_track: 'text-success',
  behind: 'text-warning',
  at_risk: 'text-error',
};

const statusRowTint: Record<PaceStatus, string> = {
  reached: 'bg-success/10',
  on_track: 'bg-success/5',
  behind: 'bg-warning/10',
  at_risk: 'bg-error/10',
};

function actualHoursForGoal(projectId: string, activity: string, activityHours: ActivityHours[]): number {
  const entry = activityHours.find((a) => a.projectId === projectId && a.activity === activity);
  return entry?.totalHours ?? 0;
}

export function GoalProgressGrid({
  goals,
  activityHours,
  projectNames,
  activityNames,
  month,
  today,
}: {
  goals: Goal[];
  activityHours: ActivityHours[];
  projectNames: Map<string, string>;
  activityNames: Map<string, string>;
  month: string;
  today: string;
}) {
  if (goals.length === 0) return null;

  return (
    <div className="border border-base-300">
      {goals.map((goal, i) => {
        const actual = actualHoursForGoal(goal.projectId, goal.activity, activityHours);
        const progress = computeGoalProgress({
          targetHours: goal.targetHours,
          actualHours: actual,
          month,
          today,
        });
        const name = projectNames.get(goal.projectId);
        const Icon = statusIcon[progress.status];

        return (
          <div
            key={goal.id}
            className={`grid grid-cols-[auto_1fr_auto_1fr] gap-0 ${statusRowTint[progress.status]} ${i > 0 ? 'border-t border-base-300' : ''}`}
          >
            {/* Status icon */}
            <div className="p-3 border-r border-base-300 flex items-center justify-center">
              <Icon size={18} className={statusIconColor[progress.status]} />
            </div>

            {/* Project + activity info */}
            <div className="p-3 border-r border-base-300">
              <div className="font-display font-semibold text-sm">
                {name ?? goal.projectId}
              </div>
              <div className="font-mono text-[0.6rem] opacity-50 mt-0.5">
                {name ? `${goal.projectId} · ` : ''}{activityNames.get(`${goal.projectId}\0${goal.activity}`) ?? goal.activity}
              </div>
            </div>

            {/* Hours / days */}
            <div className="p-3 border-r border-base-300 text-right min-w-[7rem]">
              <div className="font-display font-semibold text-sm">
                {Math.round(actual * 10) / 10}/{goal.targetHours}h
              </div>
              <div className="font-mono text-[0.6rem] font-medium opacity-40 uppercase tracking-[0.1em] mt-0.5">
                {goal.targetDays}d target
              </div>
            </div>

            {/* Progress */}
            <div className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <GoalProgressBar
                  percentage={progress.percentage}
                  status={progress.status}
                  className="flex-1"
                />
                <span className="font-mono text-xs font-medium min-w-[3rem] text-right">
                  {Math.round(progress.percentage)}%
                </span>
              </div>
              {progress.status === 'reached' ? (
                <div className="font-mono text-[0.6rem] font-medium text-success uppercase tracking-[0.1em]">
                  Goal reached
                </div>
              ) : (
                <div className="font-mono text-[0.6rem] font-medium opacity-40 uppercase tracking-[0.1em]">
                  {progress.workingDaysRemaining > 0
                    ? `Book ${Math.round(progress.hoursPerDayNeeded * 10) / 10}h/day · ${progress.workingDaysRemaining} days left`
                    : `${Math.round(progress.daysRemaining * 10) / 10} days remaining`}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
