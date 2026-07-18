/**
 * Jira Cloud data source — fetches tickets via the jira/my-tickets
 * commandGarden connector through the daemon API.
 *
 * Uses Jira Cloud REST API (mercedes-benz.atlassian.net) with the browser's
 * Atlassian session — no API token required. Connector returns rows with a
 * `category` field (resolved/inProgress/blocker) and Jira issue keys (e.g. PROJ-123).
 */

import type { DaemonClient } from '@commandgarden/shared';
import type { JiraData } from '../journal.types.js';

/** Row shape returned by the jira/my-tickets connector (matches YAML columns).
 *  Uses Jira field names: key (not id), summary, status (not state). */
interface ConnectorRow {
  key: string;
  summary: string;
  status: string;
  type: string;
  resolvedDate: string;
  updatedDate: string;
  staleDays: number;
  category: 'resolved' | 'inProgress' | 'blocker';
}

/** Response shape from daemon /api/run. */
interface DaemonRunResponse {
  ok: boolean;
  data?: ConnectorRow[];
  error?: string;
}

export class JiraSource {
  constructor(private readonly daemon: DaemonClient) {}

  async fetch(weekStart: string, weekEnd: string): Promise<JiraData | null> {
    try {
      // assignee left empty → connector uses Jira's currentUser() function
      const result = await this.daemon.post<DaemonRunResponse>('/api/run', {
        connector: 'jira/my-tickets',
        args: { fromDate: weekStart, toDate: weekEnd },
      });

      if (!result.ok || !result.data || result.data.length === 0) return null;

      // Map connector rows by category to the JiraData sub-arrays.
      // Connector returns Jira issue keys directly (e.g. "PROJ-123").
      const rows = result.data;

      return {
        resolved: rows
          .filter((r) => r.category === 'resolved')
          .map((r) => ({ key: r.key, summary: r.summary, resolvedDate: r.resolvedDate })),
        inProgress: rows
          .filter((r) => r.category === 'inProgress')
          .map((r) => ({ key: r.key, summary: r.summary })),
        blockers: rows
          .filter((r) => r.category === 'blocker')
          .map((r) => ({ key: r.key, summary: r.summary, staleDays: r.staleDays })),
      };
    } catch {
      return null;
    }
  }
}
