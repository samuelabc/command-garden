import { useState, useCallback, useMemo, useEffect } from 'react';
import { api, type RunResponse } from '../api';
import { type BadgeVariant } from '../components/Badge';
import { AuthRequiredCallout } from '../components/AuthRequiredCallout';
import { NewsFeedLayout, type FeedItem, type SourceDef } from '../components/NewsFeedLayout';

const SOURCE_VARIANT: Record<string, BadgeVariant> = { socket: 'info', wiz: 'secondary', tldrsec: 'warning', trailofbits: 'success' };
const SOURCE_LABEL: Record<string, string> = { socket: 'Socket', wiz: 'Wiz', tldrsec: 'tl;dr sec', trailofbits: 'Trail of Bits' };

interface NewsItem {
  title: string;
  summary: string;
  url: string;
  date: string;
  source: 'socket' | 'wiz' | 'tldrsec' | 'trailofbits';
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

function parseTldrsecRows(resp: RunResponse): NewsItem[] {
  return (resp.data ?? []).map((r) => ({
    title: String(r.title ?? ''),
    summary: String(r.excerpt ?? ''),
    url: String(r.url ?? ''),
    date: String(r.publishedAt ?? ''),
    source: 'tldrsec' as const,
    author: String(r.authors ?? ''),
    tags: String(r.tags ?? ''),
  }));
}

function parseTrailofbitsRows(resp: RunResponse): NewsItem[] {
  return (resp.data ?? []).map((r) => ({
    title: String(r.title ?? ''),
    summary: String(r.summary ?? ''),
    url: String(r.url ?? ''),
    date: String(r.published ?? ''),
    source: 'trailofbits' as const,
    author: '',
    tags: String(r.tags ?? ''),
  }));
}

type SourceStatus = 'idle' | 'loading' | 'done' | 'error';
type RangeDays = 7 | 30;

export default function SecurityNews() {
  const [range, setRange] = useState<RangeDays>(7);
  const [socketStatus, setSocketStatus] = useState<SourceStatus>('idle');
  const [wizStatus, setWizStatus] = useState<SourceStatus>('idle');
  const [tldrsecStatus, setTldrsecStatus] = useState<SourceStatus>('idle');
  const [trailofbitsStatus, setTrailofbitsStatus] = useState<SourceStatus>('idle');
  const [socketItems, setSocketItems] = useState<NewsItem[]>([]);
  const [wizItems, setWizItems] = useState<NewsItem[]>([]);
  const [tldrsecItems, setTldrsecItems] = useState<NewsItem[]>([]);
  const [trailofbitsItems, setTrailofbitsItems] = useState<NewsItem[]>([]);
  const [socketError, setSocketError] = useState<string | null>(null);
  const [wizError, setWizError] = useState<string | null>(null);
  const [tldrsecError, setTldrsecError] = useState<string | null>(null);
  const [trailofbitsError, setTrailofbitsError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [isCached, setIsCached] = useState(false);

  useEffect(() => {
    let stale = false;
    api.getCachedSecurityNews().then((res) => {
      if (stale) return;
      if (res.data && res.data.length > 0) {
        setSocketStatus((cur) => {
          if (cur === 'loading') { stale = true; return cur; }
          return 'done';
        });
        if (stale) return;
        const socket: NewsItem[] = [];
        const wiz: NewsItem[] = [];
        const tldrsec: NewsItem[] = [];
        const trailofbits: NewsItem[] = [];
        for (const r of res.data) {
          const item = r as unknown as NewsItem;
          if (item.source === 'wiz') wiz.push(item);
          else if (item.source === 'tldrsec') tldrsec.push(item);
          else if (item.source === 'trailofbits') trailofbits.push(item);
          else socket.push(item);
        }
        setSocketItems(socket);
        setWizItems(wiz);
        setTldrsecItems(tldrsec);
        setTrailofbitsItems(trailofbits);
        setFetchedAt(res.fetchedAt);
        setIsCached(true);
        setWizStatus('done');
        setTldrsecStatus('done');
        setTrailofbitsStatus('done');
      }
    }).catch(() => {});
    return () => { stale = true; };
  }, []);

  const loading = socketStatus === 'loading' || wizStatus === 'loading' || tldrsecStatus === 'loading' || trailofbitsStatus === 'loading';

  const allItems = useMemo<FeedItem[]>(() => {
    return [...socketItems, ...wizItems, ...tldrsecItems, ...trailofbitsItems]
      .filter((item) => isWithinDays(item.date, range))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [socketItems, wizItems, tldrsecItems, trailofbitsItems, range]);

  const sources = useMemo<SourceDef[]>(() => {
    const counts: Record<string, number> = {};
    for (const item of allItems) counts[item.source] = (counts[item.source] ?? 0) + 1;
    return (['socket', 'wiz', 'tldrsec', 'trailofbits'] as const).map((key) => ({
      key,
      label: SOURCE_LABEL[key],
      variant: SOURCE_VARIANT[key],
      status: ({ socket: socketStatus, wiz: wizStatus, tldrsec: tldrsecStatus, trailofbits: trailofbitsStatus })[key],
      count: counts[key] ?? 0,
    }));
  }, [allItems, socketStatus, wizStatus, tldrsecStatus, trailofbitsStatus]);

  const handleLoad = useCallback(async () => {
    setSocketStatus('loading');
    setWizStatus('loading');
    setTldrsecStatus('loading');
    setTrailofbitsStatus('loading');
    setSocketError(null);
    setWizError(null);
    setTldrsecError(null);
    setTrailofbitsError(null);
    setSocketItems([]);
    setWizItems([]);
    setTldrsecItems([]);
    setTrailofbitsItems([]);
    setIsCached(false);

    let freshSocket: NewsItem[] = [];
    let freshWiz: NewsItem[] = [];
    let freshTldrsec: NewsItem[] = [];
    let freshTrailofbits: NewsItem[] = [];

    const socketPromise = api.run('socket/security-news', {})
      .then((resp) => {
        if (!resp.ok && resp.error) {
          setSocketError(resp.error);
          setSocketStatus('error');
        } else {
          freshSocket = parseSocketRows(resp);
          setSocketItems(freshSocket);
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
          freshWiz = parseWizRows(resp);
          setWizItems(freshWiz);
          setWizStatus('done');
        }
      })
      .catch((e) => {
        setWizError(e instanceof Error ? e.message : 'Failed to fetch');
        setWizStatus('error');
      });

    const tldrsecPromise = api.run('tldrsec/newsletter', {})
      .then((resp) => {
        if (!resp.ok && resp.error) {
          setTldrsecError(resp.error);
          setTldrsecStatus('error');
        } else {
          freshTldrsec = parseTldrsecRows(resp);
          setTldrsecItems(freshTldrsec);
          setTldrsecStatus('done');
        }
      })
      .catch((e) => {
        setTldrsecError(e instanceof Error ? e.message : 'Failed to fetch');
        setTldrsecStatus('error');
      });

    const trailofbitsPromise = api.run('trailofbits/blog', {})
      .then((resp) => {
        if (!resp.ok && resp.error) {
          setTrailofbitsError(resp.error);
          setTrailofbitsStatus('error');
        } else {
          freshTrailofbits = parseTrailofbitsRows(resp);
          setTrailofbitsItems(freshTrailofbits);
          setTrailofbitsStatus('done');
        }
      })
      .catch((e) => {
        setTrailofbitsError(e instanceof Error ? e.message : 'Failed to fetch');
        setTrailofbitsStatus('error');
      });

    await Promise.allSettled([socketPromise, wizPromise, tldrsecPromise, trailofbitsPromise]);

    const all = [...freshSocket, ...freshWiz, ...freshTldrsec, ...freshTrailofbits];
    if (all.length > 0) {
      const now = new Date().toISOString();
      setFetchedAt(now);
      api.cacheSecurityNews(all as unknown as Record<string, unknown>[]).catch(() => {});
    }
  }, []);

  const isAuthRequired = (err: string | null) =>
    err?.includes('auth_required') || err?.includes('sign in');

  return (
    <NewsFeedLayout
      title="Security News"
      description="Aggregated security news from Socket, Wiz, tl;dr sec, and Trail of Bits — load to fetch the latest posts."
      items={allItems}
      sources={sources}
      range={range}
      onRangeChange={setRange}
      loading={loading}
      onLoad={handleLoad}
      fetchedAt={fetchedAt}
      isCached={isCached}
      errors={
        <>
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
          {tldrsecError && (
            <div className="alert alert-error mb-3">
              <span><span className="font-semibold">tl;dr sec:</span> {tldrsecError}</span>
            </div>
          )}
          {trailofbitsError && (
            <div className="alert alert-error mb-3">
              <span><span className="font-semibold">Trail of Bits:</span> {trailofbitsError}</span>
            </div>
          )}
        </>
      }
    />
  );
}
