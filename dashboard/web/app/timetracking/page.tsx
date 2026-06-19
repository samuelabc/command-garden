'use client';
import { useState } from 'react';
import { api } from '@/lib/api';
import type { TtReportResponse } from '@/lib/types';
import { Spinner } from '@/components/Spinner';
import { AuthRequiredCallout } from '@/components/AuthRequiredCallout';
import { TimetrackingTable } from '@/components/TimetrackingTable';
import { GoalCards } from '@/components/GoalCards';
import { ManageGoals } from '@/components/ManageGoals';

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function TimetrackingPage() {
  const [month, setMonth] = useState(currentMonth());
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<TtReportResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true); setError(null); setData(null);
    try {
      setData(await api.timetrackingReport({ month }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  async function refreshGoals() {
    if (!data) return;
    try {
      const goals = await api.getGoals(month);
      setData({ ...data, goals });
    } catch { /* silent */ }
  }

  const knownProjects = data ? [...new Set(data.aggregated.map((g) => g.projectId))] : [];
  const todayStr = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6 max-w-4xl">
      <h1 className="text-2xl font-bold">Time Tracking</h1>
      <div className="flex items-end gap-3">
        <label className="form-control">
          <span className="label-text mb-1">Month</span>
          <input type="month" className="input input-bordered" value={month} onChange={(e) => setMonth(e.target.value)} />
        </label>
        <button className="btn btn-primary" onClick={run} disabled={loading}>Run report</button>
      </div>

      {loading && <Spinner label="Fetching report (this drives your browser)…" />}
      {error && <div role="alert" className="alert alert-error"><span>{error}</span></div>}
      {data?.status === 'auth_required' && <AuthRequiredCallout message={data.errorMessage} />}
      {data?.status === 'empty' && <div className="alert"><span>No booking lines for {month}.</span></div>}
      {data?.status === 'success' && (
        <>
          <GoalCards goals={data.goals} aggregated={data.aggregated} month={month} today={todayStr} />
          <TimetrackingTable data={data} month={month} />
          <ManageGoals goals={data.goals} month={month} onGoalChange={refreshGoals} knownProjects={knownProjects} />
        </>
      )}
    </div>
  );
}
