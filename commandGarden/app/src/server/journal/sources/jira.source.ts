/**
 * Jira/ADO Work Items data source — fetches tickets via the jira/my-tickets
 * commandGarden connector through the daemon API.
 *
 * Phase 3 rewrite: replaced direct WIQL API calls + PAT auth with a single
 * daemon.post('/api/run') call. The connector uses the browser's MSAL session
 * token — no PAT required. Connector returns rows with a `category` field
 * (resolved/inProgress/blocker) that maps directly to the JiraData sub-arrays.
 */

import type { DaemonClient } from '@commandgarden/shared';
import { journalConfig } from '../journal.config.js';
import type { JiraData } from '../journal.types.js';

/** Row shape returned by the jira/my-tickets connector (matches YAML columns). */
interface ConnectorRow {
  id: number;
  title: string;
  state: string;
  type: string;
  resolvedDate: string;
  stateChangeDate: string;
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
  private readonly author = journalConfig.author;

  constructor(private readonly daemon: DaemonClient) {}

  async fetch(weekStart: string, weekEnd: string): Promise<JiraData | null> {
    try {
      const result = await this.daemon.post<DaemonRunResponse>('/api/run', {
        connector: 'jira/my-tickets',
        args: { fromDate: weekStart, toDate: weekEnd, assignee: this.author },
      });

      if (!result.ok || !result.data || result.data.length === 0) return null;

      // Map connector rows by category to the JiraData sub-arrays
      const rows = result.data;

      return {
        resolved: rows
          .filter((r) => r.category === 'resolved')
          .map((r) => ({ key: `#${r.id}`, summary: r.title, resolvedDate: r.resolvedDate })),
        inProgress: rows
          .filter((r) => r.category === 'inProgress')
          .map((r) => ({ key: `#${r.id}`, summary: r.title })),
        blockers: rows
          .filter((r) => r.category === 'blocker')
          .map((r) => ({ key: `#${r.id}`, summary: r.title, staleDays: r.staleDays })),
      };
    } catch {
      return null;
    }
  }
}
