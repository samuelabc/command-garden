import { useState, useCallback } from 'react';
import { Badge } from '../components/Badge';
import { Spinner } from '../components/Spinner';
import { AuthRequiredCallout } from '../components/AuthRequiredCallout';
import { GoalProgressGrid } from '../components/GoalProgressGrid';
import { GoalSummaryStats } from '../components/GoalSummaryStats';
import { MonthCalendarStrip } from '../components/MonthCalendarStrip';
import { useApprovalRun } from '../hooks/useApprovalRun';
import { useTimetrackingData } from '../hooks/useTimetrackingData';

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function Timetracking() {
  const [month, setMonth] = useState(currentMonth());
  const [showRaw, setShowRaw] = useState(false);
  const { running, result, error, approvalPending, approvalId, run, handleApproval, reset } = useApprovalRun();

  const {
    goals, loadGoals, rows, isCached, cachedAt,
    projectNames, activityNames, projectList,
    totalHours,
    activityHours, dailyHoursByGoal, dailyTotalHours,
    goalStats, allCombos, todayStr,
    refreshProjects, refreshingProjects,
  } = useTimetrackingData(month, result);

  const isAuthRequired = error?.includes('auth_required') || error?.includes('sign in');
  const hasData = rows.length > 0;

  const handleRun = useCallback(async () => {
    const args: Record<string, string> = {};
    if (month) args.month = month;
    await run('timetracking/report', args);
    await loadGoals();
  }, [month, run, loadGoals]);

  return (
    <div className="max-w-4xl mx-auto">
      <h2 className="font-display text-xl font-bold uppercase tracking-[0.06em] mb-5">Time Tracking</h2>

      {/* Header: month picker + load */}
      <div className="flex items-end gap-4 mb-6">
        <label className="form-control">
          <span className="font-mono text-[0.6rem] font-medium opacity-40 uppercase tracking-[0.1em] mb-1">Month</span>
          <input
            type="month"
            className="input input-bordered input-sm"
            value={month}
            onChange={(e) => { setMonth(e.target.value); reset(); }}
            onClick={(e) => (e.target as HTMLInputElement).showPicker?.()}
          />
        </label>
        <button className="btn btn-primary btn-sm" onClick={handleRun} disabled={running}>
          {running ? 'Loading...' : 'Load report'}
        </button>
      </div>

      {/* Loading / approval / error states */}
      {running && !approvalPending && <Spinner label="Fetching timetracking data..." />}

      {approvalPending && (
        <div className="alert alert-warning mb-4">
          <span>This connector requires approval before proceeding.</span>
          <div className="flex gap-2">
            <button className="btn btn-sm btn-success" onClick={() => handleApproval(true)} disabled={!approvalId}>
              Approve
            </button>
            <button className="btn btn-sm btn-error" onClick={() => handleApproval(false)} disabled={!approvalId}>
              Reject
            </button>
          </div>
        </div>
      )}

      {isAuthRequired && (
        <AuthRequiredCallout message="Sign in to the timetracking portal in Chrome, then try again." />
      )}

      {error && !isAuthRequired && (
        <div className="alert alert-error mb-4"><span>{error}</span></div>
      )}

      {/* Data-loaded content */}
      {hasData && (
        <>
          {isCached && cachedAt && (
            <div className="font-mono text-[0.6rem] font-medium opacity-40 uppercase tracking-[0.1em] mb-2">
              Showing cached data from {timeAgo(cachedAt)}
            </div>
          )}

          {/* 1. Goal-oriented summary stats */}
          <GoalSummaryStats
            onTrack={goalStats.onTrack}
            total={goalStats.total}
            bookedHours={goalStats.bookedHours}
            targetHours={goalStats.targetHours}
            workingDaysLeft={goalStats.workingDaysLeft}
            avgHoursPerDay={goalStats.avgHoursPerDay}
          />

          {/* 2. Month calendar strip */}
          <MonthCalendarStrip
            month={month}
            today={todayStr}
            dailyTotalHours={dailyTotalHours}
          />
        </>
      )}

      {/* 3. Goal progress grid (always visible when data loaded or goals exist) */}
      <GoalProgressGrid
        goals={goals}
        activityHours={activityHours}
        dailyHoursByGoal={dailyHoursByGoal}
        projectNames={projectNames}
        activityNames={activityNames}
        month={month}
        today={todayStr}
        onGoalChange={loadGoals}
        knownCombos={allCombos}
        onRefreshProjects={refreshProjects}
        refreshingProjects={refreshingProjects}
        hasData={hasData}
      />

      {/* 4. By project table (secondary) */}
      {hasData && (
        <>
          <h3 className="font-display text-base font-semibold mb-3 mt-2">All projects</h3>
          <div className="overflow-x-auto border border-base-300 mb-6">
            <table className="table table-sm">
              <thead><tr><th>Project</th><th>Activities</th><th className="text-right">Hours</th><th className="text-right">Entries</th></tr></thead>
              <tbody>
                {projectList.map((g) => (
                  <tr key={g.projectId}>
                    <td>
                      {projectNames.has(g.projectId) ? (
                        <>
                          <div className="text-sm">{projectNames.get(g.projectId)}</div>
                          <div className="font-mono text-[0.6rem] opacity-50">{g.projectId}</div>
                        </>
                      ) : (
                        <span className="font-mono text-sm">{g.projectId}</span>
                      )}
                    </td>
                    <td className="text-sm">{Array.from(g.activities).join(', ')}</td>
                    <td className="text-right font-semibold">{g.totalHours.toFixed(1)}</td>
                    <td className="text-right">{g.entryCount}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-semibold">
                  <td>Total</td>
                  <td></td>
                  <td className="text-right">{totalHours.toFixed(1)}</td>
                  <td className="text-right">{rows.length}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* 5. Raw booking lines (collapsed) */}
          <details open={showRaw} onToggle={(e) => setShowRaw((e.target as HTMLDetailsElement).open)}>
            <summary className="cursor-pointer text-sm font-semibold mb-2">Raw booking lines ({rows.length})</summary>
            <div className="overflow-x-auto">
              <table className="table table-xs">
                <thead><tr><th>Date</th><th>Project</th><th>Activity</th><th className="text-right">Hours</th><th>Status</th></tr></thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i}>
                      <td>{String(r.date ?? '')}</td>
                      <td className="font-mono text-xs">{String(r.projectId ?? '')}</td>
                      <td>{String(r.activity ?? '')}</td>
                      <td className="text-right">{Number(r.hours ?? 0).toFixed(1)}</td>
                      <td>
                        <Badge variant={String(r.status) === 'posted' ? 'success' : 'warning'} size="xs">
                          {String(r.status ?? '')}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}

      {result && (result.data ?? []).length === 0 && rows.length === 0 && !error && (
        <p className="text-sm opacity-50">No entries found for {month}.</p>
      )}
    </div>
  );
}
