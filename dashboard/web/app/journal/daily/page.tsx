'use client';
import { useState } from 'react';
import { api } from '@/lib/api';
import type { TtReportResponse, SabaPendingTrainingResponse, TtRow } from '@/lib/types';
import { Spinner } from '@/components/Spinner';
import { AuthRequiredCallout } from '@/components/AuthRequiredCallout';
import { workingDaysInMonth, workingDaysElapsed } from '@/lib/goals';

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

interface ReleaseSummary {
  workingDaysTotal: number;
  workingDaysElapsed: number;
  releasedDates: string[];
  unreleasedDates: string[];
}

function computeReleaseSummary(raw: TtRow[], month: string): ReleaseSummary {
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
      const ds = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      workingDatesElapsed.push(ds);
    }
  }

  const releasedDateSet = new Set(
    raw
      .filter((r) => r.date && r.status && /released/i.test(r.status))
      .map((r) => r.date!),
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
  if (row.daysUntilDue === 9999 || row.daysUntilDue == null) return 'No deadline';
  if (row.daysUntilDue === 0) return 'Due today';
  if (row.daysUntilDue === 1) return 'Due tomorrow';
  return `${row.daysUntilDue}d left`;
}

export default function DailyJournalPage() {
  const [month] = useState(currentMonth());
  const [loading, setLoading] = useState(false);
  const [ttData, setTtData] = useState<TtReportResponse | null>(null);
  const [sabaData, setSabaData] = useState<SabaPendingTrainingResponse | null>(null);
  const [ttError, setTtError] = useState<string | null>(null);
  const [sabaError, setSabaError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setTtError(null);
    setSabaError(null);
    setTtData(null);
    setSabaData(null);

    const [ttResult, sabaResult] = await Promise.allSettled([
      api.timetrackingReport({ month }),
      api.sabaPendingTraining(),
    ]);

    if (ttResult.status === 'fulfilled') {
      setTtData(ttResult.value);
    } else {
      setTtError(ttResult.reason instanceof Error ? ttResult.reason.message : 'Failed to load time tracking');
    }

    if (sabaResult.status === 'fulfilled') {
      setSabaData(sabaResult.value);
    } else {
      setSabaError(sabaResult.reason instanceof Error ? sabaResult.reason.message : 'Failed to load Saba training');
    }

    setLoading(false);
  }

  const release = ttData?.status === 'success' ? computeReleaseSummary(ttData.raw, month) : null;
  const ttAuthRequired = ttData?.status === 'auth_required';
  const sabaAuthRequired = sabaData?.status === 'auth_required' || (sabaError && /auth_required/i.test(sabaError));

  return (
    <div className="space-y-8 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Daily Check-in</h1>
          <p className="text-sm opacity-50 mt-0.5">{formatMonth(month)}</p>
        </div>
        <button className="btn btn-primary" onClick={load} disabled={loading}>
          {loading ? 'Loading…' : (ttData || sabaData) ? 'Refresh' : 'Load'}
        </button>
      </div>

      {loading && <Spinner label="Fetching time tracking and Saba training…" />}

      {/* ── Time Tracking ── */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold border-b border-base-300 pb-1">Time Tracking</h2>

        {ttAuthRequired && <AuthRequiredCallout message={ttData?.errorMessage} />}
        {ttError && !ttAuthRequired && (
          <div role="alert" className="alert alert-error"><span>{ttError}</span></div>
        )}

        {release && (
          <>
            <div className="grid grid-cols-4 border border-base-300">
              <div className="p-3 border-r border-base-300">
                <div className="font-mono text-[0.6rem] font-medium opacity-40 uppercase tracking-[0.1em] mb-1">Working days</div>
                <div className="text-xl font-bold">{release.workingDaysTotal}</div>
                <div className="text-xs opacity-40">in {formatMonth(month)}</div>
              </div>
              <div className="p-3 border-r border-base-300">
                <div className="font-mono text-[0.6rem] font-medium opacity-40 uppercase tracking-[0.1em] mb-1">Elapsed so far</div>
                <div className="text-xl font-bold">{release.workingDaysElapsed}</div>
                <div className="text-xs opacity-40">working days</div>
              </div>
              <div className="p-3 border-r border-base-300">
                <div className="font-mono text-[0.6rem] font-medium opacity-40 uppercase tracking-[0.1em] mb-1">Released</div>
                <div className="text-xl font-bold text-success">{release.releasedDates.length}</div>
                <div className="text-xs opacity-40">days</div>
              </div>
              <div className="p-3">
                <div className="font-mono text-[0.6rem] font-medium opacity-40 uppercase tracking-[0.1em] mb-1">Unreleased</div>
                <div className={`text-xl font-bold ${release.unreleasedDates.length > 0 ? 'text-error' : 'text-success'}`}>
                  {release.unreleasedDates.length}
                </div>
                <div className="text-xs opacity-40">days to release</div>
              </div>
            </div>

            {release.unreleasedDates.length > 0 && (
              <div className="border border-base-300 p-4 space-y-2">
                <p className="font-mono text-[0.65rem] font-medium opacity-50 uppercase tracking-[0.1em]">
                  Unreleased dates
                </p>
                <div className="flex flex-wrap gap-2">
                  {release.unreleasedDates.map((d) => (
                    <span key={d} className="badge badge-error badge-outline">{formatDate(d)}</span>
                  ))}
                </div>
              </div>
            )}

            {release.unreleasedDates.length === 0 && (
              <div className="border border-base-300 p-4 text-center">
                <p className="text-sm text-success font-medium">All days released</p>
                <p className="font-mono text-xs opacity-30 mt-0.5">Nothing left to action.</p>
              </div>
            )}
          </>
        )}

        {release && ttData!.goals.length > 0 && (() => {
          const hoursByProject = new Map<string, number>();
          for (const g of ttData!.aggregated) {
            hoursByProject.set(g.projectId, (hoursByProject.get(g.projectId) ?? 0) + g.totalHours);
          }
          return (
            <div className="border border-base-300 p-4 space-y-3">
              <p className="font-mono text-[0.65rem] font-medium opacity-50 uppercase tracking-[0.1em]">Goals Progress</p>
              <div className="space-y-3">
                {ttData!.goals.map((goal) => {
                  const logged = Math.round((hoursByProject.get(goal.projectId) ?? 0) * 100) / 100;
                  const remaining = Math.round((goal.targetHours - logged) * 100) / 100;
                  const pct = Math.min(100, Math.round((logged / goal.targetHours) * 100));
                  const achieved = remaining <= 0;
                  return (
                    <div key={goal.projectId} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium">{goal.projectId}</span>
                        <span className={`font-mono text-xs ${achieved ? 'text-success' : 'text-warning'}`}>
                          {achieved ? '✓ Goal met' : `${remaining}h remaining`}
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
          );
        })()}

        {ttData?.status === 'empty' && (
          <div className="alert"><span>No time tracking entries found for {formatMonth(month)}.</span></div>
        )}

        {!ttData && !ttError && !loading && (
          <div className="border border-base-300 p-6 text-center">
            <p className="text-sm opacity-40">Click Load to fetch your time tracking data.</p>
          </div>
        )}
      </section>

      {/* ── Saba Training ── */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold border-b border-base-300 pb-1">Pending Training (Saba)</h2>

        {sabaAuthRequired && <AuthRequiredCallout message={typeof sabaAuthRequired === 'string' ? sabaAuthRequired : undefined} />}
        {sabaError && !sabaAuthRequired && (
          <div role="alert" className="alert alert-error"><span>{sabaError}</span></div>
        )}

        {sabaData && sabaData.status === 'success' && (
          <>
            <div className="grid grid-cols-3 border border-base-300">
              <div className="p-3 border-r border-base-300">
                <div className="font-mono text-[0.6rem] font-medium opacity-40 uppercase tracking-[0.1em] mb-1">Pending</div>
                <div className="text-xl font-bold">{sabaData.items.length}</div>
              </div>
              <div className="p-3 border-r border-base-300">
                <div className="font-mono text-[0.6rem] font-medium opacity-40 uppercase tracking-[0.1em] mb-1">Overdue</div>
                <div className={`text-xl font-bold ${sabaData.overdueCount > 0 ? 'text-error' : ''}`}>{sabaData.overdueCount}</div>
              </div>
              <div className="p-3">
                <div className="font-mono text-[0.6rem] font-medium opacity-40 uppercase tracking-[0.1em] mb-1">Due ≤ 30d</div>
                <div className={`text-xl font-bold ${sabaData.dueSoonCount > 0 ? 'text-warning' : ''}`}>{sabaData.dueSoonCount}</div>
              </div>
            </div>

            {sabaData.items.length > 0 ? (
              <div className="overflow-x-auto border border-base-300">
                <table className="table table-sm w-full">
                  <thead>
                    <tr className="font-mono text-[0.6rem] uppercase tracking-[0.1em] opacity-50">
                      <th>Course</th>
                      <th>Type</th>
                      <th>Status</th>
                      <th>Due</th>
                      <th>Urgency</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sabaData.items.map((row, i) => (
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
            ) : (
              <div className="border border-base-300 p-6 text-center">
                <p className="text-sm text-success font-medium">No pending training</p>
                <p className="font-mono text-xs opacity-30 mt-0.5">You're all caught up.</p>
              </div>
            )}
          </>
        )}

        {!sabaData && !sabaError && !loading && (
          <div className="border border-base-300 p-6 text-center">
            <p className="text-sm opacity-40">Click Load to fetch your pending Saba training.</p>
          </div>
        )}
      </section>
    </div>
  );
}
