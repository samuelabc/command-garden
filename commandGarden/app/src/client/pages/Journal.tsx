/**
 * Dev Work Journal page — week picker + generate button + results display.
 * Ported from dashboard/web/app/journal/page.tsx.
 * Removed 'use client' directive, uses commandGarden api.ts helper,
 * and DaisyUI loading spinner instead of Next.js Spinner component.
 */

import { useState } from 'react';
import { api } from '../api';
import type { JournalResponse } from '../types/journal';
import { SummaryCards } from '../components/journal/SummaryCards';
import { DailyBreakdown } from '../components/journal/DailyBreakdown';
import { InsightsPanel } from '../components/journal/InsightsPanel';

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

export default function Journal() {
  const [weekStart, setWeekStart] = useState(currentSunday());
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<JournalResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);

  async function generate() {
    setLoading(true);
    setError(null);
    setData(null);
    setElapsedMs(null);
    const t0 = Date.now();
    try {
      const result = await api.generateJournal({ weekStart });
      setElapsedMs(Date.now() - t0);
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <h1 className="text-2xl font-bold">Dev Work Journal</h1>

      {/* Week selector + generate button */}
      <div className="flex flex-wrap items-center gap-3">
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

      {/* Loading state */}
      {loading && (
        <div className="flex items-center gap-3 text-base-content/60">
          <span className="loading loading-spinner loading-md"></span>
          <span>Gathering data from Git, Outlook, Jira…</span>
        </div>
      )}

      {/* Fatal error (request failed entirely) */}
      {error && (
        <div role="alert" className="alert alert-error">
          <span>{error}</span>
        </div>
      )}

      {/* Partial-data warning (some sources failed but others returned data) */}
      {data?.status === 'partial' && (
        <div role="alert" className="alert alert-warning text-sm">
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
          <SummaryCards data={data} />
          <DailyBreakdown data={data} />
          <InsightsPanel insights={data.insights} errors={data.errors} />
        </div>
      )}

      {data?.status === 'error' && (
        <div role="alert" className="alert alert-error">
          <span>Failed to generate journal. {data.errors.join('; ')}</span>
        </div>
      )}
    </div>
  );
}
