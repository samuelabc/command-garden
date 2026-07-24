interface GoalSummaryStatsProps {
  onTrack: number;
  total: number;
  bookedHours: number;
  targetHours: number;
  workingDaysLeft: number;
  avgHoursPerDay: number;
}

export function GoalSummaryStats({
  onTrack,
  total,
  bookedHours,
  targetHours,
  workingDaysLeft,
  avgHoursPerDay,
}: GoalSummaryStatsProps) {
  const hasGoals = total > 0;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 border border-base-300 mb-6">
      {/* Goals on track */}
      <div className="p-3 border-r border-b border-base-300 md:border-b-0">
        <div className="font-mono text-[0.6rem] font-medium opacity-40 uppercase tracking-[0.1em] mb-1">
          Goals on track
        </div>
        <div className="font-display text-xl font-bold">
          {hasGoals ? (
            <>
              <span className={onTrack === total ? 'text-success' : onTrack > 0 ? '' : 'text-warning'}>
                {onTrack}
              </span>
              <span className="opacity-40">/{total}</span>
            </>
          ) : (
            <span className="opacity-30">&mdash;</span>
          )}
        </div>
      </div>

      {/* Hours booked */}
      <div className="p-3 border-b border-base-300 md:border-r md:border-b-0">
        <div className="font-mono text-[0.6rem] font-medium opacity-40 uppercase tracking-[0.1em] mb-1">
          Hours booked
        </div>
        <div className="font-display text-xl font-bold">
          {hasGoals && targetHours > 0 ? (
            <>
              {Math.round(bookedHours * 10) / 10}
              <span className="opacity-40">/{targetHours}h</span>
            </>
          ) : (
            <span className="opacity-30">&mdash;</span>
          )}
        </div>
      </div>

      {/* Working days left */}
      <div className="p-3 border-r border-base-300">
        <div className="font-mono text-[0.6rem] font-medium opacity-40 uppercase tracking-[0.1em] mb-1">
          Working days left
        </div>
        <div className="font-display text-xl font-bold">
          {workingDaysLeft}
        </div>
      </div>

      {/* Pace needed */}
      <div className="p-3">
        <div className="font-mono text-[0.6rem] font-medium opacity-40 uppercase tracking-[0.1em] mb-1">
          Pace needed
        </div>
        <div className="font-display text-xl font-bold">
          {hasGoals && avgHoursPerDay > 0 ? (
            <span className={avgHoursPerDay > 8 ? 'text-error' : avgHoursPerDay > 6 ? 'text-warning' : ''}>
              {Math.round(avgHoursPerDay * 10) / 10}h<span className="text-sm font-medium opacity-50">/day</span>
            </span>
          ) : hasGoals ? (
            <span className="text-success">0h</span>
          ) : (
            <span className="opacity-30">&mdash;</span>
          )}
        </div>
      </div>
    </div>
  );
}
