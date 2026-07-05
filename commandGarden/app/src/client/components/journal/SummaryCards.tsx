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
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Hours Logged — with progress bar */}
      <div className="stat bg-base-200 rounded-box p-4">
        <div className="stat-title text-xs">Hours Logged</div>
        <div className={`stat-value text-2xl ${hoursBelowTarget ? 'text-warning' : 'text-success'}`}>
          {timetracking ? `${timetracking.totalHours}h` : '—'}
        </div>
        <div className="stat-desc">/ {timetracking?.targetHours ?? 40}h target</div>
        {timetracking && (
          <progress
            className={`progress ${hoursBelowTarget ? 'progress-warning' : 'progress-success'} w-full mt-1`}
            value={hoursRatio}
            max={100}
          />
        )}
      </div>

      {/* Meetings — with avg duration */}
      <div className="stat bg-base-200 rounded-box p-4">
        <div className="stat-title text-xs">Meetings</div>
        <div className={`stat-value text-2xl ${meetings && meetings.totalHours > 20 ? 'text-warning' : 'text-info'}`}>
          {meetings ? String(meetings.totalCount) : '—'}
        </div>
        <div className="stat-desc">
          {meetings ? `${meetings.totalHours}h · avg ${meetings.avgDurationMin}min` : ''}
        </div>
      </div>

      {/* Tickets Done — with blocker warning */}
      <div className="stat bg-base-200 rounded-box p-4">
        <div className="stat-title text-xs">Tickets Done</div>
        <div className="stat-value text-2xl text-accent">
          {jira ? String(jira.resolved.length) : '—'}
        </div>
        <div className="stat-desc">
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
      <div className="stat bg-base-200 rounded-box p-4">
        <div className="stat-title text-xs">Commits</div>
        <div className="stat-value text-2xl text-primary">
          {git ? String(git.totalCommits) : '—'}
        </div>
        <div className="stat-desc">
          {git ? `${git.totalPRsMerged} PRs · ${repoCount} repo${repoCount !== 1 ? 's' : ''}` : ''}
        </div>
      </div>
    </div>
  );
}
