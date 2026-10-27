# Sleipnir

Sleipnir is a desktop workbench for research-driven UI design that ships with a
built-in AI coding agent. It's an Electron + React (Vite) application, organized
as a numbered pipeline — research feeds planning, planning feeds components,
components feed prototypes, prototypes get validated, results feed back into
research — with a live component-library editor, a multi-provider AI chat that
can plan and generate code for human review, a real terminal, and a Git panel,
all built from one shared component library.

The same app runs three ways with (almost) identical behavior:
- **Electron desktop app** — the primary target. Native file dialogs, a real
  terminal (`node-pty`), and an OS-encrypted API key store.
- **Browser, via `vite`** — everything except the Electron-only features above;
  useful for fast iteration without packaging.
- **Containerized, via Docker** — the same browser mode, running inside a
  container (see [Docker](#docker-optional) below for a current caveat).

## Features

- **Numbered pipeline (`00`–`06`)** — research, planning, components,
  prototypes, validation, and analytics as ordered stages, plus a
  source-control panel outside the sequence. See [ARCHITECTURE.md](ARCHITECTURE.md).
- **AI agent chat** — Anthropic Claude by default (bring your own API key, or
  fall back to a local Ollama model with no key at all). The agent can create
  planning nodes, read files in the open Workspace, generate code, and propose
  shell commands — but generated code always stages into an editor tab for you
  to review and save, and a proposed command only runs after you explicitly
  confirm it in a dialog. Nothing writes to disk or executes unattended.
- **Live component editor** — a CodeMirror-based code editor with real
  TypeScript language-server support (hover, diagnostics, go-to-definition) via
  a local LSP proxy, plus a live component preview pane.
- **Refactor engine** — preview and apply a full folder-layout migration for a
  component library (Atomic ↔ MVVM ↔ MVC ↔ MVP) without hand-editing imports.
- **Planning graph** — a force-directed graph of every component/prototype and
  its import relationships, generated from the actual source tree.
- **In-app Validation** — run the open Workspace's own Vitest suite and see
  structured pass/fail results without leaving the app.
- **Integrated terminal and Git panel** — any number of terminal tabs, and a
  status/diff (unified or side-by-side)/stage/commit/branch/stash/push/pull UI
  with a merge-conflict banner, without leaving the app.

## Install (desktop app)

Download the installer for your OS from the
[latest release](https://github.com/andrewsterns/Sleipnir/releases/latest):

- **Windows** — run the `.exe`. Sleipnir isn't code-signed yet, so SmartScreen
  may warn *"Windows protected your PC / unknown publisher"* — click
  **More info → Run anyway**.
- **macOS** — open the `.dmg` and drag Sleipnir to Applications. Because the
  build isn't notarized yet, Gatekeeper blocks the *first* launch. To open it:
  **right-click (or Control-click) the app → Open → Open**. macOS remembers the
  choice afterward.

> These one-time steps are expected for an unsigned indie build; code
> signing/notarization is planned. Once the app is running it updates itself
> automatically from GitHub Releases (on macOS, auto-update turns on once the
> build is signed).

### Free and Pro

Sleipnir is free for personal and noncommercial use (up to 3 projects).
**Sleipnir Pro** adds unlimited projects, multiple windows, MCP servers for
the agent, and a commercial-use license. A Founder license is a one-time
purchase from the [website](https://andrewsterns.github.io/Sleipnir/#pricing);
enter the key in **Settings ▸ License**. AI usage is never part of the price:
you bring your own provider key or a local Ollama model.

Everything below is for **running from source / development**.

## Quick start

### Prerequisites
- **Node.js 20+** (the Docker image pins `20.17`; 18+ likely works for local
  dev but isn't tested here)
- **Git**, available on `PATH` — required by the Source Control panel, the
  refactor engine's dirty-tree check, and Husky's pre-commit hook
- **Docker Desktop** — only if you want the containerized dev mode

### 1. Install
```sh
git clone <repo-url>
cd Sleipnir
npm install
```

### 2. Run it

**Desktop app (recommended)** — starts the Vite dev server and an Electron
window pointed at it:
```sh
npm run electron:dev
```

**Browser only** — starts just the Vite dev server at
`http://localhost:5183` (the port is fixed in `vite.config.ts`; native
dialogs, the terminal, and the OS-encrypted key store aren't available here):
```sh
npm run dev
```

### 3. Test and lint
```sh
npm test        # vitest, watch mode
npm run test:run # vitest, single run
npm run lint
```

### 4. Build

```sh
npm run build          # tsc -b && vite build -> dist/
npm run electron:build # build + electron-builder -> release/ (dmg/nsis/AppImage)
```

## Configuring the AI agent

Open the Agent dock (bottom of the app) and use its key settings popover to
add an Anthropic API key — it's encrypted at rest via the OS keychain
(`electron/apiKeyStore.cjs`) and never sent back to the renderer once saved.
No key configured? The agent falls back to a local [Ollama](https://ollama.com)
model (`qwen2.5-coder:7b` by default) at `http://localhost:11434` — install
Ollama and pull that model if you want the no-key path. Set
`SLEIPNIR_MODEL_PROVIDER=anthropic|ollama` to force a provider.

## Docker (optional)

```sh
npm run docker:up         # docker-compose up -d
npm run docker:nx serve   # nx serve inside the container
npm run docker:test       # npm test inside the container
npm run docker:down       # docker-compose down
```

> **Known caveat:** `docker-compose.yml` and `docker/Dockerfile.dev` currently
> expose port `5173`, but the Vite dev server is pinned to `5183`
> (`vite.config.ts`, `strictPort: true`) — the container's dev server won't be
> reachable on the mapped port until that's fixed. Prefer `npm run dev` or
> `npm run electron:dev` for now.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` / `npm start` | Vite dev server at `:5183` |
| `npm run electron:dev` | Vite dev server + Electron window, concurrently |
| `npm run build` | Type-check (`tsc -b`) then `vite build` → `dist/` |
| `npm run electron:build` | `build` then `electron-builder` → `release/` |
| `npm test` / `test:ui` / `test:run` | Vitest — watch, UI, and single-run modes |
| `npm run lint` | ESLint over the repo |
| `npm run preview` | Serve the built `dist/` output |
| `npm run generate:mvvm` | Scaffold a View/ViewModel/interface triplet (`tools/generate-mvvm.mjs`) |
| `npm run generate:graph` | Regenerate the planning graph JSON from the current source tree (`tools/generate-graph.mjs`) |
| `npm run docker:up` / `docker:down` | Start/stop the dev container |
| `npm run docker:nx <target>` | Run an Nx target inside the dev container |
| `npm run docker:test` | Run `npm test` inside the dev container |

Pre-commit hooks (Husky + lint-staged) run ESLint and Prettier on staged
`.js/.jsx/.ts/.tsx` files and Prettier on staged `.json/.md/.css` files.

## Project layout

```
electron/     Electron main process, IPC handlers, terminal/chat/key-store backends
src/
  00_planning/  Roadmap engine, planning graph
  01_research/  Docs-only research graph (personas, proposals, analytics)
  02_components/  Default component library (atoms -> molecules -> organisms -> templates)
  03_prototypes/  Default prototype library
  04_validation/  Test/validation logic (Vitest)
  05_analytics/   Test-session results and reporting
  06_source_control/  Git panel — outside the numbered pipeline
  app/          Sleipnir's own application shell (nav rail, docks, editor, AI chat, ...)
  utils/        Small cross-cutting helpers
tools/        Shared Node backend (filesystem, git, refactor engine, codegen scripts)
docker/       Dev/prod Dockerfiles
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for how these actually fit together —
the dual Electron/web transport, the planning graph pipeline, and the AI
agent's tool-use loop. Most directories also carry their own `README.md` with
directory-specific conventions.

## For AI agents working in this repo

Start at [AGENT.md](AGENT.md), which points to [`.agent/RULES.md`](.agent/RULES.md)
(the operating mandates) and [`.agent/Architecture.md`](.agent/Architecture.md)
(the directory map).

## Nx

This workspace is Nx-managed (`nx.json`, `project.json`) but currently defines
a single application project whose targets just wrap the npm scripts above
(`nx serve` → `vite`, `nx build` → `npm run build`, `nx test` → `vitest run`,
`nx lint` → `eslint .`). See [nx-integration.md](nx-integration.md) for details
and notes on growing this into a true multi-project workspace.

## License & privacy

Sleipnir is **source-available** under the
[PolyForm Noncommercial License 1.0.0](LICENSE): you may view, run, and modify
it for **noncommercial** purposes; commercial use requires a separate license
from the copyright holder, which a [Sleipnir Pro](https://andrewsterns.github.io/Sleipnir/#pricing)
license provides. Copyright © 2026 Andrew Sterns.

- **[PRIVACY.md](PRIVACY.md)** — what stays on your device and the few things
  that don't. Short version: your code stays local, the AI can run fully local
  via Ollama, and there's no telemetry.
- **[CHANGELOG.md](CHANGELOG.md)** — release history.
- **[RELEASING.md](RELEASING.md)** — how releases are cut and published.
