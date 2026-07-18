/**
 * Journal Fastify route — POST /api/journal/generate.
 * Reads journal config from user preferences (SQLite), instantiates
 * sources with that config, and generates the weekly report.
 *
 * Results are cached in app.db (journal_cache table), keyed by weekStart
 * only — the latest generated result for a week is cached regardless of
 * which sources were selected. A cache hit skips every browser-driven
 * connector call entirely; the response carries `cache: { hit, fetchedAt }`
 * so the UI can always show the user whether they're looking at a cached
 * result and from when. Pass `forceRefresh: true` to bypass the cache and
 * drive a fresh fetch (e.g. via a "Refresh" action in the UI).
 *
 * The user's last-selected source toggles (Timetracking/Meetings/Jira/Git/
 * Saba) are stored separately in journal_source_prefs, so the UI can
 * restore the user's picks on next load.
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

export function journalRoutes(app: FastifyInstance, daemon: DaemonClient, store: AppStore): void {
  // Read-only cache lookup — no connector calls, no config validation. Used by the
  // UI to silently restore a previously generated result (e.g. after navigating
  // away and back, which remounts the page and loses its local React state).
  app.get('/api/journal/cache', async (req, reply) => {
    const query = req.query as { weekStart?: string };

    if (!query.weekStart || !/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(query.weekStart)) {
      return reply.code(400).send({
        ok: false,
        error: 'weekStart is required and must be YYYY-MM-DD format',
      });
    }

    const cached = store.getCachedJournal(query.weekStart);
    if (!cached) return { ok: true, data: null, saba: null };
    return {
      ok: true,
      data: { ...(cached.data as unknown as JournalResponse), cache: { hit: true, fetchedAt: cached.fetchedAt } },
      saba: cached.sabaData,
    };
  });

  // Persists the Saba "pending training" result for a week — saved separately
  // from the main journal generate() flow since it's fetched client-side and
  // can complete at a different time.
  app.post('/api/journal/cache/saba', async (req, reply) => {
    const body = req.body as { weekStart?: string; saba?: Record<string, unknown> | null } | null;

    if (!body?.weekStart || !/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(body.weekStart)) {
      return reply.code(400).send({
        ok: false,
        error: 'weekStart is required and must be YYYY-MM-DD format',
      });
    }

    store.cacheJournalSaba(body.weekStart, body.saba ?? null);
    return { ok: true };
  });

  // Last-selected source toggles — persisted so the UI can restore the
  // user's picks on next load instead of always resetting to "all enabled".
  app.get('/api/journal/source-prefs', async () => {
    const prefs = store.getJournalSourcePrefs();
    return { ok: true, prefs };
  });

  app.post('/api/journal/source-prefs', async (req, reply) => {
    const body = req.body as {
      timetracking?: boolean;
      meetings?: boolean;
      jira?: boolean;
      git?: boolean;
      saba?: boolean;
    } | null;

    if (!body) {
      return reply.code(400).send({ ok: false, error: 'Request body is required' });
    }

    store.saveJournalSourcePrefs({
      timetracking: body.timetracking ?? true,
      meetings: body.meetings ?? true,
      jira: body.jira ?? true,
      git: body.git ?? true,
      saba: body.saba ?? true,
    });

    return { ok: true };
  });

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

    if (!body.forceRefresh) {
      const cached = store.getCachedJournal(body.weekStart);
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

      const fetchedAt = store.cacheJournal(body.weekStart, result as unknown as Record<string, unknown>);

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
