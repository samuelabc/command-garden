interface TimelineRow {
  start?: string;
  end?: string;
  state?: string;
  durationMin?: number;
}

const STATE_BADGE: Record<string, string> = {
  free: 'badge-success',
  busy: 'badge-error',
  tentative: 'badge-warning',
  oof: 'badge-secondary',
  elsewhere: 'badge-info',
};

const STATE_COLOR: Record<string, string> = {
  free: 'bg-success/20 border border-success/40',
  busy: 'bg-error/20 border border-error/40',
  tentative: 'bg-warning/20 border border-warning/40',
  oof: 'bg-secondary/20 border border-secondary/40',
  elsewhere: 'bg-info/20 border border-info/40',
};

export function TimelineView({ rows }: { rows: TimelineRow[] }) {
  const totalMin = rows.reduce((sum, r) => sum + (r.durationMin ?? 0), 0);

  return (
    <div>
      {totalMin > 0 && (
        <div className="flex h-8 rounded overflow-hidden mb-4 gap-px">
          {rows.map((r, i) => {
            const pct = totalMin > 0 ? ((r.durationMin ?? 0) / totalMin) * 100 : 0;
            if (pct < 0.5) return null;
            return (
              <div
                key={i}
                className={`${STATE_COLOR[r.state ?? ''] ?? 'bg-base-300'} flex items-center justify-center text-xs`}
                style={{ width: `${pct}%` }}
                title={`${r.state}: ${r.start}\u2013${r.end} (${r.durationMin}min)`}
              >
                {pct > 8 && <span className="opacity-60 truncate px-1">{r.state}</span>}
              </div>
            );
          })}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="table table-sm">
          <thead><tr><th>Start</th><th>End</th><th>State</th><th className="text-right">Minutes</th></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td>{r.start}</td>
                <td>{r.end}</td>
                <td><span className={`badge badge-sm ${STATE_BADGE[r.state ?? ''] ?? 'badge-ghost'}`}>{r.state}</span></td>
                <td className="text-right">{r.durationMin}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
