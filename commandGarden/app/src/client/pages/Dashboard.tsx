import { useEffect, useState, useCallback } from 'react';
import { api, type AuditEvent } from '../api';
import { Badge, type BadgeVariant } from '../components/Badge';

export default function Dashboard() {
  const [status, setStatus] = useState<{ ok: boolean; extensionConnected: boolean; connectorCount: number } | null>(null);
  const [events, setEvents] = useState<AuditEvent[]>([]);

  const load = useCallback(() => {
    api.getStatus().then(setStatus).catch(() => setStatus(null));
    api.getAudit({ limit: '10' }).then((d) => setEvents(d.events)).catch(() => {});
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [load]);

  function timeAgo(ts: string): string {
    const diff = Date.now() - new Date(ts).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins} min ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs} hr ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  }

  const typeBadge: Record<string, BadgeVariant> = {
    'command.success': 'success',
    'command.error': 'error',
    'command.denied': 'error',
    'command.start': 'neutral',
    'auth.failed': 'warning',
    'approval.granted': 'success',
    'approval.rejected': 'error',
    'config.changed': 'neutral',
  };

  return (
    <div className="max-w-4xl">
      <h2 className="text-2xl font-bold mb-6">Dashboard</h2>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div className="bg-base-200 rounded-lg p-4">
          <div className="text-xs font-medium text-base-content/60 mb-1">Daemon</div>
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${status?.ok ? 'bg-success' : 'bg-error'}`} aria-hidden="true" />
            <span className="font-semibold">{status?.ok ? 'Running' : 'Offline'}</span>
          </div>
        </div>
        <div className="bg-base-200 rounded-lg p-4">
          <div className="text-xs font-medium text-base-content/60 mb-1">Chrome Extension</div>
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${status?.extensionConnected ? 'bg-success' : 'bg-error'}`} aria-hidden="true" />
            <span className="font-semibold">{status?.extensionConnected ? 'Connected' : 'Disconnected'}</span>
          </div>
        </div>
        <div className="bg-base-200 rounded-lg p-4">
          <div className="text-xs font-medium text-base-content/60 mb-1">Connectors</div>
          <div className="font-semibold">{status?.connectorCount ?? 0} loaded</div>
        </div>
      </div>

      <h3 className="text-lg font-semibold mb-3">Recent activity</h3>
      {events.length === 0 ? (
        <div className="bg-base-200 rounded-lg p-6 text-center">
          <p className="text-sm opacity-60 mb-1">No recent activity</p>
          <p className="text-xs opacity-40">Run a connector to see events here.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="table table-sm">
            <thead><tr><th>Time</th><th>Connector</th><th>Type</th><th>Duration</th></tr></thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id}>
                  <td className="opacity-60 text-sm">{timeAgo(e.timestamp)}</td>
                  <td className="font-mono text-sm">{e.connector}</td>
                  <td><Badge variant={typeBadge[e.type] ?? 'neutral'}>{e.type}</Badge></td>
                  <td className="text-sm">{e.durationMs ? `${(e.durationMs / 1000).toFixed(1)}s` : '\u2014'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
