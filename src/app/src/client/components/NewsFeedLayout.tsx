import { type ReactNode, useState, useMemo } from 'react';
import { Badge, type BadgeVariant } from './Badge';

export interface FeedItem {
  title: string;
  summary: string;
  url: string;
  date: string;
  source: string;
  author: string;
  tags: string;
}

type SourceStatus = 'idle' | 'loading' | 'done' | 'error';

export interface SourceDef {
  key: string;
  label: string;
  variant: BadgeVariant;
  status: SourceStatus;
  count: number;
}

type RangeDays = 7 | 30;

interface NewsFeedLayoutProps {
  title: string;
  description: string;
  items: FeedItem[];
  sources: SourceDef[];
  range: RangeDays;
  onRangeChange: (r: RangeDays) => void;
  loading: boolean;
  onLoad: () => void;
  fetchedAt: string | null;
  isCached: boolean;
  errors?: ReactNode;
}

const VARIANT_DOT: Record<BadgeVariant, string> = {
  info: 'bg-sky-500',
  secondary: 'bg-violet-500',
  warning: 'bg-amber-500',
  success: 'bg-emerald-500',
  error: 'bg-red-500',
  neutral: 'bg-base-content/40',
};

const STATUS_RING: Record<SourceStatus, string> = {
  idle: '',
  loading: 'ring-1 ring-amber-400 animate-pulse',
  done: '',
  error: 'ring-1 ring-red-500',
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const diff = Date.now() - d.getTime();
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

type TimeGroup = 'today' | 'yesterday' | 'thisWeek' | 'earlier';
const GROUP_LABELS: Record<TimeGroup, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  thisWeek: 'This week',
  earlier: 'Earlier',
};

function getTimeGroup(dateStr: string): TimeGroup {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return 'earlier';
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday.getTime() - 86_400_000);
  const startOfWeek = new Date(startOfToday.getTime() - 6 * 86_400_000);

  if (d.getTime() >= startOfToday.getTime()) return 'today';
  if (d.getTime() >= startOfYesterday.getTime()) return 'yesterday';
  if (d.getTime() >= startOfWeek.getTime()) return 'thisWeek';
  return 'earlier';
}

function groupItems(items: FeedItem[]): { group: TimeGroup; items: FeedItem[] }[] {
  const buckets: Record<TimeGroup, FeedItem[]> = { today: [], yesterday: [], thisWeek: [], earlier: [] };
  for (const item of items) {
    buckets[getTimeGroup(item.date)].push(item);
  }
  const order: TimeGroup[] = ['today', 'yesterday', 'thisWeek', 'earlier'];
  return order.filter((g) => buckets[g].length > 0).map((g) => ({ group: g, items: buckets[g] }));
}

export function NewsFeedLayout({
  title,
  description,
  items,
  sources,
  range,
  onRangeChange,
  loading,
  onLoad,
  fetchedAt,
  isCached,
  errors,
}: NewsFeedLayoutProps) {
  const [hiddenSources, setHiddenSources] = useState<Set<string>>(new Set());

  const toggleSource = (key: string) => {
    setHiddenSources((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const visibleItems = useMemo(
    () => items.filter((i) => !hiddenSources.has(i.source)),
    [items, hiddenSources],
  );

  const { leadItem, restItems } = useMemo(() => {
    const [lead, ...rest] = visibleItems;
    return { leadItem: lead, restItems: rest };
  }, [visibleItems]);
  const grouped = useMemo(() => groupItems(restItems), [restItems]);
  const hasResults = items.length > 0;

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-baseline justify-between mb-6">
        <h2 className="font-display text-xl font-bold uppercase tracking-[0.06em]">{title}</h2>
        {fetchedAt && !loading && (
          <span className="font-mono text-[0.6rem] font-medium opacity-30 uppercase tracking-[0.1em]">
            {isCached ? 'cached' : 'live'} {timeAgo(fetchedAt)}
          </span>
        )}
      </div>

      {/* Toolbar: source chips + range + load */}
      <div className="flex flex-col gap-3 mb-6">
        <div className="flex flex-wrap items-center gap-2">
          {sources.map((s) => {
            const active = !hiddenSources.has(s.key);
            return (
              <button
                key={s.key}
                onClick={() => toggleSource(s.key)}
                className={`inline-flex items-center gap-1.5 px-2 py-1 border font-mono text-[0.65rem] uppercase tracking-[0.05em] transition-all duration-75 ${
                  active
                    ? 'border-base-300 text-base-content'
                    : 'border-base-300/50 text-base-content/30'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 shrink-0 ${VARIANT_DOT[s.variant]} ${STATUS_RING[s.status]} ${
                    !active ? 'opacity-30' : ''
                  }`}
                  aria-hidden="true"
                />
                <span>{s.label}</span>
                {s.count > 0 && (
                  <span className="opacity-40">{s.count}</span>
                )}
              </button>
            );
          })}

          <div className="ml-auto flex items-center gap-2">
            <div className="flex border border-base-300">
              {([7, 30] as const).map((d) => (
                <button
                  key={d}
                  onClick={() => onRangeChange(d)}
                  className={`px-2.5 py-1 font-mono text-[0.65rem] uppercase tracking-[0.05em] transition-colors duration-75 ${
                    range === d
                      ? 'bg-base-content text-base-100'
                      : 'text-base-content/50 hover:text-base-content'
                  }`}
                >
                  {d}d
                </button>
              ))}
            </div>
            <button
              className="btn btn-primary btn-sm px-4"
              onClick={onLoad}
              disabled={loading}
            >
              {loading ? 'Fetching\u2026' : 'Load'}
            </button>
          </div>
        </div>
      </div>

      {/* Errors slot */}
      {errors}

      {/* Skeleton loading state */}
      {loading && !hasResults && <SkeletonFeed />}
      {loading && hasResults && (
        <div className="mb-4">
          <div className="flex items-center gap-2">
            <span className="loading loading-spinner loading-sm" />
            <span className="font-mono text-[0.6rem] uppercase tracking-[0.1em] opacity-40">Refreshing sources\u2026</span>
          </div>
        </div>
      )}

      {/* Lead article */}
      {leadItem && !loading && (
        <LeadArticle item={leadItem} sources={sources} />
      )}

      {/* Grouped feed */}
      {grouped.length > 0 && !loading && (
        <div className="mt-1">
          {grouped.map(({ group, items: groupItems }) => (
            <div key={group}>
              <div className="flex items-center gap-3 mt-6 mb-3">
                <span className="font-mono text-[0.6rem] font-medium opacity-40 uppercase tracking-[0.1em]">
                  {GROUP_LABELS[group]}
                </span>
                <span className="font-mono text-[0.6rem] opacity-20">{groupItems.length}</span>
                <div className="flex-1 border-b border-base-300" />
              </div>
              <div className="border border-base-300 divide-y divide-base-300">
                {groupItems.map((item, i) => (
                  <CompactArticle key={`${item.source}-${i}`} item={item} sources={sources} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty: data loaded but nothing in range */}
      {hasResults && visibleItems.length === 0 && !loading && (
        <div className="border border-base-300 p-8 text-center mt-6">
          <p className="text-sm opacity-50 mb-1">No articles match the current filters</p>
          <p className="font-mono text-xs opacity-30">
            {hiddenSources.size > 0
              ? 'Try enabling more sources or expanding the date range.'
              : 'All sources returned data, but nothing falls within this window.'}
          </p>
        </div>
      )}

      {/* Empty: initial state */}
      {!hasResults && !loading && !errors && (
        <div className="border border-base-300 mt-2">
          <div className="p-10 text-center">
            <p className="font-display text-base font-semibold mb-2">{title}</p>
            <p className="text-sm opacity-50 mb-4 max-w-sm mx-auto">{description}</p>
            <button className="btn btn-primary btn-sm px-6" onClick={onLoad}>
              Load news
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function LeadArticle({ item, sources }: { item: FeedItem; sources: SourceDef[] }) {
  const src = sources.find((s) => s.key === item.source);
  return (
    <article className="border-b border-base-300 pb-5">
      <div className="flex items-center gap-2 mb-3">
        {src && (
          <span className="inline-flex items-center gap-1.5 font-mono text-[0.6rem] uppercase tracking-[0.05em] opacity-50">
            <span className={`w-1.5 h-1.5 ${VARIANT_DOT[src.variant]}`} aria-hidden="true" />
            {src.label}
          </span>
        )}
        <span className="font-mono text-[0.6rem] opacity-30">{formatDate(item.date)}</span>
      </div>
      <a
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
        className="block font-display text-lg font-bold leading-snug hover:text-primary transition-colors mb-2"
      >
        {item.title}
      </a>
      {item.summary && (
        <p className="text-sm leading-relaxed opacity-60 mb-3 max-w-prose">
          {item.summary}
        </p>
      )}
      <div className="flex items-center gap-3 flex-wrap">
        {item.author && (
          <span className="font-mono text-[0.6rem] opacity-40">{item.author}</span>
        )}
        {item.tags && (
          <div className="flex gap-1 flex-wrap">
            {item.tags.split(',').slice(0, 4).map((tag) => (
              <Badge key={tag.trim()} variant="neutral" size="xs">{tag.trim()}</Badge>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}

function CompactArticle({ item, sources }: { item: FeedItem; sources: SourceDef[] }) {
  const src = sources.find((s) => s.key === item.source);
  return (
    <article className="group px-4 py-3 hover:bg-base-200/50 transition-colors duration-75">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium leading-snug hover:text-primary transition-colors"
          >
            {item.title}
          </a>
          {item.summary && (
            <p className="text-sm leading-relaxed opacity-50 mt-1.5 line-clamp-2">
              {item.summary}
            </p>
          )}
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            {item.author && (
              <span className="font-mono text-[0.6rem] opacity-30">{item.author}</span>
            )}
            {item.tags && item.tags.split(',').slice(0, 2).map((tag) => (
              <Badge key={tag.trim()} variant="neutral" size="xs">{tag.trim()}</Badge>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 pt-0.5">
          {src && (
            <span className="inline-flex items-center gap-1 font-mono text-[0.6rem] uppercase tracking-[0.05em] opacity-30">
              <span className={`w-1 h-1 ${VARIANT_DOT[src.variant]}`} aria-hidden="true" />
              {src.label}
            </span>
          )}
          <span className="font-mono text-[0.6rem] opacity-25 tabular-nums">{formatDate(item.date)}</span>
        </div>
      </div>
    </article>
  );
}

function SkeletonFeed() {
  return (
    <div className="space-y-4 animate-pulse mt-2">
      {/* Lead skeleton */}
      <div className="border-b border-base-300 pb-5">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-1.5 h-1.5 bg-base-300" />
          <div className="h-2 w-16 bg-base-300" />
          <div className="h-2 w-10 bg-base-300" />
        </div>
        <div className="h-5 w-3/4 bg-base-300 mb-2" />
        <div className="h-3 w-full bg-base-200 mb-1.5" />
        <div className="h-3 w-2/3 bg-base-200" />
      </div>
      {/* Compact skeletons */}
      <div>
        <div className="flex items-center gap-3 mb-3">
          <div className="h-2 w-12 bg-base-300" />
          <div className="flex-1 border-b border-base-300" />
        </div>
        <div className="border border-base-300 divide-y divide-base-300">
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className="px-4 py-3 flex items-center justify-between">
              <div className="flex-1">
                <div className="h-3.5 bg-base-300 mb-1.5" style={{ width: `${55 + n * 8}%` }} />
                <div className="h-2 w-20 bg-base-200" />
              </div>
              <div className="flex items-center gap-2 ml-4">
                <div className="w-1 h-1 bg-base-300" />
                <div className="h-2 w-12 bg-base-200" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
