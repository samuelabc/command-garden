import { useState, useCallback, useMemo, useEffect } from 'react';
import { api } from '../api';
import { Badge } from '../components/Badge';
import { Spinner } from '../components/Spinner';
import { AuthRequiredCallout } from '../components/AuthRequiredCallout';

interface ClientSecret {
  clientId: string;
  clientName: string;
  generatedAt: string | null;
  tokenCount: number;
  region: string;
}

type LoadPhase = 'idle' | 'clients' | 'details' | 'done' | 'error';

const ROTATION_LIMIT_DAYS = 365;
const DUE_SOON_DAYS = 335;

function daysSinceRotation(dateStr: string | null): number | null {
  if (!dateStr) return null;
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return null;
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    d.setHours(0, 0, 0, 0);
    return Math.floor((now.getTime() - d.getTime()) / (24 * 60 * 60 * 1000));
  } catch {
    return null;
  }
}

function ageTier(days: number | null): 'overdue' | 'due-soon' | 'ok' | 'none' {
  if (days === null) return 'none';
  if (days > ROTATION_LIMIT_DAYS) return 'overdue';
  if (days >= DUE_SOON_DAYS) return 'due-soon';
  return 'ok';
}

function tierBadge(tier: ReturnType<typeof ageTier>) {
  switch (tier) {
    case 'overdue':
      return <Badge variant="error" size="xs">OVERDUE</Badge>;
    case 'due-soon':
      return <Badge variant="warning" size="xs">DUE SOON</Badge>;
    case 'ok':
      return <Badge variant="success" size="xs">OK</Badge>;
    case 'none':
      return <Badge variant="neutral" size="xs">NO TOKEN</Badge>;
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

function tierRowClass(tier: ReturnType<typeof ageTier>): string {
  switch (tier) {
    case 'overdue':
      return 'bg-red-500/5';
    case 'due-soon':
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

export default function ClientSecretRotation() {
  const [phase, setPhase] = useState<LoadPhase>('idle');
  const [progress, setProgress] = useState('');
  const [secrets, setSecrets] = useState<ClientSecret[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [regionFilter, setRegionFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [isCached, setIsCached] = useState(false);

  const loading = phase === 'clients' || phase === 'details';

  // Load cached data on mount
  useEffect(() => {
    let stale = false;
    api.getCachedClientSecrets().then((res) => {
      if (stale) return;
      if (res.data && res.data.length > 0) {
        // Skip if a fresh fetch is already running
        setPhase((cur) => {
          if (cur === 'clients' || cur === 'details') { stale = true; return cur; }
          return 'done';
        });
        if (stale) return;
        const restored: ClientSecret[] = (res.data as unknown as ClientSecret[]);
        setSecrets(restored);
        setFetchedAt(res.fetchedAt);
        setIsCached(true);
        setProgress(`Loaded ${restored.length} client secrets from cache.`);
      }
    }).catch(() => {});
    return () => { stale = true; };
  }, []);

  const handleLoad = useCallback(async () => {
    setPhase('clients');
    setError(null);
    setSecrets([]);
    setIsCached(false);
    const loadRegion = regionFilter;
    setProgress(loadRegion === 'all' ? 'Fetching client list (all regions)...' : `Fetching client list (${loadRegion})...`);

    try {
      // Step 1: Get all clients for the selected region(s)
      const clientsResp = await api.run('tokenmaster/clients-list', { region: loadRegion });
      if (!clientsResp.ok && clientsResp.error) {
        setError(clientsResp.error);
        setPhase('error');
        return;
      }

      // Fan-out mode prepends a region column; single-region runs do not,
      // so fall back to the selected region.
      const clients = (clientsResp.data ?? []).map((r) => ({
        id: String(r.id ?? ''),
        name: String(r.name ?? ''),
        region: String(r.region ?? (loadRegion === 'all' ? 'emea' : loadRegion)),
      }));

      if (clients.length === 0) {
        setProgress('No clients found.');
        setPhase('done');
        return;
      }

      // Step 2: For each client, fetch details to get token generation date
      setPhase('details');
      const allSecrets: ClientSecret[] = [];
      const failures: string[] = [];
      const total = clients.length;

      for (let i = 0; i < clients.length; i++) {
        const client = clients[i];
        setProgress(`Fetching client details... (${i + 1}/${total}) — ${client.name || client.id}`);

        try {
          const detailsResp = await api.run('tokenmaster/client-details', {
            clientid: client.id,
            region: client.region,
          });

          if (detailsResp.ok && detailsResp.data && detailsResp.data.length > 0) {
            const row = detailsResp.data[0];
            allSecrets.push({
              clientId: String(row.id ?? client.id),
              clientName: String(row.name ?? '') || client.name || client.id,
              generatedAt: row.generated_at ? String(row.generated_at) : null,
              tokenCount: Number(row.token_count ?? 0),
              region: client.region,
            });
          } else if (!detailsResp.ok && detailsResp.error) {
            failures.push(detailsResp.error);
          }
        } catch (e) {
          failures.push(e instanceof Error ? e.message : 'Unknown error');
        }
      }

      // Every lookup failed — surface the cause (e.g. missing capability
      // approval or expired TokenMaster session) instead of an empty state.
      if (allSecrets.length === 0 && failures.length > 0) {
        setError(failures[0] + (failures.length > 1 ? ` (${failures.length} lookups failed)` : ''));
        setPhase('error');
        return;
      }

      setSecrets(allSecrets);
      setProgress(
        `Loaded ${allSecrets.length} client secrets from ${total} clients.`
        + (failures.length > 0 ? ` ${failures.length} lookups failed — first error: ${failures[0]}` : ''),
      );
      setPhase('done');

      // Cache results
      if (allSecrets.length > 0) {
        const now = new Date().toISOString();
        setFetchedAt(now);
        api.cacheClientSecrets(allSecrets as unknown as Record<string, unknown>[]).catch(() => {});
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
      setPhase('error');
    }
  }, [regionFilter]);

  // Filter by region and search
  const filteredSecrets = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = secrets
      .filter((s) => regionFilter === 'all' || s.region === regionFilter)
      .filter((s) => !q || String(s.clientName ?? '').toLowerCase().includes(q)
        || String(s.clientId ?? '').toLowerCase().includes(q));

    // Sort: oldest rotation first (nulls at bottom)
    return [...filtered].sort((a, b) => {
      const da = daysSinceRotation(a.generatedAt);
      const db = daysSinceRotation(b.generatedAt);
      if (da === null && db === null) return 0;
      if (da === null) return 1;
      if (db === null) return -1;
      return db - da;
    });
  }, [secrets, regionFilter, search]);

  // Stats
  const stats = useMemo(() => {
    let overdue = 0;
    let dueSoon = 0;
    let noToken = 0;
    for (const s of filteredSecrets) {
      const tier = ageTier(daysSinceRotation(s.generatedAt));
      if (tier === 'overdue') overdue++;
      else if (tier === 'due-soon') dueSoon++;
      else if (tier === 'none') noToken++;
    }
    return { total: filteredSecrets.length, overdue, dueSoon, noToken };
  }, [filteredSecrets]);

  // Known regions plus any extras found in the data
  const availableRegions = useMemo(() => {
    const set = new Set(['emea', 'amap', 'cn', ...secrets.map((s) => s.region)]);
    return Array.from(set).sort();
  }, [secrets]);

  const isAuthRequired = (err: string | null) =>
    err?.includes('auth_required') || err?.includes('sign in') || err?.includes('log in');

  return (
    <div className="max-w-5xl mx-auto">
      <h2 className="font-display text-xl font-bold uppercase tracking-[0.06em] mb-5">Client Secret Rotation</h2>

      {/* Last fetched indicator */}
      {fetchedAt && !loading && (
        <div className="font-mono text-[0.6rem] font-medium opacity-40 uppercase tracking-[0.1em] mb-3">
          {isCached ? 'Showing cached data from' : 'Last fetched'} {timeAgo(fetchedAt)}
        </div>
      )}

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
        <label className="form-control w-full sm:w-64">
          <span className="font-mono text-[0.6rem] font-medium opacity-40 uppercase tracking-[0.1em] mb-1">Search</span>
          <input
            type="text"
            className="input input-bordered input-sm w-full"
            placeholder="Client name or ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <button className="btn btn-primary btn-sm w-full sm:w-auto" onClick={handleLoad} disabled={loading}>
          {loading ? 'Loading...' : 'Load client secrets'}
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
      {secrets.length > 0 && !loading && (
        <div className="grid grid-cols-4 border border-base-300 mb-6">
          <div className="p-3 border-r border-base-300">
            <div className="font-mono text-[0.6rem] font-medium opacity-40 uppercase tracking-[0.1em] mb-1">Total</div>
            <div className="font-display text-xl font-bold">{stats.total}</div>
          </div>
          <div className="p-3 border-r border-base-300">
            <div className="font-mono text-[0.6rem] font-medium opacity-40 uppercase tracking-[0.1em] mb-1">&gt; 1 year</div>
            <div className={`font-display text-xl font-bold ${stats.overdue > 0 ? 'text-red-500' : ''}`}>{stats.overdue}</div>
          </div>
          <div className="p-3 border-r border-base-300">
            <div className="font-mono text-[0.6rem] font-medium opacity-40 uppercase tracking-[0.1em] mb-1">Due &le; 30 days</div>
            <div className={`font-display text-xl font-bold ${stats.dueSoon > 0 ? 'text-amber-500' : ''}`}>{stats.dueSoon}</div>
          </div>
          <div className="p-3">
            <div className="font-mono text-[0.6rem] font-medium opacity-40 uppercase tracking-[0.1em] mb-1">No token</div>
            <div className={`font-display text-xl font-bold ${stats.noToken > 0 ? 'text-amber-500' : ''}`}>{stats.noToken}</div>
          </div>
        </div>
      )}

      {/* Table */}
      {filteredSecrets.length > 0 && (
        <div className="border border-base-300 overflow-x-auto">
          <table className="table table-sm w-full">
            <thead>
              <tr className="border-b border-base-300">
                <th className="font-mono text-[0.6rem] font-medium opacity-40 uppercase tracking-[0.1em]">Status</th>
                <th className="font-mono text-[0.6rem] font-medium opacity-40 uppercase tracking-[0.1em]">Last Rotated</th>
                <th className="font-mono text-[0.6rem] font-medium opacity-40 uppercase tracking-[0.1em]">Age</th>
                <th className="font-mono text-[0.6rem] font-medium opacity-40 uppercase tracking-[0.1em]">Client</th>
                <th className="font-mono text-[0.6rem] font-medium opacity-40 uppercase tracking-[0.1em]">Client ID</th>
                <th className="font-mono text-[0.6rem] font-medium opacity-40 uppercase tracking-[0.1em]">Tokens</th>
                <th className="font-mono text-[0.6rem] font-medium opacity-40 uppercase tracking-[0.1em]">Region</th>
              </tr>
            </thead>
            <tbody>
              {filteredSecrets.map((secret, i) => {
                const days = daysSinceRotation(secret.generatedAt);
                const tier = ageTier(days);
                return (
                  <tr key={`${secret.clientId}-${secret.region}-${i}`} className={`border-b border-base-300/50 ${tierRowClass(tier)}`}>
                    <td>{tierBadge(tier)}</td>
                    <td className="font-mono text-sm">{formatDate(secret.generatedAt)}</td>
                    <td className="font-mono text-sm">
                      {days !== null ? `${days}d` : '—'}
                    </td>
                    <td className="text-sm font-semibold">{secret.clientName}</td>
                    <td className="font-mono text-xs opacity-60">{secret.clientId}</td>
                    <td className="font-mono text-sm">{secret.tokenCount}</td>
                    <td>
                      <Badge variant="neutral" size="xs">{secret.region.toUpperCase()}</Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Done with progress message */}
      {phase === 'done' && !loading && secrets.length > 0 && (
        <div className="mt-1 font-mono text-xs opacity-40">{progress}</div>
      )}

      {/* Empty states */}
      {phase === 'done' && secrets.length === 0 && !loading && (
        <div className="border border-base-300 p-6 text-center">
          <p className="text-sm opacity-50 mb-1">No client secrets found</p>
          <p className="font-mono text-xs opacity-30">No clients returned from TokenMaster, or no token data exists.</p>
        </div>
      )}

      {phase === 'idle' && (
        <div className="border border-base-300 p-8 text-center">
          <p className="text-sm opacity-50 mb-1">TokenMaster client secret rotation monitor</p>
          <p className="font-mono text-xs opacity-30">Press "Load client secrets" to fetch all clients and their secret age across all regions. Read-only — no rotation actions are performed.</p>
        </div>
      )}
    </div>
  );
}
