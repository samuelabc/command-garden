# commandGarden

[![npm version](https://img.shields.io/npm/v/@commandgarden/cli.svg)](https://www.npmjs.com/package/@commandgarden/cli)

**Turn websites into secure, auditable CLI commands.**

commandGarden turns websites into CLI commands using declarative YAML connectors. It runs inside your existing Chrome session, so no credentials are stored or transmitted. Each command is checked against the connector's declared domains and capabilities, and every run is recorded in a local audit trail.

- npm: https://www.npmjs.com/package/@commandgarden/cli
- Chrome extension: https://chromewebstore.google.com/detail/commandgarden/inhdofdeebhcgekghljnppdeoifeifbk
- Desktop installers (macOS and Windows): https://github.com/samuelabc/command-garden/releases

---

## Why commandGarden?

- No credentials are stored. commandGarden runs inside your authenticated browser session, so there is nothing extra to leak.
- You describe a site once in YAML and get a typed CLI command with `table`, `json`, or `csv` output.
- Each connector declares its domains and capabilities. High-risk actions such as running JS or attaching the debugger stay blocked until you approve them.
- Every run is written to a local SQLite audit log: what ran, when, and how many rows came back, but never the data itself.
- You can drive everything from the `cg` command line or from the built-in web dashboard.

---

## Install

### 1. Install the CLI (npm)

```bash
npm install -g @commandgarden/cli
```

Requires Node.js 20 or newer. This installs both `commandgarden` and the shorthand `cg` globally.

### 2. Install the Chrome extension

The extension connects to the local daemon and runs connector actions inside your existing browser session.

**Option A: Chrome Web Store (recommended)**

https://chromewebstore.google.com/detail/commandgarden/inhdofdeebhcgekghljnppdeoifeifbk

**Option B: load the bundled extension**

```bash
cg extension setup
```

This prints the path to the extension bundled with your install, along with the steps to load it: open `chrome://extensions` (or `edge://extensions`), enable Developer mode, click Load unpacked, and select the printed path.

### Desktop app (macOS and Windows)

Native installers are published on GitHub Releases: a macOS `.dmg` and a Windows `.exe`. They bundle everything you need, so you do not have to install Node.js separately.

https://github.com/samuelabc/command-garden/releases

---

## Quick start

```bash
# Start the daemon + web GUI (opens http://127.0.0.1:9092)
cg up

# See the available connectors
cg list

# Run one
cg run simonwillison/blog --tag ai --format table
```

To stop everything: `cg down`.

> Some connectors use high-risk capabilities, such as running JavaScript in the page, and must be approved before first use. Approve one with `cg config approve <site>/<name> js_evaluate`, or toggle it on in the GUI.

---

## Connectors

Connectors are small YAML files that describe how to pull structured data from a site. commandGarden ships with a set of built-in connectors, and you can add your own in `~/.commandgarden/connectors/`.

A minimal connector:

```yaml
site: mysite
name: my-command
version: "1.0"
description: "Short description of what this connector does"
access: read
domains:
  - "mysite.example.com"
capabilities:
  - navigate
  - dom_read
pipeline:
  - step: navigate
    url: "https://mysite.example.com/search?q=${{ args.query }}"
  - step: extract
    selector: ".results .item"
    fields:
      title: "h3"
      url: "a@href"
```

To write your own, see the [Connector Authoring Guide](docs/connector-authoring.md) and the [Pipeline Step Reference](docs/pipeline-reference.md).

---

## Web GUI

Running `cg up` (or `cg gui`) opens a browser dashboard at `http://127.0.0.1:9092` for people who prefer a UI over the terminal. It includes:

- a Dashboard with system health and recent activity
- a Connectors page to browse, approve high-risk connectors, and run any of them through an auto-generated form
- App pages with dedicated views for Time Tracking, Room Availability, Security News, AI News, and Roles
- an Audit Log viewer that filters and paginates events down to the per-step detail
- a Configuration page with a per-connector approval table and a raw YAML editor

---

## Documentation

- [Developer and Technical Guide](DEVELOPMENT.md): architecture, setup, every built-in connector, the audit log, configuration, approvals, tests, and the development workflow
- [Connector Authoring Guide](docs/connector-authoring.md): patterns, best practices, and debugging
- [Pipeline Step Reference](docs/pipeline-reference.md): every pipeline step and its parameters
- [Publishing Guide](docs/PUBLISHING.md): releasing `@commandgarden/cli`
- [Chrome Web Store Guide](docs/chrome-web-store.md): publishing the extension
