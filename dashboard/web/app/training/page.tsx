'use client';
import { useState } from 'react';
import { api } from '@/lib/api';
import type { SabaPendingTrainingResponse, SabaTrainingRow } from '@/lib/types';
import { Spinner } from '@/components/Spinner';
import { AuthRequiredCallout } from '@/components/AuthRequiredCallout';

function urgencyBadge(row: SabaTrainingRow) {
  if (row.isOverdue) {
    return <span className="badge badge-error badge-sm">Overdue</span>;
  }
  const d = row.daysUntilDue ?? 9999;
  if (d <= 7) return <span className="badge badge-warning badge-sm">{d}d left</span>;
  if (d <= 30) return <span className="badge badge-info badge-sm">{d}d left</span>;
  if (d < 9999) return <span className="badge badge-ghost badge-sm">{d}d left</span>;
  return <span className="badge badge-ghost badge-sm">No deadline</span>;
}

function rowBg(row: SabaTrainingRow) {
  if (row.isOverdue) return 'bg-error/10';
  const d = row.daysUntilDue ?? 9999;
  if (d <= 7) return 'bg-warning/10';
  if (d <= 30) return 'bg-info/10';
  return '';
}

function SummaryBar({ data }: { data: SabaPendingTrainingResponse }) {
  return (
    <div className="stats shadow w-full">
      <div className="stat">
        <div className="stat-title">Pending</div>
        <div className="stat-value text-2xl">{data.items.length}</div>
        <div className="stat-desc">training items</div>
      </div>
      <div className="stat">
        <div className="stat-title">Overdue</div>
        <div className="stat-value text-2xl text-error">{data.overdueCount}</div>
        <div className="stat-desc">need immediate action</div>
      </div>
      <div className="stat">
        <div className="stat-title">Due soon</div>
        <div className="stat-value text-2xl text-warning">{data.dueSoonCount}</div>
        <div className="stat-desc">within 30 days</div>
      </div>
    </div>
  );
}

export default function TrainingPage() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<SabaPendingTrainingResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    setData(null);
    try {
      setData(await api.sabaPendingTraining());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Mandatory Training</h1>
        <button className="btn btn-primary" onClick={run} disabled={loading}>
          {loading ? 'Fetching…' : 'Refresh'}
        </button>
      </div>

      <p className="text-sm opacity-60">
        Fetches pending mandatory learning plan items from Saba Cloud. Opens your browser to
        daimler.sabacloud.com — you must be logged in.
      </p>

      {loading && <Spinner label="Opening Saba Cloud in your browser…" />}
      {error && (
        <div role="alert" className="alert alert-error">
          <span>{error}</span>
        </div>
      )}
      {data?.status === 'auth_required' && (
        <AuthRequiredCallout message={data.errorMessage} />
      )}
      {data?.status === 'empty' && (
        <div className="alert alert-success">
          <span>🎉 No pending mandatory training — all clear!</span>
        </div>
      )}
      {data?.status === 'success' && (
        <>
          <SummaryBar data={data} />
          {data.items.length === 0 ? (
            <div className="alert alert-success">
              <span>🎉 No pending mandatory training — all clear!</span>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="table table-zebra w-full">
                <thead>
                  <tr>
                    <th>Training</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Due date</th>
                    <th>Urgency</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((row, i) => (
                    <tr key={i} className={rowBg(row)}>
                      <td className="font-medium">{row.title || '—'}</td>
                      <td className="text-sm opacity-70">{row.type || '—'}</td>
                      <td>
                        <span className="badge badge-outline badge-sm">
                          {row.status || '—'}
                        </span>
                      </td>
                      <td className="font-mono text-sm">{row.dueDate || '—'}</td>
                      <td>{urgencyBadge(row)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
