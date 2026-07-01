import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type Connector } from '../api';
import { Badge } from '../components/Badge';
import { Spinner } from '../components/Spinner';

export default function Connectors() {
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getConnectors()
      .then((d) => setConnectors(d.connectors))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Spinner label="Loading connectors..." />;

  return (
    <div className="max-w-4xl">
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
                    <Badge variant="neutral">{c.access}</Badge>
                    {c.capabilities.map((cap) => (
                      <Badge key={cap} variant="info">{cap}</Badge>
                    ))}
                  </div>
                  <p className="text-sm opacity-60 mt-1">{c.description}</p>
                  {c.domains.length > 0 && (
                    <div className="text-xs opacity-40 mt-1">Domains: {c.domains.join(', ')}</div>
                  )}
                </div>
                <div className="flex gap-2 ml-4 shrink-0">
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
