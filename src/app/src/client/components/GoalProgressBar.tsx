import type { PaceStatus } from '../lib/goals';

const statusColors: Record<PaceStatus, string> = {
  reached: 'bg-success',
  on_track: 'bg-success',
  behind: 'bg-warning',
  at_risk: 'bg-error',
};

export function GoalProgressBar({
  percentage,
  status,
  className = '',
}: {
  percentage: number;
  status: PaceStatus;
  className?: string;
}) {
  const clamped = Math.min(100, Math.max(0, percentage));
  return (
    <div className={`h-2 bg-base-300 ${className}`}>
      <div
        className={`h-full ${statusColors[status]} transition-[width] duration-150`}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
