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
        <div className="bg-base-200 rounded-box p-4">
          <h3 className="font-semibold mb-2">Insights</h3>
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
