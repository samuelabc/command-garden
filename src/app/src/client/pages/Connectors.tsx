import { useEffect, useState, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { api, groupBySite, type Connector } from '../api';
import { Badge } from '../components/Badge';
import { Spinner } from '../components/Spinner';

function ConnectorSubRow({ c, approvingKey, onApprove }: { c: Connector; approvingKey: string | null; onApprove: (key: string) => void }) {
  const [site, name] = c.key.split('/');
  return (
    <div className="border border-base-300/50 p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
      <div className="flex-1">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="font-mono font-semibold text-sm">{name}</span>
          <Badge size="sm">{c.access}</Badge>
          {c.capabilities.map((cap) => (
            <Badge key={cap} size="sm">{cap}</Badge>
          ))}
          {c.isHighRisk && c.isApproved && (
            <Badge variant="success" size="sm">Approved</Badge>
          )}
          {c.isHighRisk && !c.isApproved && (
            <Badge variant="warning" size="sm">Blocked — requires approval</Badge>
          )}
        </div>
        <p className="text-sm opacity-60 mt-1">{c.description}</p>
        {c.domains.length > 0 && (
          <div className="text-xs opacity-40 mt-1">Domains: {c.domains.join(', ')}</div>
        )}
      </div>
      <div className="flex gap-2 ml-4 shrink-0">
        {c.isHighRisk && !c.isApproved && (
          <button
            className="btn btn-sm btn-warning btn-outline"
            disabled={approvingKey === c.key}
            onClick={() => onApprove(c.key)}
          >
            {approvingKey === c.key ? 'Approving...' : 'Approve'}
          </button>
        )}
        {c.hasAppPage && c.appRoute && (
          <Link to={c.appRoute} className="btn btn-sm btn-primary">Open App</Link>
        )}
        <Link to={`/connectors/${site}/${name}`} className="btn btn-sm btn-ghost">Run</Link>
      </div>
    </div>
  );
}

function ConnectorGroup({ site, connectors, approvingKey, onApprove }: { site: string; connectors: Connector[]; approvingKey: string | null; onApprove: (key: string) => void }) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div id={`conn-${site}`} className="border border-base-300 p-4 scroll-mt-4">
      <button className="flex items-center gap-2 w-full text-left" onClick={() => setCollapsed(!collapsed)}>
        <span className="text-xs opacity-50">{collapsed ? '▸' : '▾'}</span>
        <span className="font-mono font-semibold">{site}</span>
        <span className="text-xs opacity-40">{connectors.length} {connectors.length === 1 ? 'connector' : 'connectors'}</span>
      </button>
      {!collapsed && (
        <div className="space-y-2 mt-3">
          {connectors.map((c) => (
            <ConnectorSubRow key={c.key} c={c} approvingKey={approvingKey} onApprove={onApprove} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function Connectors() {
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [loading, setLoading] = useState(true);
  const [approvingKey, setApprovingKey] = useState<string | null>(null);
  const [approveError, setApproveError] = useState<string | null>(null);

  const load = useCallback(() => {
    api.getConnectors()
      .then(res => setConnectors(res.connectors))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  // Which capabilities get granted is decided by the server, which is the only
  // side that can see security.highRiskCapabilities.
  const handleApprove = useCallback(async (connectorKey: string) => {
    const [site, name] = connectorKey.split('/');
    setApprovingKey(connectorKey);
    setApproveError(null);
    try {
      await api.approveConnector(site, name);
      load();
    } catch (err) {
      setApproveError(`Could not approve ${connectorKey}: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setApprovingKey(null);
    }
  }, [load]);

  const grouped = useMemo(() => groupBySite(connectors), [connectors]);

  if (loading) return <Spinner label="Loading connectors..." />;

  return (
    <div className="max-w-4xl mx-auto">
      <h2 className="font-display text-xl font-bold uppercase tracking-[0.06em] mb-5">Connectors</h2>
      {approveError && (
        <div className="alert alert-error mb-4">
          <span className="text-sm">{approveError}</span>
          <button className="btn btn-sm btn-ghost" onClick={() => setApproveError(null)}>Dismiss</button>
        </div>
      )}
      {connectors.length === 0 ? (
        <div className="border border-base-300 p-6 text-center">
          <p className="text-sm opacity-50 mb-1">No connectors loaded</p>
          <p className="font-mono text-xs opacity-30">Check the daemon is running and connectors are installed in ~/.commandgarden/connectors/</p>
        </div>
      ) : (
        <div className="space-y-3">
          {grouped.map(([site, siteConnectors]) => (
            <ConnectorGroup key={site} site={site} connectors={siteConnectors} approvingKey={approvingKey} onApprove={handleApprove} />
          ))}
        </div>
      )}
    </div>
  );
}
