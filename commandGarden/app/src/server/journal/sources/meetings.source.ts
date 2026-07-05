/**
 * Meetings data source — DISABLED for v1.
 *
 * The Outlook connector is blocked by the corporate MCAS proxy
 * (outlook.cloud.microsoft.mcas.ms) which prevents all standard auth patterns:
 * - OWA REST API: X-OWA-CANARY cookie is HttpOnly (JS can't read it)
 * - Graph API: no Graph-scoped MSAL token available in MCAS session storage
 * - Response interception: eval script installs after OWA's initial data fetch
 *
 * Returns null immediately — the journal renders without meeting data
 * (graceful degradation). Git + Jira provide a strong 2-source story.
 *
 * TODO: Revisit post-demo with MCAS-specific auth investigation.
 */

import type { DaemonClient } from '@commandgarden/shared';
import type { MeetingsData } from '../journal.types.js';

export class MeetingsSource {
  constructor(private readonly _daemon: DaemonClient) {}

  async fetch(_weekStart: string, _weekEnd: string): Promise<MeetingsData | null> {
    // Disabled for v1 — MCAS proxy blocks all standard auth patterns.
    // Returns null so the journal renders without meeting data.
    return null;
  }
}
