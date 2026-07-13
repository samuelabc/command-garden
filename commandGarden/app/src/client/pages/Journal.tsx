/**
 * Dev Work Journal page — week picker + generate button + results display.
 * Ported from dashboard/web/app/journal/page.tsx.
 * Removed 'use client' directive, uses commandGarden api.ts helper,
 * and DaisyUI loading spinner instead of Next.js Spinner component.
 */

import { useState } from 'react';
import { api, type Goal } from '../api';
import type { JournalResponse } from '../types/journal';
import { useApprovalRun } from '../hooks/useApprovalRun';
import { SummaryCards } from '../components/journal/SummaryCards';
import { DailyBreakdown } from '../components/journal/DailyBreakdown';
import { InsightsPanel } from '../components/journal/InsightsPanel';
import { MonthlyStatus } from '../components/journal/MonthlyStatus';

/** Format a Date as YYYY-MM-DD in the user's local timezone.
 *  (toISOString() uses UTC which shifts dates for UTC+ timezones.) */
function localISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Get the Sunday of the current week as YYYY-MM-DD. */
function currentSunday(): string {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay()); // getDay() returns 0 for Sunday
  return localISO(d);
}

function addWeeks(dateStr: string, weeks: number): string {
  const d = new Date(dateStr + 'T00:00:00'); // parse as local time, not UTC
  d.setDate(d.getDate() + weeks * 7);
  return localISO(d);
}

function formatWeekLabel(sunday: string): string {
  const start = new Date(sunday + 'T00:00:00'); // parse as local time
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const fmt = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  return `${fmt(start)} – ${fmt(end)}, ${start.getFullYear()}`;
}

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function Journal() {
  const [weekStart, setWeekStart] = useState(currentSunday());
  const [month] = useState(currentMonth());
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<JournalResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [sources, setSources] = useState({ timetracking: true, meetings: true, jira: true, git: true, saba: true });

  const saba = useApprovalRun();

  function toggleSource(key: keyof typeof sources) {
    setSources((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  async function generate() {
    setLoading(true);
    setError(null);
    setData(null);
    setElapsedMs(null);
    saba.reset();
    setGoals([]);
    const t0 = Date.now();
    try {
      const result = await api.generateJournal({ weekStart, sources });
      setElapsedMs(Date.now() - t0);
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }

    if (sources.timetracking) {
      api.getGoals(month).then((r) => setGoals(r.goals)).catch(() => {});
    }
    if (sources.saba) {
      saba.run('saba/pending-training', {});
    }
  }

  return (
    <div className="max-w-4xl mx-auto">
      <h2 className="font-display text-xl font-bold uppercase tracking-[0.06em] mb-5">Dev Work Journal</h2>

      {/* Week selector + generate button */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <button
          className="btn btn-sm btn-ghost"
          onClick={() => setWeekStart(addWeeks(weekStart, -1))}
          disabled={loading}
        >
          ◄
        </button>
        <span className="font-medium text-lg">{formatWeekLabel(weekStart)}</span>
        <button
          className="btn btn-sm btn-ghost"
          onClick={() => setWeekStart(addWeeks(weekStart, 1))}
          disabled={loading}
        >
          ►
        </button>
        <button className="btn btn-primary ml-4" onClick={generate} disabled={loading}>
          {loading ? (
            <>
              <span className="loading loading-spinner loading-xs"></span>
              Generating…
            </>
          ) : 'Generate'}
        </button>
        {/* Show elapsed time after generation completes */}
        {elapsedMs !== null && !loading && (
          <span className="text-xs text-base-content/40 ml-2">
            Generated in {(elapsedMs / 1000).toFixed(1)}s
          </span>
        )}
      </div>

      {/* Source selection checkboxes */}
      <div className="flex flex-wrap items-center gap-4 mb-6 text-sm">
        <span className="font-mono text-[0.6rem] font-medium opacity-50 uppercase tracking-[0.1em]">Sources</span>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input
            type="checkbox"
            className="checkbox checkbox-sm"
            checked={sources.timetracking}
            onChange={() => toggleSource('timetracking')}
            disabled={loading}
          />
          Timetracking
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input
            type="checkbox"
            className="checkbox checkbox-sm"
            checked={sources.meetings}
            onChange={() => toggleSource('meetings')}
            disabled={loading}
          />
          Meetings
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input
            type="checkbox"
            className="checkbox checkbox-sm"
            checked={sources.jira}
            onChange={() => toggleSource('jira')}
            disabled={loading}
          />
          Jira
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input
            type="checkbox"
            className="checkbox checkbox-sm"
            checked={sources.git}
            onChange={() => toggleSource('git')}
            disabled={loading}
          />
          ADO (Git)
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input
            type="checkbox"
            className="checkbox checkbox-sm"
            checked={sources.saba}
            onChange={() => toggleSource('saba')}
            disabled={loading}
          />
          Saba Training
        </label>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="flex items-center gap-3 text-base-content/60 mb-4">
          <span className="loading loading-spinner loading-md"></span>
          <span>Gathering data from selected sources…</span>
        </div>
      )}

      {/* Fatal error (request failed entirely) */}
      {error && (
        <div role="alert" className="alert alert-error mb-4">
          <span>{error}</span>
        </div>
      )}

      {/* Partial-data warning (some sources failed but others returned data) */}
      {data?.status === 'partial' && (
        <div role="alert" className="alert alert-warning text-sm mb-4">
          <div>
            <p className="font-semibold">Some data sources were unavailable. Results may be incomplete.</p>
            <ul className="list-disc list-inside mt-1">
              {data.errors.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Results */}
      {data && data.status !== 'error' && (
        <div className="space-y-6">
          <section className="space-y-4">
            <h3 className="font-mono text-[0.65rem] font-medium opacity-50 uppercase tracking-[0.12em]">Summary</h3>
            <SummaryCards data={data} />
          </section>
          <section className="space-y-4">
            <h3 className="font-mono text-[0.65rem] font-medium opacity-50 uppercase tracking-[0.12em]">Daily Breakdown</h3>
            <DailyBreakdown data={data} />
          </section>
          <section className="space-y-4">
            <InsightsPanel insights={data.insights} errors={data.errors} />
          </section>
        </div>
      )}

      {data?.status === 'error' && (
        <div role="alert" className="alert alert-error mb-4">
          <span>Failed to generate journal. {data.errors.join('; ')}</span>
        </div>
      )}

      <div className="divider" />

      <MonthlyStatus
        month={month}
        monthly={data?.monthlyTimetracking ?? null}
        goals={goals}
        saba={saba}
        enabled={{ timetracking: sources.timetracking, saba: sources.saba }}
      />
    </div>
  );
}
