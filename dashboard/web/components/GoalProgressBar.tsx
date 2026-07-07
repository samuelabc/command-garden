import type { PaceStatus } from '@/lib/goals';

const GRADIENT: Record<PaceStatus, string> = {
  reached: 'from-emerald-400 to-green-500',
  on_track: 'from-emerald-400 to-green-500',
  behind: 'from-amber-300 to-yellow-500',
  at_risk: 'from-rose-400 to-red-500',
};

export function GoalProgressBar({ percentage, status, className = '' }: { percentage: number; status: PaceStatus; className?: string }) {
  const clamped = Math.min(percentage, 100);

  return (
    <div
      className={`relative h-2 rounded-full bg-base-300 overflow-hidden ${className}`}
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={`h-full rounded-full bg-gradient-to-r ${GRADIENT[status]} transition-[width] duration-500 ease-out`}
        style={{ width: `${clamped}%` }}
      />
      {clamped > 0 && (
        <div
          className="absolute inset-0 rounded-full pointer-events-none"
          style={{
            width: `${clamped}%`,
            background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.3) 50%, transparent 100%)',
            backgroundSize: '200% 100%',
            animation: 'shimmer 2s ease-in-out infinite',
          }}
        />
      )}
    </div>
  );
}
