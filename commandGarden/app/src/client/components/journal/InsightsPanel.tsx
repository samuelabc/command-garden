/**
 * Insights panel — shows rule-based insights and error warnings.
 * Ported from dashboard/web/components/journal/InsightsPanel.tsx.
 * Removed 'use client' directive (not needed in Vite React).
 */

interface Props {
  insights: string[];
  errors: string[];
}

export function InsightsPanel({ insights, errors }: Props) {
  return (
    <div className="space-y-3">
      {insights.length > 0 && (
        <div className="border border-base-300 p-4">
          <p className="font-mono text-[0.65rem] font-medium opacity-50 uppercase tracking-[0.12em] mb-2">Insights</p>
          <ul className="list-disc list-inside space-y-1 text-sm">
            {insights.map((insight, i) => (
              <li key={i}>{insight}</li>
            ))}
          </ul>
        </div>
      )}
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
