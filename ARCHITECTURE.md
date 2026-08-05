# Sleipnir Architecture

Sleipnir is an Electron + React (Vite) desktop application built around two
ideas held together at once: a **research-driven numbered pipeline** for
building UI (research → planning → components → prototypes → validation →
analytics), and a **built-in AI coding agent** that participates in that same
pipeline as a tool-using collaborator, never as an unsupervised code-writer.

This document is the technical map. For setup and day-to-day commands, see
[README.md](README.md). For AI-agent operating rules, see [`.agent/RULES.md`](.agent/RULES.md).

## 1. Runtime architecture: transport parity

Sleipnir runs as an Electron desktop app or as a plain browser tab against the
Vite dev server, and almost every feature behaves identically in both. This
works because all real logic — filesystem access, the library/widget
registries, the refactor engine, and Git — lives in **framework-agnostic Node
modules under `tools/`**, imported by *both* transports:

```
 React renderer (src/)
        |
        v
 PlatformAPI  (src/00_planning/api/PlatformAPI.ts — one typed interface)
        |
   getPlatformAPI() picks electronApi if window.electronAPI exists, else webApi
        |
        +------------------------+------------------------------+
        v                        v
 electronApi.ts            webApi.ts
 (window.electronAPI,      (fetch '/api/sleipnir/*')
  via contextBridge/IPC)
        |                        |
        v                        v
 electron/main.cjs         vite.config.ts's sleipnirApiPlugin()
 (ipcMain.handle(...))     (Connect middleware, dev-server only)
        |                        |
        +------------------------+
                     |
                     v
          tools/sleipnir-backend.mjs
   (+ refactor-engine.mjs, library-registry.mjs,
      git-control.mjs, widget-registry.mjs)
                     |
                     v
        filesystem (src/, repo root) + git CLI
```

`electron/main.cjs` and `vite.config.ts` each register a handler per
`PlatformAPI` method that does nothing but unwrap args and call the matching
`tools/sleipnir-backend.mjs` export — the two are kept in exact 1:1 sync by
hand (there is no codegen for this). The renderer never knows which transport
it's on.

A few features are **Electron-only**, with no web equivalent, because they
have no browser analogue:
- **Real terminal** — `electron/terminal.cjs` spawns actual shells via
  `node-pty`; `window.terminalAPI` streams `terminal:data`/`terminal:exit`
  events. `src/app/Terminal/` is the renderer side.
- **AI chat** — `electron/chat.cjs` + `electron/chatProviders/` (see §7).
  `window.chatAPI` streams tokens/results as push events.
- **BYOK key storage** — `electron/apiKeyStore.cjs` uses Electron's
  `safeStorage` (OS keychain/DPAPI) to encrypt API keys at rest.
- **Native file/folder dialogs** — `openFileDialog`/`openFolderDialog` in
  `electron/main.cjs`, restricted to (and defaulting inside) the repo root.

All filesystem paths funnel through `resolveSafe()` in
`tools/sleipnir-backend.mjs`, which throws if a resolved path escapes the
given root (`src/` for component-scoped calls, the repo root for
`listRepoDir`/`readRepoFile`/etc.) — the single containment mechanism
protecting the filesystem API from both transports.

## 2. The numbered pipeline

| Dir | Role | Notes |
| --- | --- | --- |
| `src/00_planning/` | Roadmaps, the planning graph, and the library/widget registries | The only place implementation work is authorized to start from — see §5, §6 |
| `src/01_research/` | Docs-only research graph (personas, proposals, demographics, analytics writeups) | Any `.md` dropped here becomes a graph node automatically — no registration step |
| `src/02_components/` | The **default** component library | `00_themes/ → 01_atoms/ → 02_molecules/ → 03_organisms/ → 04_templates/`; one of potentially many registered libraries (§5) |
| `src/03_prototypes/` | The **default** prototype library | Experimental sandboxes, built only from components in a registered component library |
| `src/04_validation/` | Test/validation logic | Vitest specs + `setup.ts` (wired in `vite.config.ts`'s `test.setupFiles`) |
| `src/05_analytics/` | Results of validation/test sessions | Feeds back into `01_research` to close the loop |
| `src/06_source_control/` | Git status/diff/stage/commit/branch/push/pull UI | Outside the 00–05 sequence — a standalone utility reachable from its own nav-rail entry, host-agnostic (works against whatever remote the repo has) |

Two directories sit outside this table because they aren't pipeline stages:
`src/app/` (the application shell, §4) and `tools/` (the shared backend, §1).

## 3. Directory reference

```
electron/
  main.cjs, preload.cjs        Electron main process + contextBridge
  terminal.cjs, chat.cjs       node-pty sessions; AI chat orchestration
  apiKeyStore.cjs              Encrypted BYOK key storage
  chatProviders/
    anthropic.cjs, ollama.cjs  Per-provider chat adapters
tools/
  sleipnir-backend.mjs         Shared filesystem/graph/library backend (both transports)
  refactor-engine.mjs          Architecture (folder-layout) migration engine
  library-registry.mjs         Component/prototype library registry (libraries.json)
  widget-registry.mjs / widget-catalog.mjs   Installed widgets + browsable catalog
  git-control.mjs              git CLI wrapper (status/diff/stage/commit/branches/push/pull)
  generate-graph.mjs           Walks each library, emits graph/generated/*.json
  generate-mvvm.mjs            CLI scaffolder for View/ViewModel/interface triplets
  codemod-lint.mjs             Static check: a ViewModel/Controller/Presenter importing its own View
  lsp-proxy.mjs                Bridges the in-app CodeMirror LSP client to typescript-language-server
  generate-icon.mjs            One-off: build/icon.svg -> .ico/.png (electron-builder assets)
src/
  00_planning/ ... 06_source_control/   The pipeline (see §2)
  app/                          Sleipnir's own application shell (see §4)
  utils/                        cn.ts (classnames), useFilteredList.ts
docker/
  Dockerfile.dev, Dockerfile.prod
```

## 4. `src/app/` — the application shell (vs. `src/02_components`)

`src/02_components` is the reusable, app-agnostic design-system component
library — `Frame`, `Icon`, `Button`, `Panel`, `Tabs`, and so on — the same
primitives every other library, prototype, and shell component is built from.

`src/app/` is Sleipnir's *own* chrome, built from those primitives but not
itself a reusable library:

| Folder | Role |
| --- | --- |
| `NavRail/` | The left icon rail; stateless, driven by `App.tsx` |
| `TitleBar/` | Custom window chrome (File/Edit/View/Window menu, drag regions) |
| `AgentChat/` + `AgentDock/` | The AI chat panel and its floating dock wrapper |
| `Terminal/` + `TerminalDock/` | The xterm.js terminal and its dock wrapper |
| `RefactorPanel/` | Preview/apply UI for the refactor engine (§8) |
| `OpenEditors/` | Tabbed editor for files opened via the File menu |
| `PrototypeRail/` | Search/filter navigation for prototypes |
| `DesignSystem/` | The code-editor/component-browser view **onto** a library — `DesignLibrary.view.tsx` (file tree + live preview + CodeMirror editor), generalized for arbitrary folders as `FolderWidget`/`WidgetShell` |

`AgentDock` and `TerminalDock` share one bottom-dock slot in `App.tsx` (only
one open at a time) but each stays mounted-and-hidden rather than unmounting,
so a chat session or shell survives closing the panel.

MVVM naming is applied loosely here compared to `02_components` (see §9):
some folders split cleanly into `.view.tsx`/`.ViewModel.tsx`/`i*.tsx` (e.g.
`Terminal/`), others keep state inline in a single file (e.g. `TitleBar`,
`AgentDock`). Treat `src/02_components` as the strict MVVM reference.

## 5. Library registry — the component/prototype extensibility layer

A **library** (`LibraryEntry`, `src/00_planning/graph/types.ts`) is a
registered component or prototype library root:
`{ id, kind: 'component' | 'prototype', label, root, architecture, language, createdAt }`.
The registry is `src/00_planning/graph/libraries.json`, backed by
`tools/library-registry.mjs`. Two entries are seeded and protected from
deletion: `dsm` (`02_components`) and `prototypes` (`03_prototypes`).

Each library becomes its own tab in Planning. Creating one
(`CreateLibraryModal`) picks a name, kind, `architecture` (Atomic/MVVM/MVC/MVP
— see §8), and `language`; deleting one (`DeleteLibraryModal`) requires typing
the library's exact label to confirm, mirroring GitHub's repo-deletion
pattern, and is refused server-side for the two protected IDs.

`LIBRARIES` is statically imported from `libraries.json` at build time
(mirroring how `combine.ts` sources the generated graph JSON, §6) rather than
fetched at runtime — unlike widgets (§6), which must always be fetched live.

## 6. Widget registry — the nav-rail extensibility layer

A **widget** (`WidgetEntry`) sits one level above a library: libraries add
tabs *inside* Components/Prototypes, widgets add whole new **nav-rail
entries**. A widget is `kind: 'folder'` (a read-only file-tree browser over a
directory, `rootScope: 'src' | 'repo'`) or `kind: 'tool'` (reserved for a
`toolId` like `docker`/`nx`; not yet implemented — every shipped catalog entry
is `folder`-kind). Installed widgets live in
`src/00_planning/graph/widgets.json`, backed by `tools/widget-registry.mjs`.

Two install paths, both converging on `PlatformAPI.installWidget()`:
- **File → Open Folder…** — a native picker (Electron only) sets a pending
  path; `OpenFolderModal` derives a name/tag, auto-detects `rootScope` (paths
  under `src/` are editable, everything else is forced read-only), and
  installs it.
- **Widget Store** (the `+` nav-rail entry) — a VS-Code-Extensions-style
  browser over `tools/widget-catalog.mjs`'s curated `widget-catalog.json`
  (e.g. Docker, Nx, Project Config, Electron Shell). Installing flips the
  entry to "Installed" in place.

Widgets must be fetched at runtime (`listWidgets()`), never statically
imported — a static import only appears to work in Vite dev mode because of
HMR reloads, and breaks in a packaged build. `App.tsx` holds installed widgets
in React state and appends to it on install, so a new rail icon appears
without navigating away.

Note: the "Docker" widget is just a read-only browser onto `docker/` +
`docker-compose.yml` — it is not a Docker integration. Actual container
lifecycle is the separate `docker:up`/`docker:down` npm scripts (README §Docker).

## 7. Planning graph

`GraphNode` (`{id, label, kind: 'built' | 'proposed', map, filePath?, type?, description?, status?, planId?}`)
and `GraphEdge` (`{source, target, kind: 'borrows' | 'plan-step'}`) are the
graph's two primitives; `GraphMapId` is keyed to a registered library or a
fixed doc map (`research`, `validation`, `todo`, `claude`, `open`).

**Generation:** `tools/generate-graph.mjs` walks each registered library's
root (via `library-registry.mjs`), extracts import/export specifiers by
regex to build `borrows` edges, infers a `type` from path segments (atom /
molecule / organism / template / page / theme / prototype / other), and emits
one JSON file per map to `src/00_planning/graph/generated/`. Run it directly
with `npm run generate:graph`, or it's triggered automatically after
scaffolding/library creation.

**Assembly:** `combine.ts`'s `getGraphForMap()` loads the generated JSON via
`import.meta.glob('./generated/*.json', { eager: true })` (build-time,
static) and merges in hand-authored aspirational nodes from
`proposed-nodes.ts`. Maps with no generated JSON (`todo`, `claude`, `open`)
are populated entirely at runtime: `claude` nodes come only from the AI
agent's `create_plan_node` tool (§8), persisted to `notes.json` and re-fetched
live via `refreshGraphForMap` (bypassing the static glob, since a
freshly-created library's JSON won't exist in the build-time snapshot).

**Visualization:** `layout.ts`'s `buildForceLayout` seeds nodes in a circle
and runs a `d3-force-3d` simulation; `GraphCanvas.tsx` drives it via
`requestAnimationFrame` while "hot," with pan/zoom/drag, neighbor
highlighting, and a dashed/hollow style for `proposed` vs. solid `built`
nodes.

**Roadmaps** (`src/00_planning/roadmaps/*.md`, following
`PLAN_TEMPLATE.md`) are separate, human/AI-authored prose documents — Context
citing `01_research/`, Component Design citing `02_components/`, Execution
Targets, and a checklist Task Roadmap. They are not parsed into graph nodes;
they're intent, not data. Completed roadmaps move to `archive/` (read-only).

## 8. The AI agent

`electron/chat.cjs` is a provider-agnostic tool-use loop (up to
`MAX_TOOL_TURNS = 6` per message), streaming text via `chat:token`. Provider
selection (`selectProvider()`): `SLEIPNIR_MODEL_PROVIDER` env var if set, else
Anthropic if a key is configured (§ BYOK below), else Ollama.

- `chatProviders/anthropic.cjs` — `@anthropic-ai/sdk`, model `claude-sonnet-5`,
  streamed via `messages.stream()`.
- `chatProviders/ollama.cjs` — local, no key required, `qwen2.5-coder:7b`
  against `http://localhost:11434`, hand-rolled NDJSON streaming; noted in
  code as flakier at structured tool calls than Anthropic.

**BYOK:** `electron/apiKeyStore.cjs` encrypts keys at rest via Electron's
`safeStorage`; `getKeyStatus()` only ever returns `{ configured, hint }`
(last 4 characters), never the raw key. `ANTHROPIC_API_KEY` env var is a dev
convenience fallback, lower precedence than a saved key.

**Tools available to the model** (defined once in `chat.cjs`, converted to
each provider's schema by e.g. `anthropic.cjs`'s `toProviderTools()`):
- `create_plan_node` — adds a node to the `claude` planning map
- `create_library` — registers a new library (§5), then the renderer jumps to it
- `generate_code` — **never writes to disk.** It emits a `chat:codeGenerated`
  event; the renderer stages the content into an unsaved Code Editor tab
  (`App.tsx`'s `pendingOverride`) for a human to review and explicitly save.

This human-in-the-loop gate on `generate_code` is the load-bearing safety
property of the whole agent design — every other tool only ever registers
metadata (a plan node, a library entry), never file contents.

## 9. The refactor engine

"Architecture" here means one of four **folder layouts** for a component
library, defined in `tools/refactor-engine.mjs`'s `LAYOUT`:
- **Atomic** — tier folders only (`01_atoms/`, `02_molecules/`, ...)
- **MVVM** — `Views/`, `ViewModels/`, `Interfaces/`
- **MVC** — `Views/`, `Controllers/`, `Models/`
- **MVP** — `Views/`, `Presenters/`, `Models/`

`previewRefactor(architecture, libraryId)` computes a move/rewrite plan
read-only (`buildPlan`), plus static-analysis `violations` from
`codemod-lint.mjs` (a ViewModel/Controller/Presenter importing its own View).
`applyRefactor` executes that exact plan: it **refuses if the git working
tree is dirty**, then `fs.renameSync`s files and rewrites relative import
specifiers by exact character offset, prunes empty directories, and updates
the library's registry entry. It never renames files or symbols — only
relocates them. `src/app/RefactorPanel/` is the UI: stats, a bucketed
dot-preview (`MiniArchitectureGraph.tsx`), a moves list, and Apply/Cancel.

## 10. Source control panel

`src/06_source_control/SourceControlView.tsx` (+ `.ViewModel.tsx`) is a full
Git UI — status, staged/unstaged diffs, stage/unstage, commit, branch list and
branch-tree view, checkout, create branch, push/pull/fetch — backed by
`tools/git-control.mjs`, which shells out to the system `git` binary (`execFile`,
no git npm dependency). `push()` auto-adds `--set-upstream origin <branch>` on
a repo's first push. It's intentionally host-agnostic: it works against
whatever remote the current repo actually has.

## 11. Conventions

- **MVVM naming** — `.view.tsx` (UI/layout), `.viewModel.ts`/`.ViewModel.tsx`
  (a React hook holding logic/state), `i*.tsx` (prop/type interfaces). Strictly
  followed in `src/02_components`; looser and inconsistently-cased in
  `src/app` (see §4) — several shell components keep state inline rather than
  splitting out a ViewModel, and ViewModel-suffix casing varies
  (`Terminal.ViewModel.tsx` vs. `RefactorPanelViewModel.tsx`). Follow the
  stricter convention for anything that will be reused as a component-library
  export; the app-shell convention is looser by precedent, not by rule.
- **Roadmap-first** — no implementation begins without a roadmap in
  `src/00_planning/roadmaps/`, citing research and citing the components it
  touches.
- **Component-sourced UI** — everything in `src/03_prototypes` (and any
  registered prototype library) is built from a registered component
  library's exports, not ad hoc markup.
- **`01_research` is docs-only** — no runnable code; a dropped `.md` file
  becomes a graph node automatically, no registration step.

## 12. Build & packaging

`npm run build` runs `tsc -b && vite build` → `dist/`. `npm run electron:build`
does that, then `electron-builder`, producing a `dmg` (mac), `nsis`
installer (win), or `AppImage` (linux) into `release/`. The packaged app
bundles `dist/`, `electron/`, `tools/sleipnir-backend.mjs`,
`tools/generate-graph.mjs`, `tools/refactor-engine.mjs`,
`tools/library-registry.mjs`, `src/00_planning/graph/libraries.json`, and
`package.json` (see the `build.files` list in `package.json`) — everything the
shared backend needs at runtime, without the rest of the source tree.
