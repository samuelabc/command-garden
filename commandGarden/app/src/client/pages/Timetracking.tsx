import { useState, useCallback } from 'react';
import { Badge } from '../components/Badge';
import { Spinner } from '../components/Spinner';
import { AuthRequiredCallout } from '../components/AuthRequiredCallout';
import { useApprovalRun } from '../hooks/useApprovalRun';

interface ProjectGroup {
  projectId: string;
  totalHours: number;
  entryCount: number;
  categories: Set<string>;
}

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function Timetracking() {
  const [month, setMonth] = useState(currentMonth());
  const [showRaw, setShowRaw] = useState(false);
  const { running, result, error, approvalPending, approvalId, run, handleApproval } = useApprovalRun();

  const handleRun = useCallback(async () => {
    const args: Record<string, string> = {};
    if (month) args.month = month;
    await run('timetracking/report', args);
  }, [month, run]);

  const rows = result?.data ?? [];
  const isAuthRequired = error?.includes('auth_required') || error?.includes('sign in');

  // Group by project
  const groups = new Map<string, ProjectGroup>();
  let totalHours = 0;
  let draftCount = 0;
  const workingDays = new Set<string>();

  for (const row of rows) {
    const pid = String(row.projectId ?? 'Unknown');
    const hours = Number(row.hours ?? 0);
    const date = String(row.date ?? '');
    const status = String(row.status ?? '');
    const category = String(row.category ?? '');

    totalHours += hours;
    if (date) workingDays.add(date);
    if (status === 'draft') draftCount++;

    if (!groups.has(pid)) {
      groups.set(pid, { projectId: pid, totalHours: 0, entryCount: 0, categories: new Set() });
    }
    const g = groups.get(pid)!;
    g.totalHours += hours;
    g.entryCount++;
    if (category) g.categories.add(category);
  }

  const projectList = Array.from(groups.values()).sort((a, b) => b.totalHours - a.totalHours);

  return (
    <div className="max-w-4xl mx-auto">
      <h2 className="font-display text-xl font-bold uppercase tracking-[0.06em] mb-5">Time Tracking</h2>

      <div className="flex items-end gap-4 mb-6">
        <label className="form-control">
          <span className="font-mono text-[0.6rem] font-medium opacity-40 uppercase tracking-[0.1em] mb-1">Month</span>
          <input
            type="month"
            className="input input-bordered input-sm"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />
        </label>
        <button className="btn btn-primary btn-sm" onClick={handleRun} disabled={running}>
          {running ? 'Loading...' : 'Load report'}
        </button>
      </div>

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

      {result && rows.length > 0 && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 border border-base-300 mb-6">
            <div className="p-3 border-r border-b border-base-300 md:border-b-0">
              <div className="font-mono text-[0.6rem] font-medium opacity-40 uppercase tracking-[0.1em] mb-1">Total hours</div>
              <div className="font-display text-xl font-bold">{totalHours.toFixed(1)}</div>
            </div>
            <div className="p-3 border-b border-base-300 md:border-r md:border-b-0">
              <div className="font-mono text-[0.6rem] font-medium opacity-40 uppercase tracking-[0.1em] mb-1">Working days</div>
              <div className="font-display text-xl font-bold">{workingDays.size}</div>
            </div>
            <div className="p-3 border-r border-base-300">
              <div className="font-mono text-[0.6rem] font-medium opacity-40 uppercase tracking-[0.1em] mb-1">Projects</div>
              <div className="font-display text-xl font-bold">{groups.size}</div>
            </div>
            <div className="p-3">
              <div className="font-mono text-[0.6rem] font-medium opacity-40 uppercase tracking-[0.1em] mb-1">Draft entries</div>
              <div className="font-display text-xl font-bold">{draftCount}</div>
            </div>
          </div>

          <h3 className="font-display text-base font-semibold mb-3">By project</h3>
          <div className="overflow-x-auto border border-base-300 mb-6">
            <table className="table table-sm">
              <thead><tr><th>Project</th><th>Categories</th><th className="text-right">Hours</th><th className="text-right">Entries</th></tr></thead>
              <tbody>
                {projectList.map((g) => (
                  <tr key={g.projectId}>
                    <td className="font-mono text-sm">{g.projectId}</td>
                    <td className="text-sm">{Array.from(g.categories).join(', ')}</td>
                    <td className="text-right font-semibold">{g.totalHours.toFixed(1)}</td>
                    <td className="text-right">{g.entryCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <details open={showRaw} onToggle={(e) => setShowRaw((e.target as HTMLDetailsElement).open)}>
            <summary className="cursor-pointer text-sm font-semibold mb-2">Raw booking lines ({rows.length})</summary>
            <div className="overflow-x-auto">
              <table className="table table-xs">
                <thead><tr><th>Date</th><th>Project</th><th>Category</th><th>Activity</th><th className="text-right">Hours</th><th>Status</th></tr></thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i}>
                      <td>{String(r.date ?? '')}</td>
                      <td className="font-mono text-xs">{String(r.projectId ?? '')}</td>
                      <td>{String(r.category ?? '')}</td>
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

      {result && rows.length === 0 && !error && (
        <p className="text-sm opacity-50">No entries found for {month}.</p>
      )}
    </div>
  );
}
