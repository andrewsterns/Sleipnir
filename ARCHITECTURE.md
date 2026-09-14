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
works because all real logic — filesystem access, the planning graph, the
refactor engine, and Git — lives in **framework-agnostic Node modules under
`tools/`**, imported by *both* transports:

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
   (+ refactor-engine.mjs, git-control.mjs)
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
| `src/00_planning/` | Roadmaps and the planning graph | The only place implementation work is authorized to start from. (§5–§6 previously described a library/widget registry layer here — it was designed but never implemented; see the note at the top of §5.) |
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
  sleipnir-backend.mjs         Shared filesystem/graph backend (both transports)
  refactor-engine.mjs          Architecture (folder-layout) migration engine
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
| `DesignSystem/` | The code-editor/component-browser view **onto** a project — `FolderBrowserView` (file tree + tabs + CodeMirror editor) laid out inside `WidgetShell` (rail + optional preview + code regions). Today only ever instantiated with `scope="workspace"` (fully read/write); its `scope="src"/"repo"` and `readOnly` prop paths exist but have no live caller yet |

`AgentDock` and `TerminalDock` share one bottom-dock slot in `App.tsx` (only
one open at a time) but each stays mounted-and-hidden rather than unmounting,
so a chat session or shell survives closing the panel.

MVVM naming is applied loosely here compared to `02_components` (see §9):
some folders split cleanly into `.view.tsx`/`.ViewModel.tsx`/`i*.tsx` (e.g.
`Terminal/`), others keep state inline in a single file (e.g. `TitleBar`,
`AgentDock`). Treat `src/02_components` as the strict MVVM reference.

## 5–6. Library/widget registry — designed, not built

Earlier drafts of this document (and `src/00_planning/README.md`) described a
two-layer extensibility system here: a **library registry**
(`tools/library-registry.mjs`, `graph/libraries.json`) letting users register
additional component/prototype libraries beyond the seeded `02_components`/
`03_prototypes`, and a **widget registry** (`tools/widget-registry.mjs`,
`graph/widgets.json`, a Widget Store) letting users install read-only folder
browsers or `'tool'`-kind dashboards (Docker, Nx) as new nav-rail entries.

**None of it exists in code today** — no `LibraryEntry`/`WidgetEntry` types,
no registry files, no `CreateLibraryModal`/`OpenFolderModal`/`WidgetStore`,
no `installWidget`/`listWidgets` on `PlatformAPI`. `src/App.tsx`'s
`NAV_ITEMS` is a hardcoded 4-entry array (`planning`, `research`, `workspace`,
`source-control`) with no registry-driven extensibility. `02_components` and
`03_prototypes` are simply the two fixed default libraries; there is no way
to register a third today. Treat this as a real, from-scratch subsystem to
design and build later (see `ROADMAP.md` Phase 3), not a small gap to patch.
`FolderBrowserView`'s `scope`/`readOnly` props (§4) are the one piece of live
plumbing that a future "read-only browser" widget kind could build on.

## 7. Planning graph

`GraphNode` (`{id, label, kind: 'built' | 'proposed', map, filePath?, type?, description?, status?, planId?}`)
and `GraphEdge` (`{source, target, kind: 'borrows' | 'plan-step'}`) are the
graph's two primitives; `GraphMapId` is keyed to a registered library or a
fixed doc map (`research`, `validation`, `todo`, `claude`, `open`).

**Generation:** `tools/generate-graph.mjs` walks source directories under
`src/`, extracts import/export specifiers by regex to build `borrows` edges,
infers a `type` from path segments (atom / molecule / organism / template /
page / theme / prototype / other), and emits one JSON file per map to
`src/00_planning/graph/generated/`. Run it directly with
`npm run generate:graph`.

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
the "Local Ollama" entry in the model dropdown if explicitly picked
(`modelStore.OLLAMA_MODEL_ID` — see § BYOK below), else Anthropic if a key is
configured, else Ollama.

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
- `generate_code` — **never writes to disk.** It emits a `chat:codeGenerated`
  event; the renderer stages the content into an unsaved Code Editor tab
  (`App.tsx`'s `pendingOverride`) for a human to review and explicitly save.

(A `create_library` tool was previously documented here — it doesn't exist;
there is no library registry for it to register into, see §5–6.)

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
does that, then `electron-builder`, producing a `dmg`/`zip` (mac), `nsis`
installer (win), or `AppImage` (linux) into `release/`. The packaged app
bundles `dist/**/*`, `electron/**/*`, `tools/**/*`, and `package.json` (see
`build.files` in `package.json`), and unpacks `node-pty` from the asar
archive (native `.node` binaries can't load from inside it) — everything the
shared backend and terminal need at runtime, without the rest of the source
tree.
