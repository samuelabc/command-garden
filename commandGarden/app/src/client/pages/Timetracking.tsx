import { useState, useCallback } from 'react';
import { api, type RunResponse } from '../api';
import { Spinner } from '../components/Spinner';
import { AuthRequiredCallout } from '../components/AuthRequiredCallout';

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
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RunResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState(false);

  const handleRun = useCallback(async () => {
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const args: Record<string, string> = {};
      if (month) args.month = month;
      const resp = await api.run('timetracking/report', args);
      if (!resp.ok && resp.error) {
        setError(resp.error);
      } else {
        setResult(resp);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setRunning(false);
    }
  }, [month]);

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
    <div className="max-w-4xl">
      <h2 className="text-2xl font-bold mb-6">Time Tracking</h2>

      <div className="flex items-end gap-4 mb-6">
        <label className="form-control">
          <span className="label-text mb-1 text-sm">Month</span>
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

      {running && <Spinner label="Fetching timetracking data..." />}

      {isAuthRequired && (
        <AuthRequiredCallout message="Sign in to the timetracking portal in Chrome, then try again." />
      )}

      {error && !isAuthRequired && (
        <div className="alert alert-error mb-4"><span>{error}</span></div>
      )}

      {result && rows.length > 0 && (
        <>
          <div className="grid grid-cols-4 gap-4 mb-6">
            <div className="bg-base-200 rounded-lg p-4">
              <div className="text-sm opacity-60 mb-1">Total hours</div>
              <div className="text-2xl font-bold">{totalHours.toFixed(1)}</div>
            </div>
            <div className="bg-base-200 rounded-lg p-4">
              <div className="text-sm opacity-60 mb-1">Working days</div>
              <div className="text-2xl font-bold">{workingDays.size}</div>
            </div>
            <div className="bg-base-200 rounded-lg p-4">
              <div className="text-sm opacity-60 mb-1">Projects</div>
              <div className="text-2xl font-bold">{groups.size}</div>
            </div>
            <div className="bg-base-200 rounded-lg p-4">
              <div className="text-sm opacity-60 mb-1">Draft entries</div>
              <div className="text-2xl font-bold">{draftCount}</div>
            </div>
          </div>

          <h3 className="text-lg font-semibold mb-3">By project</h3>
          <div className="overflow-x-auto mb-6">
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
                        <span className={`badge badge-xs ${String(r.status) === 'posted' ? 'badge-success' : 'badge-warning'}`}>
                          {String(r.status ?? '')}
                        </span>
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
