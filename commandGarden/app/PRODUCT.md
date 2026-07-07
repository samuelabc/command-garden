# Product

## Register

product

## Users

Internal enterprise users ranging from developers to non-technical staff (managers, team leads). Developers use the CLI and GUI interchangeably; non-developers primarily use the web GUI to access timetracking reports, room availability, and other browser-automated data. Users are at their desk on a standard monitor, often multitasking between tools.

## Product Purpose

commandGarden turns websites into secure, auditable CLI commands using declarative YAML connectors. It reuses existing Chrome sessions — no credentials stored or transmitted. The web GUI provides a browser-based interface for running connectors, reviewing audit logs, managing configuration, and accessing dedicated app pages (timetracking, room availability, security news). Success looks like: a user runs a connector in under 10 seconds and trusts the result.

## Brand Personality

Clean, precise, trustworthy. The interface should feel like a well-built internal tool — sharp and intentional, never decorative. Approachable enough that someone who has never used a terminal can navigate the GUI confidently, but not dumbed down. The brutalist visual identity (sharp corners, monospaced data, uppercase section markers) is a deliberate design choice, not a lack of polish.

## Anti-references

- Generic SaaS dashboards — no bland card grids, no "Welcome back!" heroes, no pastel gradients. Not a Notion/Linear/Vercel clone.
- Overcomplicated enterprise panels — not a dense admin UI with 50 visible settings. Not Jira or ServiceNow.
- Hacker terminal aesthetic — not a dark-mode-only terminal emulator. Not a "cool developer tool" that alienates non-technical users.

## Design Principles

- **Clarity over cleverness.** Every label, status, and action should be understandable without reading documentation. If a user has to guess what "daemon" means, the label is wrong.
- **Show the path forward.** Don't just report status — tell the user what to do next. A failing check is only useful if the fix is visible.
- **Density when earned.** Dense information (tables, audit logs) is fine when the user is actively working. Setup flows, empty states, and first-run screens should breathe.
- **One vocabulary.** Same component shapes, same interaction patterns, same terminology across every screen. Consistency is trust.
- **Quiet confidence.** The tool should disappear into the task. No gratuitous motion, no decorative elements, no UI that calls attention to itself instead of the data.

## Accessibility & Inclusion

Best-effort accessibility: good color contrast (aim for 4.5:1 on body text), keyboard navigability for all interactive elements, meaningful labels on controls, and reduced-motion support via the existing `prefers-reduced-motion` media query. No formal WCAG level targeted, but avoid known anti-patterns (low-contrast text, focus traps, missing aria labels on icon-only buttons).
