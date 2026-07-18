/**
 * Git data source — fetches commits and PRs via the ado/git-commits
 * commandGarden connector through the daemon API.
 *
 * Phase 3 rewrite: replaced direct REST API calls + PAT auth with a single
 * daemon.post('/api/run') call per repo. The connector uses the browser's
 * MSAL session token — no PAT required.
 */

import type { DaemonClient } from '@commandgarden/shared';
import type { JournalConfig } from '../journal.config.js';
import type { GitData, GitDaily, GitRepoActivity } from '../journal.types.js';

/** Row shape returned by the ado/git-commits connector (matches YAML columns). */
interface ConnectorRow {
  commitId: string;
  authorName: string;
  authorEmail: string;
  date: string;
  message: string;
  filesAdded: number;
  filesEdited: number;
  filesDeleted: number;
  isPR: string;
  prId: number;
}

/** Response shape from daemon /api/run. */
interface DaemonRunResponse {
  ok: boolean;
  data?: ConnectorRow[];
  error?: string;
}

export class GitSource {
  private readonly org: string;
  private readonly repos: { project: string; repo: string }[];
  private readonly author: string;

  constructor(private readonly daemon: DaemonClient, config: JournalConfig) {
    this.org = config.azureDevOps.org;
    this.repos = config.azureDevOps.repos;
    this.author = config.author;
  }

  async fetch(_weekStart: string, _weekEnd: string): Promise<GitData> {
    try {
      // Call the ado/git-commits connector once per configured repo via daemon
      const results = await Promise.all(
        this.repos.map((r) => this.fetchRepo(r.project, r.repo, _weekStart, _weekEnd)),
      );

      // Aggregate daily commits across all repos
      const dailyMap = new Map<string, GitDaily>();
      const repoActivity: GitRepoActivity[] = [];
      let totalPRsMerged = 0;

      for (let i = 0; i < this.repos.length; i++) {
        const { project, repo } = this.repos[i];
        const rows = results[i];
        const commitRows = rows.filter((r) => r.isPR !== 'true');
        const prRows = rows.filter((r) => r.isPR === 'true');
        repoActivity.push({ project, repo, commits: commitRows.length });
        totalPRsMerged += prRows.length;

        for (const r of commitRows) {
          const date = r.date;
          const entry = dailyMap.get(date) ?? { date, commits: 0, filesChanged: 0 };
          entry.commits += 1;
          entry.filesChanged += (r.filesAdded ?? 0) + (r.filesEdited ?? 0) + (r.filesDeleted ?? 0);
          dailyMap.set(date, entry);
        }
      }

      const daily = [...dailyMap.values()].sort((a, b) => a.date.localeCompare(b.date));
      const totalCommits = daily.reduce((sum, d) => sum + d.commits, 0);

      return {
        totalCommits,
        totalPRsMerged,
        totalPRsReviewed: 0,
        daily,
        repos: repoActivity.filter((r) => r.commits > 0),
      };
    } catch (e) {
      console.error('[git] fetch error:', e);
      // Graceful degradation: return empty data instead of failing
      return { totalCommits: 0, totalPRsMerged: 0, totalPRsReviewed: 0, daily: [], repos: [] };
    }
  }

  /** Fetch a single repo's commits+PRs via the daemon connector. */
  private async fetchRepo(project: string, repo: string, fromDate: string, toDate: string): Promise<ConnectorRow[]> {
    try {
      const result = await this.daemon.post<DaemonRunResponse>('/api/run', {
        connector: 'ado/git-commits',
        args: { org: this.org, project, repo, fromDate, toDate, author: this.author },
      });
      return result.ok && result.data ? result.data : [];
    } catch {
      return [];
    }
  }
}
