import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api, type Connector } from '../api';
import { Badge } from '../components/Badge';
import { Spinner } from '../components/Spinner';

export default function Connectors() {
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [approvedHighRisk, setApprovedHighRisk] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [approvingKey, setApprovingKey] = useState<string | null>(null);

  const load = useCallback(() => {
    const connP = api.getConnectors();
    const configP = api.getConfig().catch(() => ({ ok: false, config: {} }) as { ok: boolean; config: Record<string, Record<string, unknown>> });
    Promise.all([connP, configP])
      .then(([connRes, configRes]) => {
        setConnectors(connRes.connectors);
        const security = (configRes.config.security ?? {}) as Record<string, unknown>;
        setApprovedHighRisk((security.approvedHighRisk as string[]) ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleApprove = useCallback(async (connectorKey: string) => {
    setApprovingKey(connectorKey);
    try {
      const updated = [...approvedHighRisk, connectorKey];
      await api.setConfig('security.approvedHighRisk', JSON.stringify(updated));
      load();
    } catch {
      // error is shown via connector state not updating
    } finally {
      setApprovingKey(null);
    }
  }, [approvedHighRisk, load]);

  if (loading) return <Spinner label="Loading connectors..." />;

  return (
    <div className="max-w-4xl mx-auto">
      <h2 className="text-2xl font-bold mb-6">Connectors</h2>
      {connectors.length === 0 ? (
        <div className="bg-base-200 rounded-lg p-6 text-center">
          <p className="text-sm opacity-60 mb-1">No connectors loaded</p>
          <p className="text-xs opacity-40">Check the daemon is running and connectors are installed in ~/.commandgarden/connectors/</p>
        </div>
      ) : (
        <div className="space-y-3">
          {connectors.map((c) => {
            const [site, name] = c.key.split('/');
            return (
              <div key={c.key} className="bg-base-200 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="font-mono font-semibold">{c.key}</span>
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
                      onClick={() => handleApprove(c.key)}
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
          })}
        </div>
      )}
    </div>
  );
}
