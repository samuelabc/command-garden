# Requirements: Dev Work Journal

**Defined:** 2026-07-05
**Core Value:** Eliminate manual work reporting by aggregating data from closed-garden enterprise tools through commandGarden's secure browser automation.

## v1 Requirements

Requirements for July 14 first-round demo. Each maps to roadmap phases.

### Migration

- [ ] **MIG-01**: Journal backend runs as Fastify route inside `commandGarden/app/` server
- [ ] **MIG-02**: Journal frontend renders as a React page in the commandGarden GUI SPA
- [ ] **MIG-03**: Journal uses commandGarden daemon API to run connectors (not `opencli` CLI)
- [ ] **MIG-04**: All journal types, config, and cross-reference logic ported from `dashboard/`

### Adapters (commandGarden Connectors)

- [ ] **ADPT-01**: ADO Git connector extracts commits and PRs from Azure DevOps web UI (all branches)
- [ ] **ADPT-02**: Outlook Calendar connector extracts user's own meeting schedule (subject, time, duration)
- [ ] **ADPT-03**: Jira connector extracts tickets assigned to the user (resolved, in-progress, blockers)
- [ ] **ADPT-04**: Each adapter works via browser automation — no PAT/API tokens required
- [ ] **ADPT-05**: Each adapter has a YAML connector definition with declared domains and capabilities

### Journal Backend

- [ ] **BACK-01**: `POST /api/journal/generate` accepts `{ weekStart }` and returns aggregated data
- [ ] **BACK-02**: Backend orchestrates all 3 connectors in parallel via daemon API
- [ ] **BACK-03**: Cross-reference engine identifies forgotten days, heavy meeting days, zero-coding days
- [ ] **BACK-04**: Graceful degradation — if one connector fails, others still return (status: "partial")
- [ ] **BACK-05**: Audit log records each journal generation

### Journal Frontend

- [ ] **FRONT-01**: Week picker (Sun–Sat) with previous/next navigation
- [ ] **FRONT-02**: Generate button triggers backend call with loading spinner
- [ ] **FRONT-03**: Summary cards: meetings count, tickets done, commits count
- [ ] **FRONT-04**: Daily breakdown table: per-day row with meetings, commits, tickets
- [ ] **FRONT-05**: Insights panel: LLM-generated insights + error warnings
- [ ] **FRONT-06**: Partial-data warning when some sources fail

### AI / LLM

- [ ] **AI-01**: LLM generates contextual weekly insights from cross-referenced data
- [ ] **AI-02**: LLM does not receive raw sensitive data — only aggregated counts and summaries
- [ ] **AI-03**: Insights are actionable (e.g., "block focus time", "fill forgotten timesheet days")

### Demo Readiness

- [ ] **DEMO-01**: End-to-end flow works with real data from an actual work week
- [ ] **DEMO-02**: Demo completes within 60 seconds (Generate → results visible)
- [ ] **DEMO-03**: Browser sessions pre-warmed before demo (no auth popups)

## v2 Requirements

Deferred to finals (July 29) or post-competition.

### Enhanced Visualizations

- **VIZ-01**: Charts for daily activity (bar chart: hours, commits, meetings)
- **VIZ-02**: Progress bars for weekly targets
- **VIZ-03**: Color-coded calendar heatmap

### Historical Trends

- **HIST-01**: Compare current week vs previous weeks
- **HIST-02**: Monthly summary view
- **HIST-03**: Trend lines for key metrics

### Additional Sources

- **SRC-01**: TimeTracking via commandGarden adapter (previously dropped)
- **SRC-02**: Confluence/wiki activity
- **SRC-03**: Mattermost/chat activity

## Out of Scope

| Feature | Reason |
|---------|--------|
| Team-level tracking | Personal journal only — avoids surveillance perception |
| Manager dashboard | Not the product's purpose; judges are senior leadership |
| Smart Timesheet Filler | Can't accurately map meetings to projects |
| Lines of code metric | Misleading; show commits/PRs instead |
| Chatbot interface | Judges penalize chatbots; single-page dashboard |
| Multi-user deployment | Local-only for hackathon |
| TimeTracking source | Dropped to focus on 3-source story |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| MIG-01 | Phase 1 | Done ✓ |
| MIG-02 | Phase 1 | Done ✓ |
| MIG-03 | Phase 1 | Done ✓ |
| MIG-04 | Phase 1 | Done ✓ |
| ADPT-01 | Phase 2 | In Progress (ADO connector needs CDP fix) |
| ADPT-02 | Phase 2 | Deferred to v2 (MCAS proxy) |
| ADPT-03 | Phase 2 | Done ✓ (Jira Cloud) |
| ADPT-04 | Phase 2 | Partial (Jira ✓, ADO blocked, Outlook deferred) |
| ADPT-05 | Phase 2 | Done ✓ (all connectors have YAML + eval) |
| BACK-01 | Phase 3 | Done ✓ |
| BACK-02 | Phase 3 | Partial (Jira via daemon ✓, Git pending, Meetings disabled) |
| BACK-03 | Phase 3 | Done ✓ |
| BACK-04 | Phase 3 | Done ✓ |
| BACK-05 | Phase 3 | Done ✓ |
| FRONT-01 | Phase 3 | Done ✓ |
| FRONT-02 | Phase 3 | Done ✓ |
| FRONT-03 | Phase 3 | Done ✓ |
| FRONT-04 | Phase 3 | Done ✓ |
| FRONT-05 | Phase 3 | Done ✓ |
| FRONT-06 | Phase 3 | Done ✓ |
| AI-01 | Phase 4 | Planned |
| AI-02 | Phase 4 | Planned |
| AI-03 | Phase 4 | Planned |
| DEMO-01 | Phase 5 | Pending |
| DEMO-02 | Phase 5 | Pending |
| DEMO-03 | Phase 5 | Pending |

**Coverage:**
- v1 requirements: 26 total
- Done: 18
- In Progress / Partial: 3
- Deferred: 1 (ADPT-02 Outlook)
- Planned: 3 (AI)
- Pending: 3 (Demo)

---
*Requirements defined: 2026-07-05*
*Last updated: 2026-07-10 after Phase 3 execution + connector debugging*
