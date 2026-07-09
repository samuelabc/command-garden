'use client';
import { useState } from 'react';
import { api } from '@/lib/api';
import type { JournalResponse } from '@/lib/types';
import { Spinner } from '@/components/Spinner';
import { SummaryCards } from '@/components/journal/SummaryCards';
import { DailyBreakdown } from '@/components/journal/DailyBreakdown';
import { InsightsPanel } from '@/components/journal/InsightsPanel';

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

export default function WeeklyJournalPage() {
  const [weekStart, setWeekStart] = useState(currentSunday());
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<JournalResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setLoading(true);
    setError(null);
    setData(null);
    try {
      setData(await api.generateJournal({ weekStart }));
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
      <div className="flex items-center gap-3">
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
          Generate
        </button>
      </div>

      {/* Loading */}
      {loading && <Spinner label="Gathering data from TimeTracking, Outlook, Jira, Git…" />}

      {/* Error */}
      {error && (
        <div role="alert" className="alert alert-error">
          <span>{error}</span>
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
