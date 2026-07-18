import { useMemo } from 'react';
import { Spinner } from '../components/Spinner';
import { AuthRequiredCallout } from '../components/AuthRequiredCallout';
import { useApprovalRun } from '../hooks/useApprovalRun';

interface TrainingRow {
  title: string;
  type: string;
  status: string;
  dueDate: string;
  daysUntilDue: number;
  isOverdue: boolean;
}

function urgencyClass(row: TrainingRow): string {
  if (row.isOverdue) return 'text-error';
  if (row.daysUntilDue <= 7) return 'text-warning';
  if (row.daysUntilDue <= 30) return 'text-info';
  return '';
}

function urgencyBadge(row: TrainingRow): string {
  if (row.isOverdue) return 'badge badge-error badge-sm';
  if (row.daysUntilDue <= 7) return 'badge badge-warning badge-sm';
  if (row.daysUntilDue <= 30) return 'badge badge-info badge-sm';
  return 'badge badge-ghost badge-sm';
}

function urgencyLabel(row: TrainingRow): string {
  if (row.isOverdue) return 'Overdue';
  if (row.daysUntilDue === 9999) return 'No deadline';
  if (row.daysUntilDue === 0) return 'Due today';
  if (row.daysUntilDue === 1) return 'Due tomorrow';
  return `${row.daysUntilDue}d left`;
}

export default function Saba() {
  const { running, result, error, approvalPending, approvalId, run, handleApproval } = useApprovalRun();

  const rows: TrainingRow[] = useMemo(() =>
    (result?.data ?? []).map((r) => ({
      title: String(r.title ?? ''),
      type: String(r.type ?? ''),
      status: String(r.status ?? ''),
      dueDate: String(r.dueDate ?? ''),
      daysUntilDue: Number(r.daysUntilDue ?? 9999),
      isOverdue: Boolean(r.isOverdue),
    })),
    [result]
  );

  const stats = useMemo(() => {
    if (rows.length === 0) return null;
    return {
      total: rows.length,
      overdue: rows.filter((r) => r.isOverdue).length,
      dueSoon: rows.filter((r) => !r.isOverdue && r.daysUntilDue <= 30).length,
    };
  }, [rows]);

  const isAuthRequired = typeof error === 'string' && (error.toLowerCase().includes('auth_required') || error.toLowerCase().includes('sign in'));

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <h2 className="font-display text-xl font-bold uppercase tracking-[0.06em]">Pending Training</h2>
        <button
          className="btn btn-primary btn-sm"
          onClick={() => run('saba/pending-training', {})}
          disabled={running}
        >
          {running ? 'Fetching...' : result ? 'Refresh' : 'Fetch from Saba'}
        </button>
      </div>

      {running && !approvalPending && <Spinner label="Fetching pending training from Saba Cloud..." />}

      {approvalPending && (
        <div className="alert alert-warning mb-4">
          <span>This connector requires approval before proceeding.</span>
          <div className="flex gap-2">
            <button className="btn btn-sm btn-success" onClick={() => handleApproval(true)} disabled={!approvalId}>Approve</button>
            <button className="btn btn-sm btn-error" onClick={() => handleApproval(false)} disabled={!approvalId}>Reject</button>
          </div>
        </div>
      )}

      {isAuthRequired && (
        <AuthRequiredCallout message="Sign in to Saba Cloud (daimler.sabacloud.com) in Chrome, then try again." />
      )}

      {error && !isAuthRequired && (
        <div className="alert alert-error mb-4 whitespace-pre-wrap font-mono text-xs"><span>{error}</span></div>
      )}

      {stats && (
        <div className="grid grid-cols-3 border border-base-300 mb-6">
          <div className="p-3 border-r border-base-300">
            <div className="font-mono text-[0.6rem] font-medium opacity-40 uppercase tracking-[0.1em] mb-1">Pending</div>
            <div className="font-display text-xl font-bold">{stats.total}</div>
          </div>
          <div className="p-3 border-r border-base-300">
            <div className="font-mono text-[0.6rem] font-medium opacity-40 uppercase tracking-[0.1em] mb-1">Overdue</div>
            <div className={`font-display text-xl font-bold ${stats.overdue > 0 ? 'text-error' : ''}`}>{stats.overdue}</div>
          </div>
          <div className="p-3">
            <div className="font-mono text-[0.6rem] font-medium opacity-40 uppercase tracking-[0.1em] mb-1">Due ≤ 30d</div>
            <div className={`font-display text-xl font-bold ${stats.dueSoon > 0 ? 'text-warning' : ''}`}>{stats.dueSoon}</div>
          </div>
        </div>
      )}

      {rows.length > 0 && (
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
              {rows.map((row, i) => (
                <tr key={i} className="hover">
                  <td className={`font-medium text-sm ${urgencyClass(row)}`}>{row.title}</td>
                  <td className="font-mono text-xs opacity-60">{row.type}</td>
                  <td className="text-xs opacity-70">{row.status}</td>
                  <td className="font-mono text-xs">{row.dueDate || '—'}</td>
                  <td><span className={urgencyBadge(row)}>{urgencyLabel(row)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {result && rows.length === 0 && !error && (
        <div className="border border-base-300 p-6 text-center">
          <p className="text-sm opacity-50 mb-1">No pending mandatory training</p>
          <p className="font-mono text-xs opacity-30">You're all caught up.</p>
        </div>
      )}

      {!result && !running && !error && (
        <div className="border border-base-300 p-8 text-center">
          <p className="text-sm opacity-50 mb-1">Click "Fetch from Saba" to load your pending training</p>
          <p className="font-mono text-xs opacity-30">Requires an active Saba Cloud session in Chrome.</p>
        </div>
      )}
    </div>
  );
}
