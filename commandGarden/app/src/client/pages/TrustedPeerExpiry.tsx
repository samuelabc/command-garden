import { useState, useCallback, useMemo, useEffect } from 'react';
import { api } from '../api';
import { Badge } from '../components/Badge';
import { Spinner } from '../components/Spinner';
import { AuthRequiredCallout } from '../components/AuthRequiredCallout';

interface TrustedPeer {
  parentClientId: string;
  parentClientName: string;
  peerId: string;
  peerName: string;
  peerIdDisplay: string;
  expiryDate: string | null;
  region: string;
}

type LoadPhase = 'idle' | 'clients' | 'trustedby' | 'done' | 'error';

function daysUntilExpiry(dateStr: string | null): number | null {
  if (!dateStr) return null;
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return null;
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    d.setHours(0, 0, 0, 0);
    return Math.ceil((d.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
  } catch {
    return null;
  }
}

function expiryTier(days: number | null): 'expired' | 'critical' | 'warning' | 'ok' | 'none' {
  if (days === null) return 'none';
  if (days < 0) return 'expired';
  if (days <= 7) return 'critical';
  if (days <= 30) return 'warning';
  return 'ok';
}

function tierBadge(tier: ReturnType<typeof expiryTier>, days: number | null) {
  switch (tier) {
    case 'expired':
      return <Badge variant="error" size="xs">EXPIRED</Badge>;
    case 'critical':
      return <Badge variant="error" size="xs">{days}d LEFT</Badge>;
    case 'warning':
      return <Badge variant="warning" size="xs">{days}d LEFT</Badge>;
    case 'ok':
      return <Badge variant="success" size="xs">{days}d LEFT</Badge>;
    case 'none':
      return <Badge variant="neutral" size="xs">NO EXPIRY</Badge>;
    default:
      return null;
  }
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return dateStr;
  }
}

function tierRowClass(tier: ReturnType<typeof expiryTier>): string {
  switch (tier) {
    case 'expired':
      return 'bg-red-500/5';
    case 'critical':
      return 'bg-red-500/5';
    case 'warning':
      return 'bg-amber-500/5';
    default:
      return '';
  }
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function TrustedPeerExpiry() {
  const [phase, setPhase] = useState<LoadPhase>('idle');
  const [progress, setProgress] = useState('');
  const [peers, setPeers] = useState<TrustedPeer[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [regionFilter, setRegionFilter] = useState<string>('all');
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [isCached, setIsCached] = useState(false);

  const loading = phase === 'clients' || phase === 'trustedby';

  // Load cached data on mount
  useEffect(() => {
    let stale = false;
    api.getCachedTrustedPeers().then((res) => {
      if (stale) return;
      if (res.data && res.data.length > 0) {
        // Skip if a fresh fetch is already running
        setPhase((cur) => {
          if (cur === 'clients' || cur === 'trustedby') { stale = true; return cur; }
          return 'done';
        });
        if (stale) return;
        const restored: TrustedPeer[] = (res.data as unknown as TrustedPeer[]);
        setPeers(restored);
        setFetchedAt(res.fetchedAt);
        setIsCached(true);
        setProgress(`Loaded ${restored.length} trusted peers from cache.`);
      }
    }).catch(() => {});
    return () => { stale = true; };
  }, []);

  const handleLoad = useCallback(async () => {
    setPhase('clients');
    setError(null);
    setPeers([]);
    setIsCached(false);
    setProgress('Fetching client list (all regions)...');

    try {
      // Step 1: Get all clients across all regions
      const clientsResp = await api.run('tokenmaster/clients-list', { region: 'all' });
      if (!clientsResp.ok && clientsResp.error) {
        setError(clientsResp.error);
        setPhase('error');
        return;
      }

      const clients = (clientsResp.data ?? []).map((r) => ({
        id: String(r.id ?? ''),
        name: String(r.name ?? ''),
        region: String(r.region ?? 'emea'),
      }));

      if (clients.length === 0) {
        setProgress('No clients found.');
        setPhase('done');
        return;
      }

      // Step 2: For each client, fetch trustedby across all regions
      setPhase('trustedby');
      const allPeers: TrustedPeer[] = [];
      const total = clients.length;

      for (let i = 0; i < clients.length; i++) {
        const client = clients[i];
        setProgress(`Fetching trusted peers... (${i + 1}/${total}) — ${client.name || client.id}`);

        try {
          const trustedResp = await api.run('tokenmaster/client-trustedby', {
            clientid: client.id,
            region: client.region,
          });

          if (trustedResp.ok && trustedResp.data) {
            for (const row of trustedResp.data) {
              allPeers.push({
                parentClientId: client.id,
                parentClientName: client.name || client.id,
                peerId: String(row.id ?? ''),
                peerName: String(row.name ?? ''),
                peerIdDisplay: String(row.idDisplay ?? ''),
                expiryDate: row.expiry_date ? String(row.expiry_date) : null,
                region: String(row.region ?? client.region),
              });
            }
          }
        } catch {
          // Skip failed individual client lookups, continue with others
        }
      }

      setPeers(allPeers);
      setProgress(`Loaded ${allPeers.length} trusted peers from ${total} clients.`);
      setPhase('done');

      // Cache results
      if (allPeers.length > 0) {
        const now = new Date().toISOString();
        setFetchedAt(now);
        api.cacheTrustedPeers(allPeers as unknown as Record<string, unknown>[]).catch(() => {});
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
      setPhase('error');
    }
  }, []);

  // Filter by region
  const filteredPeers = useMemo(() => {
    const filtered = regionFilter === 'all'
      ? peers
      : peers.filter((p) => p.region === regionFilter);

    // Sort: ascending expiry (nulls at bottom)
    return [...filtered].sort((a, b) => {
      const da = daysUntilExpiry(a.expiryDate);
      const db = daysUntilExpiry(b.expiryDate);
      if (da === null && db === null) return 0;
      if (da === null) return 1;
      if (db === null) return -1;
      return da - db;
    });
  }, [peers, regionFilter]);

  // Stats
  const stats = useMemo(() => {
    let expired = 0;
    let critical = 0;
    let warning = 0;
    for (const p of filteredPeers) {
      const tier = expiryTier(daysUntilExpiry(p.expiryDate));
      if (tier === 'expired') expired++;
      else if (tier === 'critical') critical++;
      else if (tier === 'warning') warning++;
    }
    return { total: filteredPeers.length, expired, critical, warning };
  }, [filteredPeers]);

  // Unique regions from data for filter dropdown
  const availableRegions = useMemo(() => {
    const set = new Set(peers.map((p) => p.region));
    return Array.from(set).sort();
  }, [peers]);

  const isAuthRequired = (err: string | null) =>
    err?.includes('auth_required') || err?.includes('sign in');

  return (
    <div className="max-w-5xl mx-auto">
      <h2 className="font-display text-xl font-bold uppercase tracking-[0.06em] mb-5">Trusted Peer Expiry</h2>

      <div className="flex flex-col sm:flex-row sm:items-end gap-3 mb-6">
        <label className="form-control w-full sm:w-auto">
          <span className="font-mono text-[0.6rem] font-medium opacity-40 uppercase tracking-[0.1em] mb-1">Region</span>
          <select
            className="select select-bordered select-sm w-full sm:w-auto"
            value={regionFilter}
            onChange={(e) => setRegionFilter(e.target.value)}
          >
            <option value="all">All regions</option>
            {availableRegions.map((r) => (
              <option key={r} value={r}>{r.toUpperCase()}</option>
            ))}
          </select>
        </label>
        <button className="btn btn-primary btn-sm w-full sm:w-auto" onClick={handleLoad} disabled={loading}>
          {loading ? 'Loading...' : 'Load trusted peers'}
        </button>
      </div>

      {loading && <Spinner label={progress} />}

      {error && (
        isAuthRequired(error) ? (
          <AuthRequiredCallout message="Sign in to TokenMaster in Chrome, then try again." />
        ) : (
          <div className="alert alert-error mb-3">
            <span>{error}</span>
          </div>
        )
      )}

      {/* Stats bar */}
      {peers.length > 0 && !loading && (
        <div className="grid grid-cols-4 border border-base-300 mb-6">
          <div className="p-3 border-r border-base-300">
            <div className="font-mono text-[0.6rem] font-medium opacity-40 uppercase tracking-[0.1em] mb-1">Total</div>
            <div className="font-display text-xl font-bold">{stats.total}</div>
          </div>
          <div className="p-3 border-r border-base-300">
            <div className="font-mono text-[0.6rem] font-medium opacity-40 uppercase tracking-[0.1em] mb-1">Expired</div>
            <div className={`font-display text-xl font-bold ${stats.expired > 0 ? 'text-red-500' : ''}`}>{stats.expired}</div>
          </div>
          <div className="p-3 border-r border-base-300">
            <div className="font-mono text-[0.6rem] font-medium opacity-40 uppercase tracking-[0.1em] mb-1">&le; 7 days</div>
            <div className={`font-display text-xl font-bold ${stats.critical > 0 ? 'text-red-500' : ''}`}>{stats.critical}</div>
          </div>
          <div className="p-3">
            <div className="font-mono text-[0.6rem] font-medium opacity-40 uppercase tracking-[0.1em] mb-1">&le; 30 days</div>
            <div className={`font-display text-xl font-bold ${stats.warning > 0 ? 'text-amber-500' : ''}`}>{stats.warning}</div>
          </div>
        </div>
      )}

      {/* Table */}
      {filteredPeers.length > 0 && (
        <div className="border border-base-300 overflow-x-auto">
          <table className="table table-sm w-full">
            <thead>
              <tr className="border-b border-base-300">
                <th className="font-mono text-[0.6rem] font-medium opacity-40 uppercase tracking-[0.1em]">Status</th>
                <th className="font-mono text-[0.6rem] font-medium opacity-40 uppercase tracking-[0.1em]">Expiry Date</th>
                <th className="font-mono text-[0.6rem] font-medium opacity-40 uppercase tracking-[0.1em]">Days Left</th>
                <th className="font-mono text-[0.6rem] font-medium opacity-40 uppercase tracking-[0.1em]">Trusted Peer</th>
                <th className="font-mono text-[0.6rem] font-medium opacity-40 uppercase tracking-[0.1em]">Peer ID</th>
                <th className="font-mono text-[0.6rem] font-medium opacity-40 uppercase tracking-[0.1em]">Parent Client</th>
                <th className="font-mono text-[0.6rem] font-medium opacity-40 uppercase tracking-[0.1em]">Region</th>
              </tr>
            </thead>
            <tbody>
              {filteredPeers.map((peer, i) => {
                const days = daysUntilExpiry(peer.expiryDate);
                const tier = expiryTier(days);
                return (
                  <tr key={`${peer.parentClientId}-${peer.peerId}-${peer.region}-${i}`} className={`border-b border-base-300/50 ${tierRowClass(tier)}`}>
                    <td>{tierBadge(tier, days)}</td>
                    <td className="font-mono text-sm">{formatDate(peer.expiryDate)}</td>
                    <td className="font-mono text-sm">
                      {days !== null ? (days < 0 ? `${Math.abs(days)}d overdue` : `${days}d`) : '—'}
                    </td>
                    <td className="text-sm font-semibold">{peer.peerName || peer.peerId}</td>
                    <td className="font-mono text-xs opacity-60">{peer.peerIdDisplay || peer.peerId}</td>
                    <td className="text-sm">{peer.parentClientName}</td>
                    <td>
                      <Badge variant="neutral" size="xs">{peer.region.toUpperCase()}</Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Last fetched indicator */}
      {fetchedAt && !loading && (
        <div className="font-mono text-[0.6rem] font-medium opacity-40 uppercase tracking-[0.1em] mt-3">
          {isCached ? 'Showing cached data from' : 'Last fetched'} {timeAgo(fetchedAt)}
        </div>
      )}

      {/* Done with progress message */}
      {phase === 'done' && !loading && peers.length > 0 && (
        <div className="mt-1 font-mono text-xs opacity-40">{progress}</div>
      )}

      {/* Empty states */}
      {phase === 'done' && peers.length === 0 && !loading && (
        <div className="border border-base-300 p-6 text-center">
          <p className="text-sm opacity-50 mb-1">No trusted peers found</p>
          <p className="font-mono text-xs opacity-30">No clients returned from TokenMaster, or no trustedby relationships exist.</p>
        </div>
      )}

      {phase === 'idle' && (
        <div className="border border-base-300 p-8 text-center">
          <p className="text-sm opacity-50 mb-1">TokenMaster trusted peer expiry monitor</p>
          <p className="font-mono text-xs opacity-30">Press "Load trusted peers" to fetch all clients and their trusted peer expiry dates across all regions.</p>
        </div>
      )}
    </div>
  );
}
