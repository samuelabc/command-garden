/**
 * Jira/ADO Work Items data source — fetches tickets via WIQL API.
 * Ported from dashboard/api/src/journal/sources/jira.source.ts.
 *
 * Uses Azure DevOps Work Items API with WIQL queries to find:
 * - Resolved tickets within the date range
 * - Currently in-progress tickets assigned to the user
 * - Blockers: in-progress items with no state change in 3+ days
 */

import { journalConfig } from '../journal.config.js';
import type { JiraData, JiraTicket } from '../journal.types.js';

interface AdoWorkItem {
  id: number;
  fields: {
    'System.Title'?: string;
    'System.State'?: string;
    'System.WorkItemType'?: string;
    'Microsoft.VSTS.Common.ResolvedDate'?: string;
    'Microsoft.VSTS.Common.StateChangeDate'?: string;
    'System.CreatedDate'?: string;
    'System.AssignedTo'?: { uniqueName?: string };
  };
}

export class JiraSource {
  private readonly org = journalConfig.azureDevOps.org;
  private readonly pat = journalConfig.azureDevOps.pat;
  private readonly author = journalConfig.author;

  private headers(): Record<string, string> {
    const token = Buffer.from(`:${this.pat}`).toString('base64');
    return {
      Authorization: `Basic ${token}`,
      'Content-Type': 'application/json',
    };
  }

  async fetch(weekStart: string, weekEnd: string): Promise<JiraData | null> {
    try {
      const [resolved, inProgress] = await Promise.all([
        this.fetchResolved(weekStart, weekEnd),
        this.fetchInProgress(),
      ]);

      // Identify blockers: in-progress items with no state change in 3+ days
      const now = new Date();
      const blockers = inProgress
        .filter((item) => {
          const stateChange = item.fields['Microsoft.VSTS.Common.StateChangeDate'];
          if (!stateChange) return false;
          const days = (now.getTime() - new Date(stateChange).getTime()) / 86400000;
          return days >= 3;
        })
        .map((item) => ({
          key: `#${item.id}`,
          summary: item.fields['System.Title'] ?? '(no title)',
          staleDays: Math.floor(
            (now.getTime() - new Date(item.fields['Microsoft.VSTS.Common.StateChangeDate']!).getTime()) / 86400000,
          ),
        }));

      return {
        resolved: resolved.map((item) => ({
          key: `#${item.id}`,
          summary: item.fields['System.Title'] ?? '(no title)',
          resolvedDate: (item.fields['Microsoft.VSTS.Common.ResolvedDate'] ?? '').slice(0, 10),
        })),
        inProgress: inProgress.map((item) => ({
          key: `#${item.id}`,
          summary: item.fields['System.Title'] ?? '(no title)',
        })),
        blockers,
      };
    } catch {
      return null;
    }
  }

  private async fetchResolved(weekStart: string, weekEnd: string): Promise<AdoWorkItem[]> {
    const wiql = `
      SELECT [System.Id]
      FROM WorkItems
      WHERE [System.AssignedTo] = '${this.author}'
        AND [System.State] IN ('Resolved', 'Closed', 'Done')
        AND [Microsoft.VSTS.Common.ResolvedDate] >= '${weekStart}'
        AND [Microsoft.VSTS.Common.ResolvedDate] <= '${weekEnd}'
      ORDER BY [Microsoft.VSTS.Common.ResolvedDate] DESC
    `;
    return this.queryWorkItems(wiql);
  }

  private async fetchInProgress(): Promise<AdoWorkItem[]> {
    const wiql = `
      SELECT [System.Id]
      FROM WorkItems
      WHERE [System.AssignedTo] = '${this.author}'
        AND [System.State] IN ('Active', 'In Progress', 'Doing')
      ORDER BY [Microsoft.VSTS.Common.StateChangeDate] ASC
    `;
    return this.queryWorkItems(wiql);
  }

  /** Run a WIQL query and batch-fetch work item details. */
  private async queryWorkItems(wiql: string): Promise<AdoWorkItem[]> {
    // Step 1: Run WIQL query to get IDs
    const queryUrl = `https://dev.azure.com/${this.org}/_apis/wit/wiql?api-version=7.1`;
    const queryRes = await fetch(queryUrl, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ query: wiql }),
    });
    if (!queryRes.ok) return [];
    const queryBody = await queryRes.json();
    const ids: number[] = (queryBody.workItems ?? []).map((w: { id: number }) => w.id);
    if (ids.length === 0) return [];

    // Step 2: Get work item details (batch, max 200)
    const batchIds = ids.slice(0, 200);
    const detailUrl =
      `https://dev.azure.com/${this.org}/_apis/wit/workitems` +
      `?ids=${batchIds.join(',')}` +
      `&fields=System.Id,System.Title,System.State,System.WorkItemType,Microsoft.VSTS.Common.ResolvedDate,Microsoft.VSTS.Common.StateChangeDate` +
      `&api-version=7.1`;
    const detailRes = await fetch(detailUrl, { headers: this.headers() });
    if (!detailRes.ok) return [];
    const detailBody = await detailRes.json();
    return (detailBody.value ?? []) as AdoWorkItem[];
  }
}
