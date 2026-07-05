# Dev Work Journal

## What This Is

A single-page feature inside the commandGarden GUI that auto-generates a developer's weekly work summary by aggregating data from Outlook Calendar, Azure DevOps Git, and Atlassian Jira — all via commandGarden browser automation (no API tokens required). One "Generate" button produces a cross-referenced report with LLM-powered insights.

## Core Value

Eliminate manual work reporting by aggregating data from closed-garden enterprise tools through commandGarden's secure browser automation — proving the platform's value as an "API for tools that have no API."

## Requirements

### Validated

- ✓ commandGarden platform (daemon, CLI, Chrome extension, GUI) — existing
- ✓ commandGarden connector system (YAML declarative pipelines) — existing
- ✓ Teams/Outlook room-availability adapter (`teams/room-availability`) — existing
- ✓ TimeTracking adapter (`timetracking/report`, `timetracking/projects`) — existing
- ✓ Audit trail for all commandGarden operations — existing
- ✓ Git source fetches commits via ADO Pushes API (REST, all branches) — working prototype in dashboard/

### Active

- [ ] **Migration:** Move journal module from `dashboard/` to `commandGarden/app/` (Fastify + React)
- [ ] **ADO Git adapter:** New commandGarden connector to extract commits/PRs from ADO web UI (replaces REST API + PAT)
- [ ] **Outlook Calendar adapter:** New/extended commandGarden connector to extract user's own meeting schedule
- [ ] **Jira adapter:** New commandGarden connector to extract tickets (assigned, resolved, in-progress) from Jira web UI
- [ ] **Journal backend:** Fastify route that orchestrates all 3 connectors, cross-references data, generates insights
- [ ] **Journal frontend:** React page with week picker, Generate button, summary cards, daily breakdown, insights panel
- [ ] **Cross-reference engine:** Identify forgotten days, heavy meeting days, zero-coding days, meeting-to-work ratio
- [ ] **LLM-powered insights:** Replace rule-based `generateBasicInsights()` with actual LLM call for richer analysis
- [ ] **Graceful degradation:** If one source fails, still show others (status: "partial")
- [ ] **Polished demo flow:** End-to-end live demo with real data from an actual work week

### Out of Scope

- **Team-level tracking** — this is a personal journal, not a manager dashboard. Avoids surveillance perception.
- **Smart Timesheet Filler** — impossible to accurately map meetings to projects automatically
- **TimeTracking as a data source** — dropped to focus on the 3 sources that tell a stronger story
- **Lines of code metric** — not a headline stat; show commits/PRs instead
- **Chatbot interface** — judges penalize standard chatbot implementations; this is a single-page dashboard
- **Multi-user / deployment** — local-only for the hackathon demo

## Context

### Competition

- **Event:** Vibathon 2026 by Mercedes-Benz Tech Malaysia (MBTMY)
- **Track:** Track A — AI-first workflow fixer (remove one annoying manual process, prove 30 min/day savings)
- **Timeline:** First round presentation July 14 (elimination), Finals July 29, Ceremony July 31
- **Pitching:** 4 min presentation + 4 min Q&A
- **Judging:** Innovation (20%), AI Utilization (20%), Impact (20%), UX (15%), Technical (15%), Presentation (10%)

### Team

- **Mun Hong Lee** — building the Dev Work Journal feature + new commandGarden adapters
- **Samuel** — built the commandGarden platform, CLI, Chrome extension, GUI, existing adapters

### Technical Environment

- commandGarden platform with 432+ passing tests across 5 workspace packages
- Existing adapters: TimeTracking (page-context fetch), Teams room availability (UI drive + intercept)
- User identity mismatch: ADO pusher = `mun_hong.lee@mercedes-benz.com`, git author = `munhlee@apac.corpdir.net`
- Jira Cloud instance available with API access
- ADO org: `daimler-mic`, repos in `mic-dns` project

### Demo Narrative

1. **Problem:** Enterprise tools have no APIs. Developers waste 15+ min/day on manual reporting.
2. **Platform:** commandGarden gives APIs to closed-garden tools. Secure, auditable, no credentials.
3. **Live Demo:** Press "Generate" → data flows from 3 systems → cross-referenced insights appear.
4. **Scale:** Works for ANY internal tool. Add a YAML connector, and it's unlocked.

## Constraints

- **Timeline:** 9 days to July 14 first-round presentation. Everything must be demo-ready.
- **Platform:** Must use `commandGarden/app/` (Fastify + React/Vite). Not the old `dashboard/` (NestJS + Next.js).
- **Auth model:** commandGarden browser automation only. No API tokens stored for data sources.
- **LLM:** Choice not yet decided. Must not send sensitive raw data to external LLM — only aggregated counts/summaries.
- **Solo build:** Mun Hong builds the journal + adapters. Samuel maintains the platform.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| "Dev Work Journal" not "productivity tracker" | Avoids surveillance perception with senior leadership judges | — Pending |
| All data sources via commandGarden (no PATs) | Strongest demo narrative — proves platform value for ALL enterprise tools | — Pending |
| Drop TimeTracking as data source | Focus on 3 sources (Git, Outlook, Jira) that tell a stronger cross-system story | — Pending |
| Migrate to commandGarden/app before building | Samuel confirmed dashboard/ is deprecated; all work in commandGarden/ | — Pending |
| NOT a chatbot | Judges penalize standard chatbot implementations; single-page dashboard with Generate button | — Pending |
| Full scope for July 14 | High risk but strongest demo — all 3 adapters + LLM insights | — Pending |
| Graceful degradation | If one source fails, still show others (status: "partial") | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-07-05 after initialization*
