/**
 * Journal configuration — reads from commandGarden preferences (SQLite).
 * Users configure their settings through the GUI Config page.
 *
 * Preference keys:
 *   journal.author     — email/name as it appears in git commits and ADO
 *   journal.ado_org    — Azure DevOps organization (e.g. "daimler-mic")
 *   journal.ado_repos  — comma-separated "project/repo" pairs
 *   journal.target_hours — weekly target hours (default 40)
 */

import type { AppStore } from '../store.js';

/** Parse comma-separated "project/repo" pairs.
 *  Example: "mic-dns/mic-dns-api,mic-dns/mic-dns-ui" */
function parseRepos(raw: string): { project: string; repo: string }[] {
  if (!raw) return [];
  return raw.split(',').map((entry) => {
    const [project, repo] = entry.trim().split('/');
    return { project, repo };
  });
}

/** Build journal config from the user's stored preferences. */
export function getJournalConfig(store: AppStore) {
  return {
    author: store.getPreference('journal.author') ?? '',

    azureDevOps: {
      org: store.getPreference('journal.ado_org') ?? '',
      repos: parseRepos(store.getPreference('journal.ado_repos') ?? ''),
    },

    targetHours: Number(store.getPreference('journal.target_hours')) || 40,
  };
}

/** Type of the config object returned by getJournalConfig. */
export type JournalConfig = ReturnType<typeof getJournalConfig>;
