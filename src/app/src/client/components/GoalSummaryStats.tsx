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
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-4">
      {/* Goals on track */}
      <div className="flex items-center gap-1.5">
        <span className="font-mono text-[0.6rem] font-medium opacity-40 uppercase tracking-[0.08em]">Goals</span>
        {hasGoals ? (
          <span className="font-mono text-xs font-semibold">
            <span className={onTrack === total ? 'text-success' : onTrack > 0 ? '' : 'text-warning'}>{onTrack}</span>
            <span className="opacity-40">/{total} on track</span>
          </span>
        ) : (
          <span className="font-mono text-xs opacity-30">&mdash;</span>
        )}
      </div>

      <span className="opacity-20 select-none">|</span>

      {/* Hours booked */}
      <div className="flex items-center gap-1.5">
        <span className="font-mono text-[0.6rem] font-medium opacity-40 uppercase tracking-[0.08em]">Booked</span>
        {hasGoals && targetHours > 0 ? (
          <span className="font-mono text-xs font-semibold">
            {Math.round(bookedHours * 10) / 10}
            <span className="opacity-40">/{targetHours}h</span>
          </span>
        ) : (
          <span className="font-mono text-xs opacity-30">&mdash;</span>
        )}
      </div>

      <span className="opacity-20 select-none">|</span>

      {/* Working days left */}
      <div className="flex items-center gap-1.5">
        <span className="font-mono text-[0.6rem] font-medium opacity-40 uppercase tracking-[0.08em]">Days left</span>
        <span className="font-mono text-xs font-semibold">{workingDaysLeft}</span>
      </div>

      <span className="opacity-20 select-none">|</span>

      {/* Avg hours/day needed */}
      <div className="flex items-center gap-1.5">
        <span className="font-mono text-[0.6rem] font-medium opacity-40 uppercase tracking-[0.08em]">Need</span>
        {hasGoals && avgHoursPerDay > 0 ? (
          <span className={`font-mono text-xs font-semibold ${
            avgHoursPerDay > 8 ? 'text-error' : avgHoursPerDay > 6 ? 'text-warning' : ''
          }`}>
            {Math.round(avgHoursPerDay * 10) / 10}h/day
          </span>
        ) : hasGoals ? (
          <span className="font-mono text-xs font-semibold text-success">0h/day</span>
        ) : (
          <span className="font-mono text-xs opacity-30">&mdash;</span>
        )}
      </div>
    </div>
  );
}
