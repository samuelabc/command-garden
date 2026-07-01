import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api, type Connector } from '../api';
import { Badge } from '../components/Badge';

interface CheckItem {
  label: string;
  ok: boolean;
  detail: string;
  instructions: string;
}

export default function Guide() {
  const [checks, setChecks] = useState<CheckItem[]>([]);
  const [connectors, setConnectors] = useState<Connector[]>([]);

  const poll = useCallback(async () => {
    const items: CheckItem[] = [];
    let daemonOk = false;
    let extensionOk = false;
    let connectorCount = 0;

    try {
      const s = await api.getStatus();
      daemonOk = s.ok;
      extensionOk = s.extensionConnected;
      connectorCount = s.connectorCount;
    } catch { /* daemon not running */ }

    items.push({
      label: 'Daemon running',
      ok: daemonOk,
      detail: daemonOk ? 'port 19825' : 'not detected',
      instructions: 'Start the daemon with: cg daemon start',
    });

    items.push({
      label: 'Chrome extension connected',
      ok: extensionOk,
      detail: extensionOk ? 'WebSocket linked' : 'not connected',
      instructions: 'Install the commandGarden Chrome extension and make sure Chrome is open.',
    });

    items.push({
      label: 'Connectors loaded',
      ok: connectorCount > 0,
      detail: connectorCount > 0 ? `${connectorCount} connector(s)` : 'none found',
      instructions: 'Place connector YAML files in ~/.commandgarden/connectors/ and restart the daemon.',
    });

    let approvedOk = true;
    try {
      const connData = await api.getConnectors();
      setConnectors(connData.connectors);
      const unapproved = connData.connectors.filter((c) => c.isHighRisk && !c.isApproved);
      approvedOk = unapproved.length === 0;
      items.push({
        label: 'High-risk connectors approved',
        ok: approvedOk,
        detail: approvedOk ? 'all approved' : `${unapproved.length} pending`,
        instructions: `Approve high-risk connectors in Configuration > Connector Security. Pending: ${unapproved.map((c) => c.key).join(', ')}`,
      });
    } catch {
      items.push({
        label: 'High-risk connectors approved',
        ok: false,
        detail: 'unable to check',
        instructions: 'Ensure the daemon is running to check approval status.',
      });
    }

    setChecks(items);
  }, []);

  useEffect(() => {
    poll();
    const id = setInterval(poll, 10_000);
    return () => clearInterval(id);
  }, [poll]);

  return (
    <div className="max-w-3xl mx-auto">
      <h2 className="font-display text-xl font-bold uppercase tracking-[0.06em] mb-5">Setup Guide</h2>

      <div className="space-y-3 mb-8">
        {checks.map((item, i) => (
          <details key={i} className="border border-base-300">
            <summary className="p-4 cursor-pointer flex items-center gap-3">
              <span className={`w-5 h-5 flex items-center justify-center rounded-sm font-mono text-xs font-bold ${item.ok ? 'bg-success text-success-content' : 'border border-base-300 text-base-content opacity-50'}`}>
                {item.ok ? <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><path d="M20 6 9 17l-5-5" /></svg> : (i + 1)}
              </span>
              <span className="font-semibold flex-1">{item.label}</span>
              <Badge variant={item.ok ? 'success' : 'warning'}>{item.detail}</Badge>
            </summary>
            <div className="px-4 pb-4 text-sm opacity-70">{item.instructions}</div>
          </details>
        ))}
      </div>

      {connectors.length > 0 && (
        <>
          <h3 className="font-display text-base font-semibold mb-3">Try it out</h3>
          <div className="flex flex-wrap gap-2">
            {connectors.map((c) => {
              const [site, name] = c.key.split('/');
              return (
                <Link key={c.key} to={`/connectors/${site}/${name}`} className="btn btn-sm btn-outline">
                  {c.key}
                </Link>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
