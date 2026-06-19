import type { AuditItem } from '@/lib/types';

const STATUS_BADGE: Record<string, string> = {
  success: 'badge-success',
  error: 'badge-error',
  auth_required: 'badge-warning',
  empty: 'badge-ghost',
};

export function AuditTable({ items, total }: { items: AuditItem[]; total: number }) {
  return (
    <div className="space-y-2">
      <p className="text-sm text-base-content/60">{total} total entries</p>
      <div className="overflow-x-auto">
        <table className="table table-sm">
          <thead>
            <tr><th>Time</th><th>Command</th><th>Status</th><th className="text-right">Duration</th><th className="text-right">Rows</th><th>Error</th></tr>
          </thead>
          <tbody>
            {items.map((a) => (
              <tr key={a.id}>
                <td className="whitespace-nowrap">{new Date(a.timestamp).toLocaleString()}</td>
                <td>{a.command}</td>
                <td><span className={`badge badge-sm ${STATUS_BADGE[a.status] ?? ''}`}>{a.status}</span></td>
                <td className="text-right">{a.durationMs} ms</td>
                <td className="text-right">{a.rowCount}</td>
                <td className="text-xs opacity-70">{a.errorCode ?? ''} {a.errorMessage ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
