/**
 * Journal configuration.
 *
 * All values are loaded from environment variables (see .env).
 */

/** Parse ADO_REPOS env var: comma-separated "project/repo" pairs.
 *  Example: "mic-dns/mic-dns-api,mic-dns/mic-dns-ui" */
function parseRepos(raw: string): { project: string; repo: string }[] {
  if (!raw) return [];
  return raw.split(',').map((entry) => {
    const [project, repo] = entry.trim().split('/');
    return { project, repo };
  });
}

export const journalConfig = {
  /** Your email/name as it appears in git commits and ADO. */
  author: process.env.JOURNAL_AUTHOR ?? '',

  /** Azure DevOps configuration. */
  azureDevOps: {
    org: process.env.ADO_ORG ?? '',
    /** Personal Access Token (read-only scope: Code > Read). */
    pat: process.env.ADO_PAT ?? '',
    /** Repos to scan for commits (from ADO_REPOS env var). */
    repos: parseRepos(process.env.ADO_REPOS ?? ''),
  },

  /** Weekly target hours (default 40 for Mon-Fri, 8h/day). */
  targetHours: 40,
};
