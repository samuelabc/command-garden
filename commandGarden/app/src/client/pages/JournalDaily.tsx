import { useState, useMemo } from 'react';
import { useApprovalRun } from '../hooks/useApprovalRun';
import { api, type Goal } from '../api';
import { Spinner } from '../components/Spinner';
import { AuthRequiredCallout } from '../components/AuthRequiredCallout';

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

function workingDaysInMonth(month: string): number {
  const [y, m] = month.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  let count = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const day = new Date(y, m - 1, d).getDay();
    if (day !== 0 && day !== 6) count++;
  }
  return count;
}

interface TtRawRow { date?: string; status?: string; [key: string]: unknown }

interface ReleaseSummary {
  workingDaysTotal: number;
  workingDaysElapsed: number;
  releasedDates: string[];
  unreleasedDates: string[];
}

function computeReleaseSummary(raw: TtRawRow[], month: string): ReleaseSummary {
  const today = localToday();
  const [y, m] = month.split('-').map(Number);
  const todayDate = new Date(today + 'T00:00:00');
  const daysInMonth = new Date(y, m, 0).getDate();

  const workingDatesElapsed: string[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(y, m - 1, d);
    if (date > todayDate) break;
    const day = date.getDay();
    if (day !== 0 && day !== 6) {
      workingDatesElapsed.push(`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
    }
  }

  const releasedDateSet = new Set(
    raw
      .filter((r) => r.date && r.status && /released/i.test(String(r.status)))
      .map((r) => r.date as string),
  );

  const releasedDates = workingDatesElapsed.filter((d) => releasedDateSet.has(d));
  const unreleasedDates = workingDatesElapsed.filter((d) => !releasedDateSet.has(d));

  return {
    workingDaysTotal: workingDaysInMonth(month),
    workingDaysElapsed: workingDatesElapsed.length,
    releasedDates,
    unreleasedDates,
  };
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

export default function JournalDaily() {
  const [month] = useState(currentMonth());
  const [goals, setGoals] = useState<Goal[]>([]);

  const tt = useApprovalRun();
  const saba = useApprovalRun();

  function load() {
    tt.reset();
    saba.reset();
    setGoals([]);
    tt.run('timetracking/report', { month });
    saba.run('saba/pending-training', {});
    api.getGoals(month).then((r) => setGoals(r.goals)).catch(() => {});
  }

  const ttRaw = useMemo(
    () => (tt.result?.data ?? null) as TtRawRow[] | null,
    [tt.result],
  );

  const release = useMemo(
    () => (ttRaw ? computeReleaseSummary(ttRaw, month) : null),
    [ttRaw, month],
  );

  const hoursByProject = useMemo(() => {
    const map = new Map<string, number>();
    if (ttRaw) {
      for (const row of ttRaw) {
        const pid = typeof row.projectId === 'string' ? row.projectId : null;
        const hrs = typeof row.hours === 'number' ? row.hours : 0;
        if (pid) map.set(pid, (map.get(pid) ?? 0) + hrs);
      }
    }
    return map;
  }, [ttRaw]);

  const sabaRows = useMemo(
    () => (saba.result?.data ?? []) as { title?: string; type?: string; status?: string; dueDate?: string; daysUntilDue?: number; isOverdue?: boolean }[],
    [saba.result],
  );

  const sabaAuthRequired = typeof saba.error === 'string' &&
    (saba.error.toLowerCase().includes('auth_required') || saba.error.toLowerCase().includes('sign in'));

  const ttAuthRequired = typeof tt.error === 'string' &&
    (tt.error.toLowerCase().includes('auth_required') || tt.error.toLowerCase().includes('sign in'));

  const isLoading = tt.running || saba.running;
  const hasData = tt.result !== null || saba.result !== null;

  return (
    <div className="space-y-8 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-xl font-bold uppercase tracking-[0.06em]">Daily Check-in</h2>
          <p className="text-sm opacity-40 mt-0.5">{formatMonth(month)}</p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={load} disabled={isLoading}>
          {isLoading ? 'Loading…' : hasData ? 'Refresh' : 'Load'}
        </button>
      </div>

      {isLoading && !tt.approvalPending && !saba.approvalPending && (
        <Spinner label="Fetching time tracking and Saba training…" />
      )}

      {/* ── Time Tracking ── */}
      <section className="space-y-4">
        <h3 className="font-mono text-[0.65rem] font-medium opacity-50 uppercase tracking-[0.12em]">Time Tracking</h3>

        {tt.approvalPending && (
          <div className="alert alert-warning">
            <span>Time tracking requires approval.</span>
            <div className="flex gap-2">
              <button className="btn btn-sm btn-success" onClick={() => tt.handleApproval(true)} disabled={!tt.approvalId}>Approve</button>
              <button className="btn btn-sm btn-error" onClick={() => tt.handleApproval(false)} disabled={!tt.approvalId}>Reject</button>
            </div>
          </div>
        )}

        {ttAuthRequired && <AuthRequiredCallout message="Sign in to the timetracking portal in Chrome, then try again." />}

        {tt.error && !ttAuthRequired && (
          <div className="alert alert-error text-sm"><span>{tt.error}</span></div>
        )}

        {release && (
          <>
            <div className="grid grid-cols-4 border border-base-300">
              <div className="p-3 border-r border-base-300">
                <div className="font-mono text-[0.6rem] font-medium opacity-40 uppercase tracking-[0.1em] mb-1">Working days</div>
                <div className="font-display text-xl font-bold">{release.workingDaysTotal}</div>
                <div className="text-xs opacity-40">in month</div>
              </div>
              <div className="p-3 border-r border-base-300">
                <div className="font-mono text-[0.6rem] font-medium opacity-40 uppercase tracking-[0.1em] mb-1">Elapsed</div>
                <div className="font-display text-xl font-bold">{release.workingDaysElapsed}</div>
                <div className="text-xs opacity-40">so far</div>
              </div>
              <div className="p-3 border-r border-base-300">
                <div className="font-mono text-[0.6rem] font-medium opacity-40 uppercase tracking-[0.1em] mb-1">Released</div>
                <div className="font-display text-xl font-bold text-success">{release.releasedDates.length}</div>
                <div className="text-xs opacity-40">days</div>
              </div>
              <div className="p-3">
                <div className="font-mono text-[0.6rem] font-medium opacity-40 uppercase tracking-[0.1em] mb-1">Unreleased</div>
                <div className={`font-display text-xl font-bold ${release.unreleasedDates.length > 0 ? 'text-error' : 'text-success'}`}>
                  {release.unreleasedDates.length}
                </div>
                <div className="text-xs opacity-40">to action</div>
              </div>
            </div>

            {release.unreleasedDates.length > 0 && (
              <div className="border border-base-300 p-4 space-y-2">
                <p className="font-mono text-[0.6rem] font-medium opacity-40 uppercase tracking-[0.1em]">Unreleased dates</p>
                <div className="flex flex-wrap gap-2">
                  {release.unreleasedDates.map((d) => (
                    <span key={d} className="badge badge-error badge-outline badge-sm">{formatDate(d)}</span>
                  ))}
                </div>
              </div>
            )}

            {release.unreleasedDates.length === 0 && (
              <div className="border border-base-300 p-4 text-center">
                <p className="text-sm text-success font-medium">All days released ✓</p>
              </div>
            )}
          </>
        )}

        {release && goals.length > 0 && (
          <div className="border border-base-300 p-4 space-y-3">
            <p className="font-mono text-[0.65rem] font-medium opacity-50 uppercase tracking-[0.12em]">Goals Progress</p>
            <div className="space-y-3">
              {goals.map((goal) => {
                const logged = Math.round((hoursByProject.get(goal.projectId) ?? 0) * 100) / 100;
                const remaining = Math.round((goal.targetHours - logged) * 100) / 100;
                const pct = Math.min(100, Math.round((logged / goal.targetHours) * 100));
                const achieved = remaining <= 0;
                return (
                  <div key={goal.id} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{goal.projectId}</span>
                      <span className={`font-mono text-xs ${achieved ? 'text-success' : 'text-warning'}`}>
                        {achieved ? '✓ Goal met' : `${remaining}h to go`}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <progress
                        className={`progress flex-1 ${achieved ? 'progress-success' : 'progress-warning'}`}
                        value={pct}
                        max={100}
                      />
                      <span className="font-mono text-xs opacity-50 w-24 text-right">
                        {logged}h / {goal.targetHours}h
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {ttRaw === null && !tt.error && !tt.running && (
          <div className="border border-base-300 p-6 text-center">
            <p className="text-sm opacity-40">Click Load to check your time tracking status.</p>
            <p className="font-mono text-xs opacity-25 mt-1">Drives your browser — sign in to the portal first.</p>
          </div>
        )}
      </section>

      {/* ── Saba Training ── */}
      <section className="space-y-4">
        <h3 className="font-mono text-[0.65rem] font-medium opacity-50 uppercase tracking-[0.12em]">Pending Training (Saba)</h3>

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

        {saba.result && sabaRows.length > 0 && (
          <>
            <div className="grid grid-cols-3 border border-base-300">
              <div className="p-3 border-r border-base-300">
                <div className="font-mono text-[0.6rem] font-medium opacity-40 uppercase tracking-[0.1em] mb-1">Pending</div>
                <div className="font-display text-xl font-bold">{sabaRows.length}</div>
              </div>
              <div className="p-3 border-r border-base-300">
                <div className="font-mono text-[0.6rem] font-medium opacity-40 uppercase tracking-[0.1em] mb-1">Overdue</div>
                <div className={`font-display text-xl font-bold ${sabaRows.filter(r => r.isOverdue).length > 0 ? 'text-error' : ''}`}>
                  {sabaRows.filter(r => r.isOverdue).length}
                </div>
              </div>
              <div className="p-3">
                <div className="font-mono text-[0.6rem] font-medium opacity-40 uppercase tracking-[0.1em] mb-1">Due ≤ 30d</div>
                <div className={`font-display text-xl font-bold ${sabaRows.filter(r => !r.isOverdue && typeof r.daysUntilDue === 'number' && r.daysUntilDue <= 30).length > 0 ? 'text-warning' : ''}`}>
                  {sabaRows.filter(r => !r.isOverdue && typeof r.daysUntilDue === 'number' && r.daysUntilDue <= 30).length}
                </div>
              </div>
            </div>

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
          <div className="border border-base-300 p-6 text-center">
            <p className="text-sm text-success font-medium">No pending training ✓</p>
            <p className="font-mono text-xs opacity-30 mt-0.5">You're all caught up.</p>
          </div>
        )}

        {!saba.result && !saba.error && !saba.running && (
          <div className="border border-base-300 p-6 text-center">
            <p className="text-sm opacity-40">Click Load to fetch your pending Saba training.</p>
            <p className="font-mono text-xs opacity-25 mt-1">Requires an active Saba Cloud session in Chrome.</p>
          </div>
        )}
      </section>
    </div>
  );
}
