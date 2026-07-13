/**
 * Journal Fastify route — POST /api/journal/generate.
 * Reads journal config from user preferences (SQLite), instantiates
 * sources with that config, and generates the weekly report.
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

export function journalRoutes(app: FastifyInstance, daemon: DaemonClient, store: AppStore): void {
  app.post('/api/journal/generate', async (req, reply) => {
    const body = req.body as {
      weekStart?: string;
      sources?: { timetracking?: boolean; meetings?: boolean; jira?: boolean; git?: boolean };
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

      // Audit log (non-blocking — failure should not break the response)
      const durationMs = Date.now() - start;
      daemon.post('/api/audit/log', {
        command: 'journal generate',
        args: { weekStart: body.weekStart, sources },
        status: result.status,
        durationMs,
      }).catch(() => { /* audit failure is non-critical */ });

      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error('[journal] generate error:', message);
      return reply.code(500).send({ ok: false, error: message });
    }
  });
}
