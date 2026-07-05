/**
 * Journal Fastify route — POST /api/journal/generate.
 * Instantiates all sources and the journal service per request,
 * following the same pattern as other commandGarden app routes.
 */

import type { FastifyInstance } from 'fastify';
import type { DaemonClient } from '@commandgarden/shared';
import { GitSource } from '../journal/sources/git.source.js';
import { JiraSource } from '../journal/sources/jira.source.js';
import { TimetrackingSource } from '../journal/sources/timetracking.source.js';
import { MeetingsSource } from '../journal/sources/meetings.source.js';
import { JournalService } from '../journal/journal.service.js';

export function journalRoutes(app: FastifyInstance, daemon: DaemonClient): void {
  app.post('/api/journal/generate', async (req, reply) => {
    const body = req.body as { weekStart?: string } | null;

    // Validate weekStart is present and matches YYYY-MM-DD format
    if (!body?.weekStart || !/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(body.weekStart)) {
      return reply.code(400).send({
        ok: false,
        error: 'weekStart is required and must be YYYY-MM-DD format',
      });
    }

    try {
      const start = Date.now();
      // All 4 sources now use the daemon to run commandGarden connectors
      // (Phase 3: no more direct REST API calls or PAT auth)
      const git = new GitSource(daemon);
      const jira = new JiraSource(daemon);
      const timetracking = new TimetrackingSource(daemon);
      const meetings = new MeetingsSource(daemon);

      const service = new JournalService(git, timetracking, meetings, jira);
      const result = await service.generate({ weekStart: body.weekStart });

      // Audit log (non-blocking — failure should not break the response)
      const durationMs = Date.now() - start;
      daemon.post('/api/audit/log', {
        command: 'journal generate',
        args: { weekStart: body.weekStart },
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
