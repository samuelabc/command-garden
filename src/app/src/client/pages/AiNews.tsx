import { useState, useCallback, useMemo, useEffect } from 'react';
import { api, type RunResponse } from '../api';
import { type BadgeVariant } from '../components/Badge';
import { AuthRequiredCallout } from '../components/AuthRequiredCallout';
import { NewsFeedLayout, type FeedItem, type SourceDef } from '../components/NewsFeedLayout';

const SOURCE_VARIANT: Record<string, BadgeVariant> = { simon: 'info', every: 'secondary', mts: 'warning' };
const SOURCE_LABEL: Record<string, string> = { simon: 'Simon Willison', every: 'Every', mts: 'MTS' };

interface AiNewsItem {
  title: string;
  url: string;
  published: string;
  summary: string;
  source: 'simon' | 'every' | 'mts';
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

function parseMtsRows(resp: RunResponse): AiNewsItem[] {
  return (resp.data ?? []).map((r) => ({
    title: String(r.title ?? ''),
    url: String(r.url ?? ''),
    published: String(r.date ?? ''),
    summary: String(r.subtitle ?? ''),
    source: 'mts' as const,
    author: '',
    tags: '',
  }));
}

function toFeedItem(item: AiNewsItem): FeedItem {
  return { ...item, date: item.published };
}

type SourceStatus = 'idle' | 'loading' | 'done' | 'error';
type RangeDays = 7 | 30;

export default function AiNews() {
  const [range, setRange] = useState<RangeDays>(7);
  const [simonStatus, setSimonStatus] = useState<SourceStatus>('idle');
  const [everyStatus, setEveryStatus] = useState<SourceStatus>('idle');
  const [mtsStatus, setMtsStatus] = useState<SourceStatus>('idle');
  const [simonItems, setSimonItems] = useState<AiNewsItem[]>([]);
  const [everyItems, setEveryItems] = useState<AiNewsItem[]>([]);
  const [mtsItems, setMtsItems] = useState<AiNewsItem[]>([]);
  const [simonError, setSimonError] = useState<string | null>(null);
  const [everyError, setEveryError] = useState<string | null>(null);
  const [mtsError, setMtsError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [isCached, setIsCached] = useState(false);
  const [approvedHighRisk, setApprovedHighRisk] = useState<Record<string, string[]>>({});

  const loadConfig = useCallback(() => {
    api.getConfig()
      .then((res) => {
        const security = (res.config.security ?? {}) as Record<string, unknown>;
        const raw = security.approvedHighRisk;
        setApprovedHighRisk(
          (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw as Record<string, string[]> : {},
        );
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
        const mts: AiNewsItem[] = [];
        for (const r of res.data) {
          const item = r as unknown as AiNewsItem;
          if (item.source === 'every') every.push(item);
          else if (item.source === 'mts') mts.push(item);
          else simon.push(item);
        }
        setSimonItems(simon);
        setEveryItems(every);
        setMtsItems(mts);
        setFetchedAt(res.fetchedAt);
        setIsCached(true);
        setEveryStatus('done');
        setMtsStatus('done');
      }
    }).catch(() => {});
    return () => { stale = true; };
  }, [loadConfig]);

  const loading = simonStatus === 'loading' || everyStatus === 'loading' || mtsStatus === 'loading';

  const allItems = useMemo<FeedItem[]>(() => {
    return [...simonItems, ...everyItems, ...mtsItems]
      .filter((item) => isWithinDays(item.published, range))
      .sort((a, b) => new Date(b.published).getTime() - new Date(a.published).getTime())
      .map(toFeedItem);
  }, [simonItems, everyItems, mtsItems, range]);

  const sources = useMemo<SourceDef[]>(() => {
    const counts: Record<string, number> = {};
    for (const item of allItems) counts[item.source] = (counts[item.source] ?? 0) + 1;
    return (['simon', 'every', 'mts'] as const).map((key) => ({
      key,
      label: SOURCE_LABEL[key],
      variant: SOURCE_VARIANT[key],
      status: ({ simon: simonStatus, every: everyStatus, mts: mtsStatus })[key],
      count: counts[key] ?? 0,
    }));
  }, [allItems, simonStatus, everyStatus, mtsStatus]);

  const handleLoad = useCallback(async () => {
    setSimonStatus('loading');
    setEveryStatus('loading');
    setMtsStatus('loading');
    setSimonError(null);
    setEveryError(null);
    setMtsError(null);
    setSimonItems([]);
    setEveryItems([]);
    setMtsItems([]);
    setIsCached(false);

    let freshSimon: AiNewsItem[] = [];
    let freshEvery: AiNewsItem[] = [];
    let freshMts: AiNewsItem[] = [];

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

    const mtsPromise = api.run('mtslive/archive', {})
      .then((resp) => {
        if (!resp.ok && resp.error) {
          setMtsError(resp.error);
          setMtsStatus('error');
        } else {
          freshMts = parseMtsRows(resp);
          setMtsItems(freshMts);
          setMtsStatus('done');
        }
      })
      .catch((e) => {
        setMtsError(e instanceof Error ? e.message : 'Failed to fetch');
        setMtsStatus('error');
      });

    await Promise.allSettled([simonPromise, everyPromise, mtsPromise]);

    const all = [...freshSimon, ...freshEvery, ...freshMts];
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
    const updated = { ...approvedHighRisk, [connectorKey]: ['js_evaluate'] };
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
    <NewsFeedLayout
      title="AI News"
      description="Aggregated AI news from Simon Willison, Every, and MTS — load to fetch the latest posts."
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
          {mtsError && (
            isAuthRequired(mtsError) ? (
              <AuthRequiredCallout message="Sign in to mtslive.substack.com in Chrome, then try again." />
            ) : (
              <div className="alert alert-error mb-3">
                <span><span className="font-semibold">MTS:</span> {mtsError}</span>
              </div>
            )
          )}
        </>
      }
    />
  );
}
