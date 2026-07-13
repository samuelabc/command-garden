import { useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { ApprovalRunState, ApprovalRunActions } from '../../hooks/useApprovalRun';
import type { Goal } from '../../api';
import type { MonthlyTimetrackingData } from '../../types/journal';
import { AuthRequiredCallout } from '../AuthRequiredCallout';

function formatMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

function urgencyBadge(row: { isOverdue?: boolean; daysUntilDue?: number }): string {
  if (row.isOverdue) return 'badge badge-error badge-sm';
  if (typeof row.daysUntilDue === 'number' && row.daysUntilDue <= 7) return 'badge badge-warning badge-sm';
  if (typeof row.daysUntilDue === 'number' && row.daysUntilDue <= 30) return 'badge badge-info badge-sm';
  return 'badge badge-ghost badge-sm';
}

function urgencyLabel(row: { isOverdue?: boolean; daysUntilDue?: number }): string {
  if (row.isOverdue) return 'Overdue';
  if (row.daysUntilDue == null || row.daysUntilDue === 9999) return 'No deadline';
  if (row.daysUntilDue === 0) return 'Due today';
  if (row.daysUntilDue === 1) return 'Due tomorrow';
  return `${row.daysUntilDue}d left`;
}

type ApprovalRun = ApprovalRunState & ApprovalRunActions;

interface Props {
  month: string;
  monthly: MonthlyTimetrackingData | null;
  goals: Goal[];
  projectNames: Map<string, string>;
  activityNames: Map<string, string>;
  saba: ApprovalRun;
  enabled: { timetracking: boolean; saba: boolean };
}

export function MonthlyStatus({ month, monthly, goals, projectNames, activityNames, saba, enabled }: Props) {
  const [expanded, setExpanded] = useState(false);

  const hoursByProjectActivity = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of monthly?.hoursByProjectActivity ?? []) {
      map.set(`${row.projectId}\0${row.activity}`, row.hours);
    }
    return map;
  }, [monthly]);

  const sabaRows = useMemo(
    () => (saba.result?.data ?? []) as { title?: string; type?: string; status?: string; dueDate?: string; daysUntilDue?: number; isOverdue?: boolean }[],
    [saba.result],
  );

  const sabaAuthRequired = typeof saba.error === 'string' &&
    (saba.error.toLowerCase().includes('auth_required') || saba.error.toLowerCase().includes('sign in'));

  const overdueCount = sabaRows.filter((r) => r.isOverdue).length;
  const dueSoonCount = sabaRows.filter((r) => !r.isOverdue && typeof r.daysUntilDue === 'number' && r.daysUntilDue <= 30).length;

  // Compact status chip shown in the collapsed header — one per enabled source.
  const ttChip = !enabled.timetracking ? null : !monthly
    ? { label: 'Not checked', className: 'opacity-40' }
    : monthly.unreleasedDates.length > 0
      ? { label: `${monthly.unreleasedDates.length} unreleased`, className: 'text-warning' }
      : { label: 'Released ✓', className: 'text-success' };

  const sabaChip = !enabled.saba ? null : !saba.result
    ? { label: 'Not checked', className: 'opacity-40' }
    : sabaRows.length === 0
      ? { label: 'No training due ✓', className: 'text-success' }
      : { label: `${sabaRows.length} training${sabaRows.length !== 1 ? 's' : ''}${overdueCount > 0 ? ` · ${overdueCount} overdue` : ''}`, className: overdueCount > 0 ? 'text-error' : 'text-warning' };

  // Actionable items (approval prompt / auth required / error) stay visible even when collapsed.
  const needsAttention = saba.approvalPending || sabaAuthRequired || (saba.error && !sabaAuthRequired);

  return (
    <div className="border border-base-300 text-sm">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between gap-3 p-3 text-left"
        aria-expanded={expanded}
      >
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-[0.6rem] font-medium opacity-50 uppercase tracking-[0.1em]">Month-to-date</span>
          <span className="text-xs opacity-40">{formatMonth(month)}</span>
        </div>
        <div className="flex items-center gap-3">
          {ttChip && <span className={`text-xs font-medium whitespace-nowrap ${ttChip.className}`}>{ttChip.label}</span>}
          {sabaChip && <span className={`text-xs font-medium whitespace-nowrap ${sabaChip.className}`}>{sabaChip.label}</span>}
          <ChevronDown className={`w-3.5 h-3.5 opacity-40 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {needsAttention && (
        <div className="border-t border-base-300 p-3 space-y-2">
          {saba.approvalPending && (
            <div className="alert alert-warning">
              <span>This connector requires approval before proceeding.</span>
              <div className="flex gap-2">
                <button className="btn btn-sm btn-success" onClick={() => saba.handleApproval(true)} disabled={!saba.approvalId}>Approve</button>
                <button className="btn btn-sm btn-error" onClick={() => saba.handleApproval(false)} disabled={!saba.approvalId}>Reject</button>
              </div>
            </div>
          )}
          {sabaAuthRequired && (
            <AuthRequiredCallout message="Sign in to Saba Cloud (daimler.sabacloud.com) in Chrome, then try again." />
          )}
          {saba.error && !sabaAuthRequired && (
            <div className="alert alert-error text-sm font-mono whitespace-pre-wrap"><span>{saba.error}</span></div>
          )}
        </div>
      )}

      {expanded && (
        <div className="border-t border-base-300 p-3 space-y-4">
          {/* ── Time Tracking ── */}
          {enabled.timetracking && (
            <div className="space-y-3">
              <p className="font-mono text-[0.6rem] font-medium opacity-40 uppercase tracking-[0.1em]">Time Tracking</p>

              {monthly ? (
                <>
                  <p className="text-xs opacity-50">
                    {monthly.workingDaysElapsed} of {monthly.workingDaysTotal} working days elapsed this month
                  </p>
                  {monthly.unreleasedDates.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {monthly.unreleasedDates.map((d: string) => (
                        <span key={d} className="badge badge-warning badge-outline badge-sm">{formatDate(d)}</span>
                      ))}
                    </div>
                  )}
                  {goals.length > 0 && (
                    <div className="space-y-2 pt-1">
                      {goals.map((goal) => {
                        const logged = Math.round((hoursByProjectActivity.get(`${goal.projectId}\0${goal.activity}`) ?? 0) * 100) / 100;
                        const remaining = Math.round((goal.targetHours - logged) * 100) / 100;
                        const pct = Math.min(100, Math.round((logged / goal.targetHours) * 100));
                        const achieved = remaining <= 0;
                        return (
                          <div key={goal.id} className="space-y-1">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-medium">
                                {projectNames.get(goal.projectId) ?? goal.projectId}
                                {projectNames.has(goal.projectId) && (
                                  <span className="font-mono text-[0.6rem] opacity-50 ml-1">{goal.projectId}</span>
                                )}
                                <span className="font-mono text-[0.6rem] opacity-40 ml-1">· {activityNames.get(`${goal.projectId}\0${goal.activity}`) ?? goal.activity}</span>
                              </span>
                              <span className={`font-mono ${achieved ? 'text-success' : 'text-warning'}`}>
                                {achieved ? '✓ Goal met' : `${remaining}h to go`}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <progress
                                className={`progress flex-1 ${achieved ? 'progress-success' : 'progress-warning'}`}
                                value={pct}
                                max={100}
                              />
                              <span className="font-mono text-[0.65rem] opacity-50 w-20 text-right">
                                {logged}h / {goal.targetHours}h
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              ) : (
                <p className="text-xs opacity-40">Click Generate above to check your time tracking status.</p>
              )}
            </div>
          )}

          {/* ── Saba Training ── */}
          {enabled.saba && (
            <div className="space-y-3">
              <p className="font-mono text-[0.6rem] font-medium opacity-40 uppercase tracking-[0.1em]">Pending Training (Saba)</p>

              {saba.result && sabaRows.length > 0 && (
                <>
                  {dueSoonCount > 0 && (
                    <p className="text-xs opacity-50">{dueSoonCount} due within 30 days</p>
                  )}
                  <div className="overflow-x-auto border border-base-300">
                    <table className="table table-sm w-full">
                      <thead>
                        <tr className="font-mono text-[0.6rem] uppercase tracking-[0.1em] opacity-50">
                          <th>Course</th><th>Type</th><th>Status</th><th>Due</th><th>Urgency</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sabaRows.map((row, i) => (
                          <tr key={i} className="hover">
                            <td className={`font-medium text-sm ${row.isOverdue ? 'text-error' : ''}`}>{row.title ?? '—'}</td>
                            <td className="font-mono text-xs opacity-60">{row.type ?? '—'}</td>
                            <td className="text-xs opacity-70">{row.status ?? '—'}</td>
                            <td className="font-mono text-xs">{row.dueDate || '—'}</td>
                            <td><span className={urgencyBadge(row)}>{urgencyLabel(row)}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              {saba.result && sabaRows.length === 0 && !saba.error && (
                <p className="text-xs opacity-40">You're all caught up.</p>
              )}

              {!saba.result && !saba.error && !saba.running && (
                <p className="text-xs opacity-40">Click Generate above to fetch your pending Saba training.</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
