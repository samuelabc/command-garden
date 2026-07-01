import { useEffect, useState, useCallback } from 'react';
import { api, type AuditEvent, type Connector } from '../api';
import { Spinner } from '../components/Spinner';

const TIME_RANGES = [
  { label: 'Last 24 hours', hours: 24 },
  { label: 'Last 7 days', hours: 168 },
  { label: 'Last 30 days', hours: 720 },
  { label: 'Last 90 days', hours: 2160 },
];

const EVENT_TYPES = [
  'command.start', 'command.success', 'command.error', 'command.denied',
  'auth.failed', 'approval.granted', 'approval.rejected', 'config.changed',
];

const PAGE_SIZE = 20;

const typeBadge: Record<string, string> = {
  'command.success': 'badge-success badge-outline',
  'command.error': 'badge-error',
  'command.denied': 'badge-error',
  'command.start': 'badge-ghost',
  'auth.failed': 'badge-warning',
  'approval.granted': 'badge-success badge-outline',
  'approval.rejected': 'badge-error',
  'config.changed': 'badge-ghost',
};

export default function Audit() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState(168);
  const [typeFilter, setTypeFilter] = useState('');
  const [connectorFilter, setConnectorFilter] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    api.getConnectors().then((d) => setConnectors(d.connectors)).catch(() => {});
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    const params: Record<string, string> = {
      since: new Date(Date.now() - timeRange * 3600_000).toISOString(),
      limit: String(PAGE_SIZE + offset + 1),
    };
    if (typeFilter) params.type = typeFilter;
    if (connectorFilter) params.connector = connectorFilter;
    api.getAudit(params)
      .then((d) => setEvents(d.events))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [timeRange, typeFilter, connectorFilter, offset]);

  useEffect(() => {
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, [load]);

  const paged = events.slice(offset, offset + PAGE_SIZE);
  const hasMore = events.length > offset + PAGE_SIZE;

  return (
    <div className="max-w-5xl">
      <h2 className="text-2xl font-bold mb-6">Audit Log</h2>

      <div className="flex flex-wrap items-end gap-3 mb-6">
        <label className="form-control">
          <span className="label-text mb-1 text-sm">Time range</span>
          <select className="select select-bordered select-sm" value={timeRange} onChange={(e) => { setTimeRange(Number(e.target.value)); setOffset(0); }}>
            {TIME_RANGES.map((r) => <option key={r.hours} value={r.hours}>{r.label}</option>)}
          </select>
        </label>
        <label className="form-control">
          <span className="label-text mb-1 text-sm">Event type</span>
          <select className="select select-bordered select-sm" value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setOffset(0); }}>
            <option value="">All types</option>
            {EVENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <label className="form-control">
          <span className="label-text mb-1 text-sm">Connector</span>
          <select className="select select-bordered select-sm" value={connectorFilter} onChange={(e) => { setConnectorFilter(e.target.value); setOffset(0); }}>
            <option value="">All connectors</option>
            {connectors.map((c) => <option key={c.key} value={c.key}>{c.key}</option>)}
          </select>
        </label>
      </div>

      {loading && events.length === 0 ? <Spinner label="Loading audit events..." /> : (
        <>
          {paged.length === 0 ? (
            <p className="text-sm opacity-50">No events match the current filters.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="table table-sm">
                <thead>
                  <tr><th>Time</th><th>Type</th><th>Connector</th><th>User</th><th>Duration</th><th></th></tr>
                </thead>
                <tbody>
                  {paged.map((e) => (
                    <>
                      <tr key={e.id} className="cursor-pointer hover" onClick={() => setExpandedId(expandedId === e.id ? null : e.id)} role="button" aria-expanded={expandedId === e.id} tabIndex={0} onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); setExpandedId(expandedId === e.id ? null : e.id); } }}>
                        <td className="text-sm">{new Date(e.timestamp).toLocaleString()}</td>
                        <td><span className={`badge badge-sm ${typeBadge[e.type] ?? 'badge-ghost'}`}>{e.type}</span></td>
                        <td className="font-mono text-sm">{e.connector || '\u2014'}</td>
                        <td className="text-sm">{e.user}</td>
                        <td className="text-sm">{e.durationMs ? `${(e.durationMs / 1000).toFixed(1)}s` : '\u2014'}</td>
                        <td className="text-xs opacity-40" aria-hidden="true">{expandedId === e.id ? '\u25B2' : '\u25BC'}</td>
                      </tr>
                      {expandedId === e.id && (
                        <tr key={`${e.id}-detail`}>
                          <td colSpan={6} className="bg-base-200 p-4">
                            <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                              <div><span className="opacity-50">ID:</span> <span className="font-mono text-xs">{e.id}</span></div>
                              <div><span className="opacity-50">Correlation:</span> <span className="font-mono text-xs">{e.correlationId ?? '\u2014'}</span></div>
                              {e.connectorHash && <div><span className="opacity-50">Connector hash:</span> <span className="font-mono text-xs">{e.connectorHash}</span></div>}
                              {e.error && <div className="col-span-2"><span className="opacity-50">Error:</span> <span className="text-error">{e.error}</span></div>}
                              {e.args && <div className="col-span-2"><span className="opacity-50">Args:</span> <span className="font-mono text-xs">{JSON.stringify(e.args)}</span></div>}
                              {e.domains && e.domains.length > 0 && <div><span className="opacity-50">Domains:</span> {e.domains.join(', ')}</div>}
                              {e.capabilities && e.capabilities.length > 0 && <div><span className="opacity-50">Capabilities:</span> {e.capabilities.join(', ')}</div>}
                            </div>
                            {e.steps && e.steps.length > 0 && (
                              <>
                                <h4 className="font-semibold text-sm mb-2">Pipeline steps</h4>
                                <table className="table table-xs">
                                  <thead><tr><th>#</th><th>Step</th><th>Capability</th><th>Duration</th><th>Error</th></tr></thead>
                                  <tbody>
                                    {e.steps.map((s, i) => (
                                      <tr key={i}>
                                        <td>{i + 1}</td>
                                        <td>{s.step}</td>
                                        <td>{s.capability}</td>
                                        <td>{(s.durationMs / 1000).toFixed(2)}s</td>
                                        <td className="text-error">{s.error ?? ''}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </>
                            )}
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex justify-between items-center mt-4">
            <button className="btn btn-sm btn-ghost" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>
              Previous
            </button>
            <span className="text-sm opacity-50">
              Showing {offset + 1}\u2013{Math.min(offset + PAGE_SIZE, events.length)} of {events.length}
            </span>
            <button className="btn btn-sm btn-ghost" disabled={!hasMore} onClick={() => setOffset(offset + PAGE_SIZE)}>
              Next
            </button>
          </div>
        </>
      )}
    </div>
  );
}
