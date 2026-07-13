/**
 * Journal Fastify route — POST /api/journal/generate.
 * Reads journal config from user preferences (SQLite), instantiates
 * sources with that config, and generates the weekly report.
 *
 * Results are cached in app.db (journal_cache table), keyed by weekStart +
 * the enabled-sources signature. A cache hit skips every browser-driven
 * connector call entirely; the response carries `cache: { hit, fetchedAt }`
 * so the UI can always show the user whether they're looking at a cached
 * result and from when. Pass `forceRefresh: true` to bypass the cache and
 * drive a fresh fetch (e.g. via a "Refresh" action in the UI).
 */

import type { FastifyInstance } from 'fastify';
import type { DaemonClient } from '@commandgarden/shared';
import type { AppStore } from '../store.js';
import { getJournalConfig } from '../journal/journal.config.js';
import { GitSource } from '../journal/sources/git.source.js';
import { JiraSource } from '../journal/sources/jira.source.js';
import { TimetrackingSource } from '../journal/sources/timetracking.source.js';
import { MeetingsSource } from '../journal/sources/meetings.source.js';
import { JournalService } from '../journal/journal.service.js';
import type { JournalResponse } from '../journal/journal.types.js';

/** Build a stable cache key from weekStart + which sources were requested. */
function buildCacheKey(
  weekStart: string,
  sources: { timetracking: boolean; meetings: boolean; jira: boolean; git: boolean },
): string {
  const sig = ['timetracking', 'meetings', 'jira', 'git']
    .map((k) => `${k}=${sources[k as keyof typeof sources] ? 1 : 0}`)
    .join(',');
  return `${weekStart}|${sig}`;
}

export function journalRoutes(app: FastifyInstance, daemon: DaemonClient, store: AppStore): void {
  app.post('/api/journal/generate', async (req, reply) => {
    const body = req.body as {
      weekStart?: string;
      sources?: { timetracking?: boolean; meetings?: boolean; jira?: boolean; git?: boolean };
      forceRefresh?: boolean;
    } | null;

    // Validate weekStart is present and matches YYYY-MM-DD format
    if (!body?.weekStart || !/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(body.weekStart)) {
      return reply.code(400).send({
        ok: false,
        error: 'weekStart is required and must be YYYY-MM-DD format',
      });
    }

    const sources = {
      timetracking: body.sources?.timetracking ?? true,
      meetings: body.sources?.meetings ?? true,
      jira: body.sources?.jira ?? true,
      git: body.sources?.git ?? true,
    };

    const cacheKey = buildCacheKey(body.weekStart, sources);

    if (!body.forceRefresh) {
      const cached = store.getCachedJournal(cacheKey);
      if (cached) {
        return {
          ...(cached.data as unknown as JournalResponse),
          cache: { hit: true, fetchedAt: cached.fetchedAt },
        };
      }
    }

    // Build config from user preferences (configured via GUI Config page)
    const config = getJournalConfig(store);

    // Check that required settings are configured, only if git (ADO) is enabled
    if (sources.git && (!config.azureDevOps.org || config.azureDevOps.repos.length === 0)) {
      return reply.code(400).send({
        ok: false,
        error: 'Journal not configured. Go to Configuration → Journal Settings and set your ADO org and repos.',
      });
    }

    try {
      const start = Date.now();
      // Sources receive config from preferences — no env vars needed
      const git = new GitSource(daemon, config);
      const jira = new JiraSource(daemon);
      const timetracking = new TimetrackingSource(daemon, config);
      const meetings = new MeetingsSource(daemon);

      const service = new JournalService(git, timetracking, meetings, jira);
      const result = await service.generate({ weekStart: body.weekStart, sources });

      const fetchedAt = store.cacheJournal(cacheKey, body.weekStart, result as unknown as Record<string, unknown>);

      // Audit log (non-blocking — failure should not break the response)
      const durationMs = Date.now() - start;
      daemon.post('/api/audit/log', {
        command: 'journal generate',
        args: { weekStart: body.weekStart, sources },
        status: result.status,
        durationMs,
      }).catch(() => { /* audit failure is non-critical */ });

      return { ...result, cache: { hit: false, fetchedAt } };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error('[journal] generate error:', message);
      return reply.code(500).send({ ok: false, error: message });
    }
  });
}
