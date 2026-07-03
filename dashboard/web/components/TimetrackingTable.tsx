'use client';
import { useState } from 'react';
import type { TtReportResponse } from '@/lib/types';
import { computeGoalProgress } from '@/lib/goals';
import { GoalProgressBar } from './GoalProgressBar';

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export function TimetrackingTable({ data, month }: { data: TtReportResponse; month: string }) {
  const [showRaw, setShowRaw] = useState(false);
  const hasGoals = data.goals.length > 0;

  const projectHours = new Map<string, number>();
  for (const g of data.aggregated) {
    projectHours.set(g.projectId, (projectHours.get(g.projectId) ?? 0) + g.totalHours);
  }

  const goalMap = new Map(data.goals.map((g) => [g.projectId, g]));
  const shownBadge = new Set<string>();

  return (
    <div className="space-y-4">
      <div className="stats shadow">
        <div className="stat">
          <div className="stat-title">Total hours</div>
          <div className="stat-value">{data.grandTotalHours}</div>
          <div className="stat-desc">{data.totalLines} booking lines</div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="table table-zebra">
          <thead>
            <tr>
              <th>Project</th><th>Activity</th><th className="text-right">Hours</th><th className="text-right">Lines</th>
              {hasGoals && <th className="text-right">Goal</th>}
            </tr>
          </thead>
          <tbody>
            {data.aggregated.map((g) => {
              const goal = goalMap.get(g.projectId);
              const actual = projectHours.get(g.projectId) ?? 0;
              const progress = goal ? computeGoalProgress({ targetHours: goal.targetHours, actualHours: actual, month, today: todayStr() }) : null;
              const isFirstRow = goal && !shownBadge.has(g.projectId);
              if (isFirstRow) shownBadge.add(g.projectId);

              return (
                <tr key={`${g.projectId}-${g.category}`}>
                  <td>{g.projectId}</td><td>{g.category}</td>
                  <td className="text-right">{g.totalHours}</td>
                  <td className="text-right">{g.lineCount}</td>
                  {hasGoals && (
                    <td className="text-right">
                      {progress ? (
                        <div className="flex items-center justify-end gap-2">
                          <GoalProgressBar percentage={progress.percentage} status={progress.status} className="w-24" />
                          <span className="text-xs">{Math.round(progress.percentage)}%</span>
                          {isFirstRow && progress.status !== 'reached' && (
                            <span className="badge badge-info badge-xs">{Math.round(progress.daysRemaining * 10) / 10}d left</span>
                          )}
                          {isFirstRow && progress.status === 'reached' && (
                            <span className="badge badge-success badge-xs">done</span>
                          )}
                        </div>
                      ) : (
                        <span className="opacity-30">—</span>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <button className="btn btn-sm btn-outline" onClick={() => setShowRaw((s) => !s)}>
        {showRaw ? 'Hide raw rows' : 'Show raw rows'}
      </button>

      {showRaw && (
        <div className="overflow-x-auto">
          <table className="table table-xs">
            <thead><tr><th>Date</th><th>Project</th><th>Activity</th><th className="text-right">Hours</th></tr></thead>
            <tbody>
              {data.raw.map((r, i) => (
                <tr key={i}><td>{r.date}</td><td>{r.projectId}</td><td>{r.activity}</td><td className="text-right">{r.hours ?? 0}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
