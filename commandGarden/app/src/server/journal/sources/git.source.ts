/**
 * Git data source — fetches commits and PRs from Azure DevOps REST API.
 * Ported from dashboard/api/src/journal/sources/git.source.ts.
 *
 * Uses the Pushes API (not Commits API) to capture work across ALL branches,
 * then deduplicates by commitId. Also fetches completed PRs in the date range.
 * Auth: PAT via env var, sent as Basic auth header (server-side Node.js only).
 */

import { journalConfig } from '../journal.config.js';
import type { GitData, GitDaily, GitRepoActivity } from '../journal.types.js';

/** Commit info embedded in a Push response. */
interface PushCommit {
  commitId: string;
  author: { name: string; email: string; date: string };
  comment: string;
  changeCounts?: { Add?: number; Edit?: number; Delete?: number };
}

/** Push summary returned by the list endpoint (no commits included). */
interface AdoPushSummary {
  pushId: number;
  date: string;
  pushedBy: { uniqueName?: string; displayName?: string };
}

/** Full push detail returned by the individual push endpoint. */
interface AdoPushDetail {
  pushId: number;
  commits: PushCommit[];
}

interface AdoPRRef {
  pullRequestId: number;
  status: string;
  createdBy?: { uniqueName: string };
  closedDate?: string;
}

export class GitSource {
  private readonly org = journalConfig.azureDevOps.org;
  private readonly pat = journalConfig.azureDevOps.pat;
  private readonly repos = journalConfig.azureDevOps.repos;
  private readonly author = journalConfig.author;

  private headers(): Record<string, string> {
    const token = Buffer.from(`:${this.pat}`).toString('base64');
    return {
      Authorization: `Basic ${token}`,
      'Content-Type': 'application/json',
    };
  }

  private baseUrl(project: string): string {
    return `https://dev.azure.com/${this.org}/${project}/_apis`;
  }

  async fetch(weekStart: string, weekEnd: string): Promise<GitData> {
    const fromDate = `${weekStart}T00:00:00Z`;
    const toDate = `${weekEnd}T23:59:59Z`;

    // Use Pushes API to get commits across ALL branches (1 call per repo).
    const commitResults = await Promise.all(
      this.repos.map((r) => this.fetchCommitsViaPushes(r.project, r.repo, fromDate, toDate)),
    );

    // Fetch PRs completed in this period
    const prResults = await Promise.all(
      this.repos.map((r) => this.fetchCompletedPRs(r.project, r.repo, fromDate, toDate)),
    );

    // Aggregate daily commits
    const dailyMap = new Map<string, GitDaily>();
    const repoActivity: GitRepoActivity[] = [];

    for (let i = 0; i < this.repos.length; i++) {
      const { project, repo } = this.repos[i];
      const commits = commitResults[i];
      repoActivity.push({ project, repo, commits: commits.length });

      for (const c of commits) {
        const date = c.author.date.slice(0, 10);
        const entry = dailyMap.get(date) ?? { date, commits: 0, filesChanged: 0 };
        entry.commits += 1;
        entry.filesChanged += (c.changeCounts?.Add ?? 0) + (c.changeCounts?.Edit ?? 0) + (c.changeCounts?.Delete ?? 0);
        dailyMap.set(date, entry);
      }
    }

    const daily = [...dailyMap.values()].sort((a, b) => a.date.localeCompare(b.date));
    const totalCommits = daily.reduce((sum, d) => sum + d.commits, 0);
    const totalPRsMerged = prResults.reduce((sum, prs) => sum + prs.length, 0);

    return {
      totalCommits,
      totalPRsMerged,
      totalPRsReviewed: 0,
      daily,
      repos: repoActivity.filter((r) => r.commits > 0),
    };
  }

  /**
   * Fetch commits across ALL branches using the Pushes API.
   *
   * Two-step process: the pushes list endpoint only returns push metadata
   * (pushedBy, date), not the commits themselves.
   *
   * Step 1: List pushes in date range, filter to the user's pushes.
   * Step 2: Fetch each matching push individually to get its commits.
   * Step 3: Deduplicate commits by commitId (same commit can appear
   *         in multiple pushes, e.g. after a merge).
   */
  private async fetchCommitsViaPushes(
    project: string, repo: string, fromDate: string, toDate: string,
  ): Promise<PushCommit[]> {
    const listUrl =
      `${this.baseUrl(project)}/git/repositories/${repo}/pushes` +
      `?searchCriteria.fromDate=${fromDate}` +
      `&searchCriteria.toDate=${toDate}` +
      `&api-version=7.1`;

    console.log(`[git] ${project}/${repo} listing pushes ${fromDate}..${toDate}`);
    try {
      const listRes = await fetch(listUrl, { headers: this.headers() });
      if (!listRes.ok) {
        console.warn(`[git] ${project}/${repo} HTTP ${listRes.status}: ${await listRes.text()}`);
        return [];
      }
      const listBody = await listRes.json();
      const allPushes = (listBody.value ?? []) as AdoPushSummary[];

      // Filter to pushes made by the configured author.
      const authorLower = this.author.toLowerCase();
      const myPushes = allPushes.filter((p) => {
        const pusher = (p.pushedBy?.uniqueName ?? '').toLowerCase();
        const pusherName = (p.pushedBy?.displayName ?? '').toLowerCase();
        return pusher.includes(authorLower) || pusherName.includes(authorLower);
      });
      console.log(
        `[git] ${project}/${repo} → ${allPushes.length} total pushes, ${myPushes.length} by ${this.author}`,
      );

      if (myPushes.length === 0) return [];

      // Step 2: Fetch each push individually to get its commits
      const detailResults = await Promise.all(
        myPushes.map((p) => this.fetchPushDetail(project, repo, p.pushId)),
      );

      // Step 3: Collect and deduplicate commits by commitId
      const seen = new Set<string>();
      const commits: PushCommit[] = [];
      for (const detail of detailResults) {
        if (!detail?.commits) continue;
        for (const c of detail.commits) {
          if (seen.has(c.commitId)) continue;
          seen.add(c.commitId);
          commits.push(c);
        }
      }

      console.log(`[git] ${project}/${repo} → ${commits.length} unique commits`);
      return commits;
    } catch (e) {
      console.error(`[git] ${project}/${repo} fetch error: ${e}`);
      return [];
    }
  }

  /** Fetch a single push by ID to get its commits array. */
  private async fetchPushDetail(
    project: string, repo: string, pushId: number,
  ): Promise<AdoPushDetail | null> {
    const url =
      `${this.baseUrl(project)}/git/repositories/${repo}/pushes/${pushId}` +
      `?api-version=7.1`;
    try {
      const res = await fetch(url, { headers: this.headers() });
      if (!res.ok) return null;
      return (await res.json()) as AdoPushDetail;
    } catch {
      return null;
    }
  }

  /** Fetch PRs completed (merged) within the date range. */
  private async fetchCompletedPRs(project: string, repo: string, fromDate: string, toDate: string): Promise<AdoPRRef[]> {
    const url =
      `${this.baseUrl(project)}/git/repositories/${repo}/pullrequests` +
      `?searchCriteria.status=completed` +
      `&searchCriteria.creatorId=${encodeURIComponent(this.author)}` +
      `&api-version=7.1`;

    console.log(`[git] ${project}/${repo} PRs ${fromDate}..${toDate}`);
    try {
      const res = await fetch(url, { headers: this.headers() });
      if (!res.ok) {
        console.warn(`[git] ${project}/${repo} PRs HTTP ${res.status}: ${await res.text()}`);
        return [];
      }
      const body = await res.json();
      const prs = (body.value ?? []) as AdoPRRef[];
      // Filter to PRs closed within our date range
      const filtered = prs.filter((pr) => {
        if (!pr.closedDate) return false;
        return pr.closedDate >= fromDate && pr.closedDate <= toDate;
      });
      console.log(`[git] ${project}/${repo} → ${prs.length} total PRs, ${filtered.length} in range`);
      return filtered;
    } catch (e) {
      console.error(`[git] ${project}/${repo} PR fetch error: ${e}`);
      return [];
    }
  }
}
