import { useState, useCallback, useMemo, useEffect } from 'react';
import { api, type RunResponse } from '../api';
import { Badge, type BadgeVariant } from '../components/Badge';
import { Spinner } from '../components/Spinner';
import { AuthRequiredCallout } from '../components/AuthRequiredCallout';

const SOURCE_BADGE: Record<string, BadgeVariant> = { simon: 'info', every: 'secondary' };
const SOURCE_LABEL: Record<string, string> = { simon: 'SIMON WILLISON', every: 'EVERY' };

interface AiNewsItem {
  title: string;
  url: string;
  published: string;
  summary: string;
  source: 'simon' | 'every';
  author: string;
  tags: string;
}

function isWithinDays(dateStr: string, days: number): boolean {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return false;
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    return d.getTime() >= cutoff;
  } catch {
    return false;
  }
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const hours = Math.floor(diff / 3_600_000);
    if (hours < 1) return 'just now';
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days === 1) return 'yesterday';
    if (days < 7) return `${days}d ago`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return dateStr;
  }
}

function parseSimonRows(resp: RunResponse): AiNewsItem[] {
  return (resp.data ?? []).map((r) => ({
    title: String(r.title ?? ''),
    url: String(r.url ?? ''),
    published: String(r.published ?? ''),
    summary: String(r.summary ?? ''),
    source: 'simon' as const,
    author: '',
    tags: String(r.tags ?? ''),
  }));
}

function parseEveryRows(resp: RunResponse): AiNewsItem[] {
  return (resp.data ?? []).map((r) => ({
    title: String(r.title ?? ''),
    url: String(r.url ?? ''),
    published: String(r.published ?? ''),
    summary: String(r.summary ?? ''),
    source: 'every' as const,
    author: String(r.author ?? ''),
    tags: '',
  }));
}

type SourceStatus = 'idle' | 'loading' | 'done' | 'error';

type RangeDays = 7 | 30;
const RANGE_LABELS: Record<RangeDays, string> = { 7: 'Past 7 days', 30: 'Past 30 days' };

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function AiNews() {
  const [range, setRange] = useState<RangeDays>(7);
  const [simonStatus, setSimonStatus] = useState<SourceStatus>('idle');
  const [everyStatus, setEveryStatus] = useState<SourceStatus>('idle');
  const [simonItems, setSimonItems] = useState<AiNewsItem[]>([]);
  const [everyItems, setEveryItems] = useState<AiNewsItem[]>([]);
  const [simonError, setSimonError] = useState<string | null>(null);
  const [everyError, setEveryError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [isCached, setIsCached] = useState(false);
  const [approvedHighRisk, setApprovedHighRisk] = useState<string[]>([]);

  const loadConfig = useCallback(() => {
    api.getConfig()
      .then((res) => {
        const security = (res.config.security ?? {}) as Record<string, unknown>;
        setApprovedHighRisk((security.approvedHighRisk as string[]) ?? []);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadConfig();
    let stale = false;
    api.getCachedAiNews().then((res) => {
      if (stale) return;
      if (res.data && res.data.length > 0) {
        setSimonStatus((cur) => {
          if (cur === 'loading') { stale = true; return cur; }
          return 'done';
        });
        if (stale) return;
        const simon: AiNewsItem[] = [];
        const every: AiNewsItem[] = [];
        for (const r of res.data) {
          const item = r as unknown as AiNewsItem;
          if (item.source === 'every') every.push(item);
          else simon.push(item);
        }
        setSimonItems(simon);
        setEveryItems(every);
        setFetchedAt(res.fetchedAt);
        setIsCached(true);
        setEveryStatus('done');
      }
    }).catch(() => {});
    return () => { stale = true; };
  }, [loadConfig]);

  const loading = simonStatus === 'loading' || everyStatus === 'loading';
  const hasResults = simonItems.length > 0 || everyItems.length > 0;

  const allItems = useMemo(() => {
    const merged = [...simonItems, ...everyItems]
      .filter((item) => isWithinDays(item.published, range))
      .sort((a, b) => new Date(b.published).getTime() - new Date(a.published).getTime());
    return merged;
  }, [simonItems, everyItems, range]);

  const stats = useMemo(() => {
    const simonCount = allItems.filter((i) => i.source === 'simon').length;
    const everyCount = allItems.filter((i) => i.source === 'every').length;
    return { total: allItems.length, simonCount, everyCount };
  }, [allItems]);

  const handleLoad = useCallback(async () => {
    setSimonStatus('loading');
    setEveryStatus('loading');
    setSimonError(null);
    setEveryError(null);
    setSimonItems([]);
    setEveryItems([]);
    setIsCached(false);

    let freshSimon: AiNewsItem[] = [];
    let freshEvery: AiNewsItem[] = [];

    const simonPromise = api.run('simonwillison/blog', {})
      .then((resp) => {
        if (!resp.ok && resp.error) {
          setSimonError(resp.error);
          setSimonStatus('error');
        } else {
          freshSimon = parseSimonRows(resp);
          setSimonItems(freshSimon);
          setSimonStatus('done');
        }
      })
      .catch((e) => {
        setSimonError(e instanceof Error ? e.message : 'Failed to fetch');
        setSimonStatus('error');
      });

    const everyPromise = api.run('every/newsletter', {})
      .then((resp) => {
        if (!resp.ok && resp.error) {
          setEveryError(resp.error);
          setEveryStatus('error');
        } else {
          freshEvery = parseEveryRows(resp);
          setEveryItems(freshEvery);
          setEveryStatus('done');
        }
      })
      .catch((e) => {
        setEveryError(e instanceof Error ? e.message : 'Failed to fetch');
        setEveryStatus('error');
      });

    await Promise.allSettled([simonPromise, everyPromise]);

    const all = [...freshSimon, ...freshEvery];
    if (all.length > 0) {
      const now = new Date().toISOString();
      setFetchedAt(now);
      api.cacheAiNews(all as unknown as Record<string, unknown>[]).catch(() => {});
    }
  }, []);

  const isAuthRequired = (err: string | null) =>
    err?.includes('auth_required') || err?.includes('sign in');

  const isApprovalError = (err: string | null) =>
    err?.includes('not approved') || err?.includes('approvedHighRisk');

  const handleApprove = useCallback(async (connectorKey: string) => {
    const updated = [...approvedHighRisk, connectorKey];
    try {
      await api.setConfig('security.approvedHighRisk', JSON.stringify(updated));
      setApprovedHighRisk(updated);
      if (connectorKey === 'simonwillison/blog') {
        setSimonError(null);
        setSimonStatus('loading');
        api.run('simonwillison/blog', {}).then((resp) => {
          if (!resp.ok && resp.error) { setSimonError(resp.error); setSimonStatus('error'); }
          else { setSimonItems(parseSimonRows(resp)); setSimonStatus('done'); }
        }).catch((e) => { setSimonError(e instanceof Error ? e.message : 'Failed'); setSimonStatus('error'); });
      } else {
        setEveryError(null);
        setEveryStatus('loading');
        api.run('every/newsletter', {}).then((resp) => {
          if (!resp.ok && resp.error) { setEveryError(resp.error); setEveryStatus('error'); }
          else { setEveryItems(parseEveryRows(resp)); setEveryStatus('done'); }
        }).catch((e) => { setEveryError(e instanceof Error ? e.message : 'Failed'); setEveryStatus('error'); });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Approval failed';
      if (connectorKey === 'simonwillison/blog') setSimonError(msg);
      else setEveryError(msg);
    }
  }, [approvedHighRisk]);

  return (
    <div className="max-w-4xl mx-auto">
      <h2 className="font-display text-xl font-bold uppercase tracking-[0.06em] mb-5">AI News</h2>

      <div className="flex flex-col sm:flex-row sm:items-end gap-3 mb-6">
        <label className="form-control w-full sm:w-auto">
          <span className="font-mono text-[0.6rem] font-medium opacity-40 uppercase tracking-[0.1em] mb-1">Range</span>
          <select
            className="select select-bordered select-sm w-full sm:w-auto"
            value={range}
            onChange={(e) => setRange(Number(e.target.value) as RangeDays)}
          >
            <option value={7}>Past 7 days</option>
            <option value={30}>Past 30 days</option>
          </select>
        </label>
        <button className="btn btn-primary btn-sm w-full sm:w-auto" onClick={handleLoad} disabled={loading}>
          {loading ? 'Loading...' : 'Load news'}
        </button>
        <div className="flex items-center gap-3">
          <SourceIndicator label="Simon Willison" status={simonStatus} />
          <SourceIndicator label="Every" status={everyStatus} />
        </div>
      </div>

      {loading && <Spinner label="Fetching AI news..." />}

      {simonError && (
        isAuthRequired(simonError) ? (
          <AuthRequiredCallout message="Sign in to simonwillison.net in Chrome, then try again." />
        ) : isApprovalError(simonError) ? (
          <div className="alert alert-warning mb-3">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full">
              <span className="flex-1">Simon Willison connector requires approval before first use.</span>
              <button className="btn btn-sm btn-warning" onClick={() => handleApprove('simonwillison/blog')}>Approve &amp; retry</button>
            </div>
          </div>
        ) : (
          <div className="alert alert-error mb-3">
            <span><span className="font-semibold">Simon Willison:</span> {simonError}</span>
          </div>
        )
      )}
      {everyError && (
        isAuthRequired(everyError) ? (
          <AuthRequiredCallout message="Sign in to every.to in Chrome, then try again." />
        ) : isApprovalError(everyError) ? (
          <div className="alert alert-warning mb-3">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full">
              <span className="flex-1">Every connector requires approval before first use.</span>
              <button className="btn btn-sm btn-warning" onClick={() => handleApprove('every/newsletter')}>Approve &amp; retry</button>
            </div>
          </div>
        ) : (
          <div className="alert alert-error mb-3">
            <span><span className="font-semibold">Every:</span> {everyError}</span>
          </div>
        )
      )}

      {fetchedAt && !loading && (
        <div className="font-mono text-[0.6rem] font-medium opacity-40 uppercase tracking-[0.1em] mb-2">
          {isCached ? 'Showing cached data from' : 'Last fetched'} {timeAgo(fetchedAt)}
        </div>
      )}

      {hasResults && !loading && (
        <div className="grid grid-cols-3 border border-base-300 mb-6">
          <div className="p-3 border-r border-base-300">
            <div className="font-mono text-[0.6rem] font-medium opacity-40 uppercase tracking-[0.1em] mb-1">{RANGE_LABELS[range]}</div>
            <div className="font-display text-xl font-bold">{stats.total}</div>
          </div>
          <div className="p-3 border-r border-base-300">
            <div className="font-mono text-[0.6rem] font-medium opacity-40 uppercase tracking-[0.1em] mb-1">Simon Willison</div>
            <div className="font-display text-xl font-bold">{stats.simonCount}</div>
          </div>
          <div className="p-3">
            <div className="font-mono text-[0.6rem] font-medium opacity-40 uppercase tracking-[0.1em] mb-1">Every</div>
            <div className="font-display text-xl font-bold">{stats.everyCount}</div>
          </div>
        </div>
      )}

      {allItems.length > 0 && (
        <div className="space-y-px">
          {allItems.map((item, i) => (
            <article key={`${item.source}-${i}`} className="border border-base-300 p-4">
              <div className="flex items-start justify-between gap-3 mb-2">
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-semibold hover:text-primary transition-colors leading-snug"
                >
                  {item.title}
                </a>
                <Badge variant={SOURCE_BADGE[item.source] ?? 'neutral'} size="xs">
                  {SOURCE_LABEL[item.source] ?? item.source.toUpperCase()}
                </Badge>
              </div>
              {item.summary && (
                <p className="text-sm opacity-60 leading-relaxed mb-2 line-clamp-2">{item.summary}</p>
              )}
              <div className="flex items-center gap-3 flex-wrap">
                <span className="font-mono text-[0.6rem] opacity-40">{formatDate(item.published)}</span>
                {item.author && (
                  <span className="font-mono text-[0.6rem] opacity-40">{item.author}</span>
                )}
                {item.tags && (
                  <div className="flex gap-1 flex-wrap">
                    {item.tags.split(',').slice(0, 3).map((tag) => (
                      <Badge key={tag.trim()} variant="neutral" size="xs">{tag.trim()}</Badge>
                    ))}
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      {hasResults && allItems.length === 0 && !loading && (
        <div className="border border-base-300 p-6 text-center">
          <p className="text-sm opacity-50 mb-1">No news from the {RANGE_LABELS[range].toLowerCase()}</p>
          <p className="font-mono text-xs opacity-30">Both sources returned data, but nothing within the date window.</p>
        </div>
      )}

      {!hasResults && !loading && !simonError && !everyError && (
        <div className="border border-base-300 p-8 text-center">
          <p className="text-sm opacity-50 mb-1">AI news from Simon Willison and Every</p>
          <p className="font-mono text-xs opacity-30">Select a range and press Load news to fetch the latest posts.</p>
        </div>
      )}
    </div>
  );
}

function SourceIndicator({ label, status }: { label: string; status: SourceStatus }) {
  const color = {
    idle: 'opacity-30',
    loading: 'bg-warning animate-pulse',
    done: 'bg-success',
    error: 'bg-error',
  }[status];

  return (
    <div className="flex items-center gap-1.5">
      <span className={`w-1.5 h-1.5 ${color}`} aria-hidden="true" />
      <span className="font-mono text-[0.6rem] opacity-50 uppercase">{label}</span>
    </div>
  );
}
