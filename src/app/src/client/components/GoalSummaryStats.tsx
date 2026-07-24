interface GoalSummaryStatsProps {
  onTrack: number;
  total: number;
  bookedHours: number;
  targetHours: number;
  workingDaysLeft: number;
  avgHoursPerDay: number;
}

function statusTint(onTrack: number, total: number): string {
  if (total === 0) return '';
  const ratio = onTrack / total;
  if (ratio >= 1) return 'bg-success/10';
  if (ratio >= 0.5) return 'bg-success/5';
  return 'bg-warning/10';
}

export function GoalSummaryStats({
  onTrack,
  total,
  bookedHours,
  targetHours,
  workingDaysLeft,
  avgHoursPerDay,
}: GoalSummaryStatsProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 border border-base-300 mb-6">
      <div className={`p-3 border-r border-b border-base-300 md:border-b-0 ${statusTint(onTrack, total)}`}>
        <div className="font-mono text-[0.6rem] font-medium opacity-40 uppercase tracking-[0.1em] mb-1">Goals on track</div>
        <div className="font-display text-xl font-bold">
          {total > 0 ? (
            <>
              <span className={onTrack === total ? 'text-success' : onTrack > 0 ? '' : 'text-warning'}>{onTrack}</span>
              <span className="opacity-40">/{total}</span>
            </>
          ) : (
            <span className="opacity-30">&mdash;</span>
          )}
        </div>
      </div>
      <div className="p-3 border-b border-base-300 md:border-r md:border-b-0">
        <div className="font-mono text-[0.6rem] font-medium opacity-40 uppercase tracking-[0.1em] mb-1" title="Total hours booked across all goals">Hours booked</div>
        <div className="font-display text-xl font-bold">
          {targetHours > 0 ? (
            <>
              {Math.round(bookedHours * 10) / 10}
              <span className="opacity-40">/{targetHours}h</span>
            </>
          ) : (
            <span className="opacity-30">&mdash;</span>
          )}
        </div>
      </div>
      <div className="p-3 border-r border-base-300">
        <div className="font-mono text-[0.6rem] font-medium opacity-40 uppercase tracking-[0.1em] mb-1">Working days left</div>
        <div className="font-display text-xl font-bold">{workingDaysLeft}</div>
      </div>
      <div className="p-3">
        <div className="font-mono text-[0.6rem] font-medium opacity-40 uppercase tracking-[0.1em] mb-1" title="Sum of remaining hours across all goals divided by working days left">Avg hours/day needed</div>
        <div className="font-display text-xl font-bold">
          {total > 0 && avgHoursPerDay > 0 ? (
            <span className={avgHoursPerDay > 8 ? 'text-error' : avgHoursPerDay > 6 ? 'text-warning' : ''}>
              {Math.round(avgHoursPerDay * 10) / 10}h
            </span>
          ) : total > 0 ? (
            <span className="text-success">0h</span>
          ) : (
            <span className="opacity-30">&mdash;</span>
          )}
        </div>
      </div>
    </div>
  );
}
