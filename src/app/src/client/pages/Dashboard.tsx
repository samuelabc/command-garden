import { useEffect, useState, useCallback } from 'react';
import { api, type AuditEvent, EVENT_TYPE_BADGE } from '../api';
import { Badge } from '../components/Badge';

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

  return (
    <div className="max-w-4xl mx-auto">
      <h2 className="font-display text-xl font-bold uppercase tracking-[0.06em] mb-5">Dashboard</h2>

      {/* Status strip — three cells in a shared-border grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 border border-base-300 mb-8">
        <div className="p-3 sm:border-r sm:border-r-base-300">
          <div className="font-mono text-[0.6rem] font-medium opacity-40 uppercase tracking-[0.1em] mb-1">Daemon</div>
          <div className={`font-display font-semibold text-sm ${status?.ok ? 'text-success' : 'text-error'}`}>{status?.ok ? 'Running' : 'Offline'}</div>
        </div>
        <div className="p-3 border-t border-t-base-300 sm:border-t-0 sm:border-r sm:border-r-base-300">
          <div className="font-mono text-[0.6rem] font-medium opacity-40 uppercase tracking-[0.1em] mb-1">Extension</div>
          <div className={`font-display font-semibold text-sm ${status?.extensionConnected ? 'text-success' : 'text-error'}`}>{status?.extensionConnected ? 'Connected' : 'Disconnected'}</div>
        </div>
        <div className="p-3 border-t border-t-base-300 sm:border-t-0">
          <div className="font-mono text-[0.6rem] font-medium opacity-40 uppercase tracking-[0.1em] mb-1">Connectors</div>
          <div className="font-display font-semibold text-sm">{status?.connectorCount ?? 0} loaded</div>
        </div>
      </div>

      <h3 className="font-display text-base font-semibold mb-3">Recent activity</h3>
      {events.length === 0 ? (
        <div className="border border-base-300 p-6 text-center">
          <p className="text-sm opacity-50 mb-1">No recent activity</p>
          <p className="font-mono text-xs opacity-30">Run a connector to see events here.</p>
        </div>
      ) : (
        <div className="overflow-x-auto border border-base-300">
          <table className="table table-sm w-full">
            <thead><tr className="bg-base-200"><th>Time</th><th>Connector</th><th>Type</th><th>Duration</th></tr></thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id} className="hover:bg-base-200">
                  <td className="opacity-50 text-sm font-mono">{timeAgo(e.timestamp)}</td>
                  <td className="font-mono text-sm">{e.connector}</td>
                  <td><Badge variant={EVENT_TYPE_BADGE[e.type] ?? 'neutral'}>{e.type}</Badge></td>
                  <td className="text-sm font-mono">{e.durationMs ? `${(e.durationMs / 1000).toFixed(1)}s` : '\u2014'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
