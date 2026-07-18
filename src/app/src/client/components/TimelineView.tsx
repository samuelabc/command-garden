import { useState } from 'react';
import { Badge, type BadgeVariant } from './Badge';

interface TimelineRow {
  start?: string;
  end?: string;
  state?: string;
  durationMin?: number;
}

const STATE_BADGE: Record<string, BadgeVariant> = {
  free: 'success',
  busy: 'error',
  tentative: 'warning',
  oof: 'secondary',
  elsewhere: 'info',
};

const STATE_COLOR: Record<string, string> = {
  free: 'bg-success/20 border-success/40',
  busy: 'bg-error/20 border-error/40',
  tentative: 'bg-warning/20 border-warning/40',
  oof: 'bg-secondary/20 border-secondary/40',
  elsewhere: 'bg-info/20 border-info/40',
};

const STATE_COLOR_HOVER: Record<string, string> = {
  free: 'bg-success/35 border-success/60',
  busy: 'bg-error/35 border-error/60',
  tentative: 'bg-warning/35 border-warning/60',
  oof: 'bg-secondary/35 border-secondary/60',
  elsewhere: 'bg-info/35 border-info/60',
};

function formatTime(t: string): string {
  // Expect "HH:MM" or "HH:MM:SS" or an ISO timestamp — extract HH:MM
  const match = t.match(/(\d{1,2}:\d{2})/);
  return match ? match[1] : t;
}

export function TimelineView({ rows }: { rows: TimelineRow[] }) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const totalMin = rows.reduce((sum, r) => sum + (r.durationMin ?? 0), 0);

  return (
    <div>
      {totalMin > 0 && (
        <div className="mb-6">
          {/* Timeline bar */}
          <div className="flex h-10 overflow-hidden gap-px border border-base-300">
            {rows.map((r, i) => {
              const pct = totalMin > 0 ? ((r.durationMin ?? 0) / totalMin) * 100 : 0;
              if (pct < 0.5) return null;
              const isHovered = hoveredIdx === i;
              const colorClass = isHovered
                ? (STATE_COLOR_HOVER[r.state ?? ''] ?? 'bg-base-300')
                : (STATE_COLOR[r.state ?? ''] ?? 'bg-base-300');
              return (
                <div
                  key={i}
                  className={`${colorClass} border flex items-center justify-center text-xs transition-colors duration-75 cursor-default relative`}
                  style={{ width: `${pct}%` }}
                  onMouseEnter={() => setHoveredIdx(i)}
                  onMouseLeave={() => setHoveredIdx(null)}
                >
                  {pct > 12 && (
                    <span className="opacity-60 truncate px-1 font-mono text-[0.65rem] uppercase tracking-wide">
                      {r.state}
                    </span>
                  )}
                  {/* Tooltip on hover */}
                  {isHovered && (
                    <div className="absolute -top-9 left-1/2 -translate-x-1/2 bg-base-300 border border-base-content/10 px-2 py-1 text-[0.65rem] font-mono whitespace-nowrap z-10 pointer-events-none">
                      {r.state}: {formatTime(r.start ?? '')}–{formatTime(r.end ?? '')} ({r.durationMin}m)
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {/* Time markers below the bar */}
          <div className="flex justify-between mt-1">
            <span className="font-mono text-[0.6rem] opacity-30">{formatTime(rows[0]?.start ?? '')}</span>
            <span className="font-mono text-[0.6rem] opacity-30">{formatTime(rows[rows.length - 1]?.end ?? '')}</span>
          </div>
        </div>
      )}

      <div className="overflow-x-auto border border-base-300">
        <table className="table table-sm">
          <thead>
            <tr>
              <th>Start</th>
              <th>End</th>
              <th>State</th>
              <th className="text-right">Duration</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr
                key={i}
                className={`transition-colors duration-75 ${hoveredIdx === i ? 'bg-base-200' : 'hover:bg-base-200'}`}
                onMouseEnter={() => setHoveredIdx(i)}
                onMouseLeave={() => setHoveredIdx(null)}
              >
                <td className="font-mono text-sm">{formatTime(r.start ?? '')}</td>
                <td className="font-mono text-sm">{formatTime(r.end ?? '')}</td>
                <td><Badge variant={STATE_BADGE[r.state ?? ''] ?? 'neutral'}>{r.state}</Badge></td>
                <td className="text-right font-mono text-sm">{r.durationMin}m</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 mt-3">
        {Object.entries(STATE_BADGE).map(([state, variant]) => (
          <div key={state} className="flex items-center gap-1.5">
            <Badge variant={variant} size="xs">{state}</Badge>
          </div>
        ))}
      </div>
    </div>
  );
}
