import type { TimelineRow } from '@/lib/types';

const STATE_BADGE: Record<string, string> = {
  free: 'badge-success',
  busy: 'badge-error',
  tentative: 'badge-warning',
  oof: 'badge-secondary',
  elsewhere: 'badge-info',
};

export function TimelineView({ rows }: { rows: TimelineRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="table">
        <thead><tr><th>Start</th><th>End</th><th>State</th><th className="text-right">Minutes</th></tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td>{r.start}</td>
              <td>{r.end}</td>
              <td><span className={`badge ${STATE_BADGE[r.state ?? ''] ?? 'badge-ghost'}`}>{r.state}</span></td>
              <td className="text-right">{r.durationMin}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
