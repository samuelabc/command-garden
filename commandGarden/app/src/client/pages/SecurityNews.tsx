import { useState, useCallback, useMemo } from 'react';
import { api, type RunResponse } from '../api';
import { Badge } from '../components/Badge';
import { Spinner } from '../components/Spinner';
import { AuthRequiredCallout } from '../components/AuthRequiredCallout';

interface NewsItem {
  title: string;
  summary: string;
  url: string;
  date: string;
  source: 'socket' | 'wiz';
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

function parseSocketRows(resp: RunResponse): NewsItem[] {
  return (resp.data ?? []).map((r) => ({
    title: String(r.title ?? ''),
    summary: String(r.summary ?? ''),
    url: String(r.url ?? ''),
    date: String(r.date ?? ''),
    source: 'socket' as const,
    author: String(r.author ?? ''),
    tags: String(r.tags ?? ''),
  }));
}

function parseWizRows(resp: RunResponse): NewsItem[] {
  return (resp.data ?? []).map((r) => ({
    title: String(r.title ?? ''),
    summary: String(r.excerpt ?? ''),
    url: String(r.url ?? ''),
    date: String(r.publishedAt ?? ''),
    source: 'wiz' as const,
    author: String(r.authors ?? ''),
    tags: String(r.tags ?? ''),
  }));
}

type SourceStatus = 'idle' | 'loading' | 'done' | 'error';

type RangeDays = 7 | 30;
const RANGE_LABELS: Record<RangeDays, string> = { 7: 'Past 7 days', 30: 'Past 30 days' };

export default function SecurityNews() {
  const [range, setRange] = useState<RangeDays>(7);
  const [socketStatus, setSocketStatus] = useState<SourceStatus>('idle');
  const [wizStatus, setWizStatus] = useState<SourceStatus>('idle');
  const [socketItems, setSocketItems] = useState<NewsItem[]>([]);
  const [wizItems, setWizItems] = useState<NewsItem[]>([]);
  const [socketError, setSocketError] = useState<string | null>(null);
  const [wizError, setWizError] = useState<string | null>(null);

  const loading = socketStatus === 'loading' || wizStatus === 'loading';
  const hasResults = socketItems.length > 0 || wizItems.length > 0;

  const allItems = useMemo(() => {
    const merged = [...socketItems, ...wizItems]
      .filter((item) => isWithinDays(item.date, range))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return merged;
  }, [socketItems, wizItems, range]);

  const stats = useMemo(() => {
    const socketCount = allItems.filter((i) => i.source === 'socket').length;
    const wizCount = allItems.filter((i) => i.source === 'wiz').length;
    return { total: allItems.length, socketCount, wizCount };
  }, [allItems]);

  const handleLoad = useCallback(async () => {
    setSocketStatus('loading');
    setWizStatus('loading');
    setSocketError(null);
    setWizError(null);
    setSocketItems([]);
    setWizItems([]);

    // Fetch both sources in parallel
    const socketPromise = api.run('socket/security-news', {})
      .then((resp) => {
        if (!resp.ok && resp.error) {
          setSocketError(resp.error);
          setSocketStatus('error');
        } else {
          setSocketItems(parseSocketRows(resp));
          setSocketStatus('done');
        }
      })
      .catch((e) => {
        setSocketError(e instanceof Error ? e.message : 'Failed to fetch');
        setSocketStatus('error');
      });

    const wizPromise = api.run('wiz/blog-security', {})
      .then((resp) => {
        if (!resp.ok && resp.error) {
          setWizError(resp.error);
          setWizStatus('error');
        } else {
          setWizItems(parseWizRows(resp));
          setWizStatus('done');
        }
      })
      .catch((e) => {
        setWizError(e instanceof Error ? e.message : 'Failed to fetch');
        setWizStatus('error');
      });

    await Promise.allSettled([socketPromise, wizPromise]);
  }, []);

  const isAuthRequired = (err: string | null) =>
    err?.includes('auth_required') || err?.includes('sign in');

  return (
    <div className="max-w-4xl mx-auto">
      <h2 className="font-display text-xl font-bold uppercase tracking-[0.06em] mb-5">Security News</h2>

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
          <SourceIndicator label="Socket" status={socketStatus} />
          <SourceIndicator label="Wiz" status={wizStatus} />
        </div>
      </div>

      {loading && <Spinner label="Fetching security news..." />}

      {/* Errors */}
      {socketError && (
        isAuthRequired(socketError) ? (
          <AuthRequiredCallout message="Sign in to Socket.dev in Chrome, then try again." />
        ) : (
          <div className="alert alert-error mb-3">
            <span><span className="font-semibold">Socket:</span> {socketError}</span>
          </div>
        )
      )}
      {wizError && (
        isAuthRequired(wizError) ? (
          <AuthRequiredCallout message="Sign in to Wiz in Chrome, then try again." />
        ) : (
          <div className="alert alert-error mb-3">
            <span><span className="font-semibold">Wiz:</span> {wizError}</span>
          </div>
        )
      )}

      {/* Stats bar */}
      {hasResults && !loading && (
        <div className="grid grid-cols-3 border border-base-300 mb-6">
          <div className="p-3 border-r border-base-300">
            <div className="font-mono text-[0.6rem] font-medium opacity-40 uppercase tracking-[0.1em] mb-1">{RANGE_LABELS[range]}</div>
            <div className="font-display text-xl font-bold">{stats.total}</div>
          </div>
          <div className="p-3 border-r border-base-300">
            <div className="font-mono text-[0.6rem] font-medium opacity-40 uppercase tracking-[0.1em] mb-1">Socket</div>
            <div className="font-display text-xl font-bold">{stats.socketCount}</div>
          </div>
          <div className="p-3">
            <div className="font-mono text-[0.6rem] font-medium opacity-40 uppercase tracking-[0.1em] mb-1">Wiz</div>
            <div className="font-display text-xl font-bold">{stats.wizCount}</div>
          </div>
        </div>
      )}

      {/* News feed */}
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
                <Badge variant={item.source === 'socket' ? 'info' : 'secondary'} size="xs">
                  {item.source === 'socket' ? 'SOCKET' : 'WIZ'}
                </Badge>
              </div>
              {item.summary && (
                <p className="text-sm opacity-60 leading-relaxed mb-2 line-clamp-2">{item.summary}</p>
              )}
              <div className="flex items-center gap-3 flex-wrap">
                <span className="font-mono text-[0.6rem] opacity-40">{formatDate(item.date)}</span>
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

      {/* Empty states */}
      {hasResults && allItems.length === 0 && !loading && (
        <div className="border border-base-300 p-6 text-center">
          <p className="text-sm opacity-50 mb-1">No news from the {RANGE_LABELS[range].toLowerCase()}</p>
          <p className="font-mono text-xs opacity-30">Both sources returned data, but nothing within the date window.</p>
        </div>
      )}

      {!hasResults && !loading && !socketError && !wizError && (
        <div className="border border-base-300 p-8 text-center">
          <p className="text-sm opacity-50 mb-1">Security news from Socket and Wiz</p>
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
