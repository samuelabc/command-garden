import type { PaceStatus } from '@/lib/goals';

const COLOR: Record<PaceStatus, string> = {
  reached: 'progress-success',
  on_track: 'progress-success',
  behind: 'progress-warning',
  at_risk: 'progress-error',
};

export function GoalProgressBar({ percentage, status, className = '' }: { percentage: number; status: PaceStatus; className?: string }) {
  return (
    <progress
      className={`progress ${COLOR[status]} ${className}`}
      value={Math.min(percentage, 100)}
      max={100}
    />
  );
}
