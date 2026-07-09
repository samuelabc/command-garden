/**
 * Summary stat cards — shows Hours Logged, Meetings, Tickets Done, Commits.
 * Ported from dashboard/web/components/journal/SummaryCards.tsx.
 * Removed 'use client' directive (not needed in Vite React).
 */

import type { JournalResponse } from '../../types/journal';

interface Props {
  data: JournalResponse;
}

export function SummaryCards({ data }: Props) {
  const { timetracking, meetings, jira, git } = data;

  // Hours progress: ratio of logged vs target hours (capped at 100% for the bar)
  const hoursRatio = timetracking
    ? Math.min(100, Math.round((timetracking.totalHours / timetracking.targetHours) * 100))
    : 0;
  const hoursBelowTarget = timetracking && timetracking.totalHours < timetracking.targetHours * 0.8;

  // Blocker count for tickets subtitle
  const blockerCount = jira?.blockers.length ?? 0;

  // Repo count for commits subtitle
  const repoCount = git?.repos.length ?? 0;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 border border-base-300">
      {/* Hours Logged — with progress bar */}
      <div className="p-3 border-r border-b border-base-300 md:border-b-0">
        <div className="font-mono text-[0.6rem] font-medium opacity-40 uppercase tracking-[0.1em] mb-1">Hours Logged</div>
        <div className={`font-display text-xl font-bold ${hoursBelowTarget ? 'text-warning' : 'text-success'}`}>
          {timetracking ? `${timetracking.totalHours}h` : '—'}
        </div>
        <div className="text-xs opacity-40">/ {timetracking?.targetHours ?? 40}h target</div>
        {timetracking && (
          <progress
            className={`progress ${hoursBelowTarget ? 'progress-warning' : 'progress-success'} w-full mt-1`}
            value={hoursRatio}
            max={100}
          />
        )}
      </div>

      {/* Meetings — with avg duration */}
      <div className="p-3 border-b border-base-300 md:border-r md:border-b-0">
        <div className="font-mono text-[0.6rem] font-medium opacity-40 uppercase tracking-[0.1em] mb-1">Meetings</div>
        <div className={`font-display text-xl font-bold ${meetings && meetings.totalHours > 20 ? 'text-warning' : 'text-info'}`}>
          {meetings ? String(meetings.totalCount) : '—'}
        </div>
        <div className="text-xs opacity-40">
          {meetings ? `${meetings.totalHours}h · avg ${meetings.avgDurationMin}min` : ''}
        </div>
      </div>

      {/* Tickets Done — with blocker warning */}
      <div className="p-3 border-r border-base-300">
        <div className="font-mono text-[0.6rem] font-medium opacity-40 uppercase tracking-[0.1em] mb-1">Tickets Done</div>
        <div className="font-display text-xl font-bold text-accent">
          {jira ? String(jira.resolved.length) : '—'}
        </div>
        <div className="text-xs opacity-40">
          {jira ? (
            <>
              {jira.inProgress.length} in progress
              {blockerCount > 0 && (
                <span className="text-error font-semibold ml-1">· {blockerCount} blocked</span>
              )}
            </>
          ) : ''}
        </div>
      </div>

      {/* Commits — with repo count */}
      <div className="p-3">
        <div className="font-mono text-[0.6rem] font-medium opacity-40 uppercase tracking-[0.1em] mb-1">Commits</div>
        <div className="font-display text-xl font-bold text-primary">
          {git ? String(git.totalCommits) : '—'}
        </div>
        <div className="text-xs opacity-40">
          {git ? `${git.totalPRsMerged} PRs · ${repoCount} repo${repoCount !== 1 ? 's' : ''}` : ''}
        </div>
      </div>
    </div>
  );
}
