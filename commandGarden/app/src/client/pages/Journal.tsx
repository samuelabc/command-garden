/**
 * Dev Work Journal page — week picker + generate button + results display.
 * Ported from dashboard/web/app/journal/page.tsx.
 * Removed 'use client' directive, uses commandGarden api.ts helper,
 * and DaisyUI loading spinner instead of Next.js Spinner component.
 */

import { useState } from 'react';
import { ChevronLeft, ChevronRight, Sparkles, Clock, CalendarDays, Ticket, GitBranch, GraduationCap, CalendarRange } from 'lucide-react';
import { api, type Goal } from '../api';
import type { JournalResponse } from '../types/journal';
import { useApprovalRun } from '../hooks/useApprovalRun';
import { SummaryCards } from '../components/journal/SummaryCards';
import { DailyBreakdown } from '../components/journal/DailyBreakdown';
import { InsightsPanel } from '../components/journal/InsightsPanel';
import { MonthlyStatus } from '../components/journal/MonthlyStatus';

type SourceKey = 'timetracking' | 'meetings' | 'jira' | 'git' | 'saba';

/** Metadata for the source toggle chips — icon + label, in display order. */
const SOURCE_META: { key: SourceKey; label: string; icon: typeof Clock }[] = [
  { key: 'timetracking', label: 'Timetracking', icon: Clock },
  { key: 'meetings', label: 'Meetings', icon: CalendarDays },
  { key: 'jira', label: 'Jira', icon: Ticket },
  { key: 'git', label: 'ADO (Git)', icon: GitBranch },
  { key: 'saba', label: 'Saba Training', icon: GraduationCap },
];

/** Format a Date as YYYY-MM-DD in the user's local timezone.
 *  (toISOString() uses UTC which shifts dates for UTC+ timezones.) */
function localISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Get the Monday of the current week as YYYY-MM-DD. */
function currentMonday(): string {
  const d = new Date();
  const day = d.getDay(); // 0 = Sunday .. 6 = Saturday
  const diff = day === 0 ? -6 : 1 - day; // shift back to Monday
  d.setDate(d.getDate() + diff);
  return localISO(d);
}

function addWeeks(dateStr: string, weeks: number): string {
  const d = new Date(dateStr + 'T00:00:00'); // parse as local time, not UTC
  d.setDate(d.getDate() + weeks * 7);
  return localISO(d);
}

function formatWeekLabel(monday: string): string {
  const start = new Date(monday + 'T00:00:00'); // parse as local time
  const end = new Date(start);
  end.setDate(end.getDate() + 4); // Mon–Fri, weekends excluded from the displayed range
  const fmt = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  return `${fmt(start)} – ${fmt(end)}, ${start.getFullYear()}`;
}

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function Journal() {
  const [weekStart, setWeekStart] = useState(currentMonday());
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

  const isCurrentWeek = weekStart === currentMonday();
  const anySourceSelected = Object.values(sources).some(Boolean);
  const selectedSourceLabels = SOURCE_META.filter((s) => sources[s.key]).map((s) => s.label);

  async function generate() {
    setLoading(true);
    setError(null);
    setData(null);
    setElapsedMs(null);
    saba.reset();
    setGoals([]);
    const t0 = Date.now();

    // Fire goals + Saba training off immediately so they run in parallel
    // with the weekly journal fetch below, instead of waiting for it.
    if (sources.timetracking) {
      api.getGoals(month).then((r) => setGoals(r.goals)).catch(() => {});
    }
    if (sources.saba) {
      saba.run('saba/pending-training', {});
    }

    try {
      const result = await api.generateJournal({ weekStart, sources });
      setElapsedMs(Date.now() - t0);
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h2 className="font-display text-xl font-bold uppercase tracking-[0.06em] flex items-center gap-2">
          <CalendarRange className="w-5 h-5 opacity-50" aria-hidden="true" />
          Dev Work Journal
        </h2>
        <p className="text-sm opacity-50 mt-1">
          Pulls your week's activity from the sources below so you can spot gaps before your report is due.
        </p>
      </div>

      {/* Control panel — week picker, source toggles, generate */}
      <div className="border border-base-300 p-4 mb-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1">
            <button
              className="btn btn-sm btn-ghost btn-square"
              onClick={() => setWeekStart(addWeeks(weekStart, -1))}
              disabled={loading}
              aria-label="Previous week"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="text-center min-w-[170px]">
              <div className="font-medium leading-tight">{formatWeekLabel(weekStart)}</div>
              <div className="font-mono text-[0.6rem] uppercase tracking-[0.1em] text-primary/70 h-4">
                {isCurrentWeek ? 'This week' : '\u00A0'}
              </div>
            </div>
            <button
              className="btn btn-sm btn-ghost btn-square"
              onClick={() => setWeekStart(addWeeks(weekStart, 1))}
              disabled={loading}
              aria-label="Next week"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            {!isCurrentWeek && (
              <button
                className="btn btn-xs btn-ghost ml-1"
                onClick={() => setWeekStart(currentMonday())}
                disabled={loading}
              >
                Today
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            {elapsedMs !== null && !loading && (
              <span className="font-mono text-[0.65rem] opacity-40">
                Generated in {(elapsedMs / 1000).toFixed(1)}s
              </span>
            )}
            <button
              className="btn btn-primary gap-2"
              onClick={generate}
              disabled={loading || !anySourceSelected}
              title={!anySourceSelected ? 'Select at least one source first' : undefined}
            >
              {loading ? (
                <>
                  <span className="loading loading-spinner loading-xs"></span>
                  Generating…
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Generate
                </>
              )}
            </button>
          </div>
        </div>

        <div className="border-t border-base-300 pt-3">
          <div className="font-mono text-[0.6rem] font-medium opacity-40 uppercase tracking-[0.1em] mb-2">Sources</div>
          <div className="flex flex-wrap gap-2">
            {SOURCE_META.map(({ key, label, icon: Icon }) => {
              const active = sources[key];
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => toggleSource(key)}
                  disabled={loading}
                  aria-pressed={active}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 border text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                    active
                      ? 'border-primary text-primary bg-primary/10'
                      : 'border-base-300 text-base-content/40 hover:text-base-content/70 hover:border-base-content/30'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" aria-hidden="true" />
                  {label}
                </button>
              );
            })}
          </div>
          {!anySourceSelected && (
            <p className="text-xs text-warning mt-2">Select at least one source to generate a journal.</p>
          )}
        </div>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="flex items-center gap-3 text-base-content/60 mb-4 border border-base-300 p-3">
          <span className="loading loading-spinner loading-md"></span>
          <span className="text-sm">Gathering data from {selectedSourceLabels.join(', ')}…</span>
        </div>
      )}

      {/* Empty state — nothing generated yet */}
      {!data && !loading && !error && (
        <div className="border border-dashed border-base-300 p-8 text-center mb-6">
          <Sparkles className="w-6 h-6 mx-auto opacity-30 mb-2" aria-hidden="true" />
          <p className="text-sm opacity-50">Pick a week and hit Generate to build your journal.</p>
        </div>
      )}

      {/* Fatal error (request failed entirely) */}
      {error && (
        <div role="alert" className="alert alert-error mb-4">
          <span>{error}</span>
        </div>
      )}

      {/* Month-to-date Status — a compact, collapsed-by-default strip above
          the weekly breakdown so it's never missed, without competing with
          the weekly view for attention. */}
      <MonthlyStatus
        month={month}
        monthly={data?.monthlyTimetracking ?? null}
        goals={goals}
        saba={saba}
        enabled={{ timetracking: sources.timetracking, saba: sources.saba }}
      />

      <div className="h-6" />

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
    </div>
  );
}
