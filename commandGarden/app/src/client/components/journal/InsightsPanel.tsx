/**
 * Insights panel — weekly health strip + structured insight items.
 * Replaced the original flat string list with typed insights grouped
 * by severity, plus a 4-column health strip showing per-category status.
 */

import { useMemo } from 'react';
import { AlertTriangle, CheckCircle, Info, Clock, Calendar, Ticket, GitBranch } from 'lucide-react';
import type { Insight, InsightSeverity, InsightCategory, JournalCrossRef } from '../../types/journal';

interface Props {
  insights: Insight[];
  errors: string[];
  crossRef: JournalCrossRef | null;
}

const SEVERITY_ORDER: InsightSeverity[] = ['action', 'warning', 'info', 'positive'];

const SEVERITY_STYLE: Record<InsightSeverity, { border: string; icon: typeof AlertTriangle; iconClass: string }> = {
  action:   { border: 'border-l-error',   icon: AlertTriangle, iconClass: 'text-error' },
  warning:  { border: 'border-l-warning', icon: AlertTriangle, iconClass: 'text-warning' },
  info:     { border: 'border-l-info',    icon: Info,          iconClass: 'text-info' },
  positive: { border: 'border-l-success', icon: CheckCircle,   iconClass: 'text-success' },
};

const CATEGORY_META: { key: InsightCategory; label: string; icon: typeof Clock }[] = [
  { key: 'time',     label: 'Time',     icon: Clock },
  { key: 'meetings', label: 'Meetings', icon: Calendar },
  { key: 'tickets',  label: 'Tickets',  icon: Ticket },
  { key: 'code',     label: 'Code',     icon: GitBranch },
];

/** Derive the worst severity for a category from the insight list. */
function categoryStatus(insights: Insight[], category: InsightCategory): InsightSeverity {
  for (const sev of SEVERITY_ORDER) {
    if (insights.some((i) => i.category === category && i.severity === sev)) return sev;
  }
  return 'positive';
}

const STATUS_DOT: Record<InsightSeverity, string> = {
  action:   'bg-error',
  warning:  'bg-warning',
  info:     'bg-info',
  positive: 'bg-success opacity-40',
};

function categorySubtitle(category: InsightCategory, crossRef: JournalCrossRef | null): string {
  if (!crossRef) return '—';
  switch (category) {
    case 'time':     return `${crossRef.codingHours}h non-meeting`;
    case 'meetings': return `${Math.round(crossRef.meetingRatio * 100)}% of hours`;
    case 'tickets':  return '';
    case 'code':     return crossRef.zeroCodingDays.length > 0 ? `${crossRef.zeroCodingDays.length} zero-commit day${crossRef.zeroCodingDays.length !== 1 ? 's' : ''}` : 'Active';
  }
}

export function InsightsPanel({ insights, errors, crossRef }: Props) {
  const sorted = useMemo(
    () => [...insights].sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity)),
    [insights],
  );

  const isAllClear = sorted.length === 1 && sorted[0].id === 'all-clear';

  return (
    <div className="space-y-3">
      {/* Health strip — 4 category indicators */}
      {crossRef && (
        <div className="grid grid-cols-2 md:grid-cols-4 border border-base-300">
          {CATEGORY_META.map(({ key, label, icon: Icon }, idx) => {
            const status = categoryStatus(insights, key);
            const sub = categorySubtitle(key, crossRef);
            return (
              <div
                key={key}
                className={`p-3 ${idx < CATEGORY_META.length - 1 ? 'border-r border-base-300' : ''} ${idx < 2 ? 'border-b border-base-300 md:border-b-0' : ''}`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className={`inline-block w-1.5 h-1.5 ${STATUS_DOT[status]}`} />
                  <Icon className="w-3 h-3 opacity-40" aria-hidden="true" />
                  <span className="font-mono text-[0.6rem] font-medium opacity-50 uppercase tracking-[0.1em]">{label}</span>
                </div>
                {sub && <div className="text-xs opacity-50 pl-[22px]">{sub}</div>}
              </div>
            );
          })}
        </div>
      )}

      {/* Insight items — sorted by severity */}
      {sorted.length > 0 && !isAllClear && (
        <div className="border border-base-300 divide-y divide-base-300">
          {sorted.map((insight) => {
            const style = SEVERITY_STYLE[insight.severity];
            const IconComponent = style.icon;
            return (
              <div
                key={insight.id}
                className={`flex items-start gap-3 p-3 border-l-2 ${style.border}`}
              >
                <IconComponent className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${style.iconClass}`} aria-hidden="true" />
                <div className="min-w-0">
                  <span className="text-sm font-medium">{insight.title}</span>
                  <span className="text-xs opacity-60 ml-2">{insight.detail}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* All-clear state */}
      {isAllClear && (
        <div className="border border-base-300 p-4 flex items-center gap-3">
          <CheckCircle className="w-4 h-4 text-success opacity-60" aria-hidden="true" />
          <span className="text-sm opacity-60">No issues detected this week.</span>
        </div>
      )}

      {/* Source errors */}
      {errors.length > 0 && (
        <div className="alert alert-warning text-sm">
          <div>
            <p className="font-semibold">Some data sources had issues:</p>
            <ul className="list-disc list-inside mt-1">
              {errors.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
