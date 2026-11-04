# Sleipnir Architecture

Sleipnir is an Electron + React (Vite) desktop application for designing and
building software in one place: a **Canvas** for 2D boards and 3D modeling
(with lighting and rendering to come) whose designs become real code, a
**Planning** graph of the project's architecture and plans, and **git**
built in — with AI agents working through all three as tool-using
collaborators, never as unsupervised code-writers.

This document is the technical map. For setup and day-to-day commands, see
[README.md](README.md). For AI-agent operating rules, see [`.agent/RULES.md`](.agent/RULES.md).

## 1. Runtime architecture: transport parity

Sleipnir runs as an Electron desktop app or as a plain browser tab against the
Vite dev server, and almost every feature behaves identically in both. This
works because all real logic — filesystem access, the planning graph, and
Git — lives in **framework-agnostic Node modules under
`tools/`**, imported by *both* transports:

```
 React renderer (src/)
        |
        v
 PlatformAPI  (src/platform/PlatformAPI.ts — one typed interface)
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
   (+ tools/backend/*.mjs, git-control.mjs)
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

## 2. Feature folders

`src/` is organised by feature, named for what it is. There are no numbered
stage folders: the old research → analytics pipeline is gone, and a feature's
place in the nav rail is set in `App.tsx`'s `NAV_ITEMS`, not by its folder.

| Dir | Role |
| --- | --- |
| `src/planning/` | The Planning graph: plan tabs, the architecture and Health views, agent trail, skills. `graph/` holds the graph model, layout and import adapters |
| `src/document/` | The scene document both the 2D canvas and 3D modeling edit: layers, components and variants, paint, vector paths, layout, undo, and each layer's 3D placement (`sceneTypes`, `placement`, `frontView`). Pure functions, no React; imports no feature |
| `src/canvas/` | The Canvas editor: boards (`board/`), panels, code emit (`emit/`), board files and clipboard (`io/`), and the editor's hooks (`hooks/` — pointer gestures, path editing, layer commands, components, clipboard, shortcuts, 3D tools). `CanvasView.ViewModel.tsx` wires those hooks together |
| `src/modeling/` | 3D modeling: `scene3d/` (sketch planes, plane editing, meshes), `geometry/` (solids, modifiers) and `viewport/` (the three.js viewport, lazy-loaded). Imports only `document/` and `utils/`; lighting and rendering go here next |
| `src/source-control/` | Git status/diff/stage/commit/branch/push/pull UI, backed by `tools/git-control.mjs` |
| `src/validation/` | The Validation view, plus `setup.ts` (Vitest's `test.setupFiles`) |
| `src/platform/` | The one transport-neutral API every feature uses (`PlatformAPI`, `sleipnirApi`, the Electron and web implementations — §1). Also holds the backend's integration tests |
| `src/app/` | The application shell and UI kit (§4) |
| `src/themes/`, `src/keybindings/` | App-wide theme tokens/controller and keyboard shortcuts |
| `src/utils/` | Small shared helpers (`cn`, `fuzzyMatch`) |

Features import `platform/`, `document/`, `app/UIKit/` and `utils/`; they
should not import each other's internals. The one allowed direction between
features is canvas → modeling (the editor hosts the 3D tools); modeling never
imports canvas. (`platform/` itself imports only *types* from
`planning/graph/types.ts`, for the shapes its API returns.)

### Load rules

The first paint parses only what `src/main.tsx` reaches through static
imports: the shell and Planning. Every other view is its own chunk
(`src/app/lazyViews.ts`), warmed one per idle moment after launch — the boot
screen never waits on them. The heaviest packages — three.js and
`@react-three/*`, CodeMirror, xterm — must stay behind a dynamic `import()`;
`src/app/firstLoadBudget.test.ts` fails if one of them reaches the first load.
The 3D viewport is a further lazy chunk inside Canvas, loaded only when a
board opens it.

## 3. Directory reference

```
electron/
  main.cjs, preload.cjs        Electron main process + contextBridge
  terminal.cjs, chat.cjs       node-pty sessions; AI chat orchestration
  apiKeyStore.cjs              Encrypted BYOK key storage
  chatProviders/               Per-provider chat adapters (Anthropic, OpenAI, Gemini, Ollama)
tools/
  sleipnir-backend.mjs         Shared filesystem/graph backend (both transports)
  backend/                     The backend's parts (paths, planning store, plan steps, step reports)
  git-control.mjs              git CLI wrapper (status/diff/stage/commit/branches/push/pull)
  generate-graph.mjs           Emits planning/graph/generated/*.json (the Validation doc map)
  agentSkills/                 The skills and plan CLI installed into projects (.sleipnir/, .claude/, ...)
  lsp-proxy.mjs                Bridges the in-app CodeMirror LSP client to typescript-language-server
src/
  planning/ canvas/ modeling/ source-control/ validation/   Features (see §2)
  document/                     The shared scene document (2D + 3D)
  platform/                     The transport-neutral API (§1)
  app/                          Application shell + UIKit (see §4)
  themes/ keybindings/ utils/   App-wide support
docker/
  Dockerfile.dev, Dockerfile.prod
```

## 4. `src/app/` — the application shell

`src/app/UIKit/` holds the primitives every view is built from — `Frame`,
`Icon`, `Button`, `IconButton`, `Field`, `Dropdown`, `Search`, and so on.

The rest of `src/app/` is Sleipnir's own chrome, built from those primitives:

| Folder | Role |
| --- | --- |
| `NavRail/` | The left icon rail; stateless, driven by `App.tsx` |
| `TitleBar/` | Custom window chrome (File/Edit/View/Window menu, drag regions) |
| `AgentChat/` + `AgentDock/` | The AI chat panel and its floating dock wrapper |
| `Terminal/` + `TerminalDock/` | The xterm.js terminal and its dock wrapper |
| `DesignSystem/` | The code-editor/component-browser view **onto** a project — `FolderBrowserView` (file tree + tabs + CodeMirror editor) laid out inside `WidgetShell` (rail + optional preview + code regions). Today only ever instantiated with `scope="workspace"` (fully read/write); its `scope="src"/"repo"` and `readOnly` prop paths exist but have no live caller yet |

`AgentDock` and `TerminalDock` share one bottom-dock slot in `App.tsx` (only
one open at a time) but each stays mounted-and-hidden rather than unmounting,
so a chat session or shell survives closing the panel.

MVVM naming is applied loosely here (see §11): some folders split cleanly
into `.tsx`/`.ViewModel.tsx`/`i*.tsx` (e.g. `Terminal/`), others keep state
inline in a single file (e.g. `TitleBar`, `AgentDock`).

## 5–6. Library/widget registry — designed, not built

Earlier drafts of this document (and `src/planning/README.md`) described a
two-layer extensibility system here: a **library registry**
(`tools/library-registry.mjs`, `graph/libraries.json`) letting users register
additional component/prototype libraries, and a **widget registry** (`tools/widget-registry.mjs`,
`graph/widgets.json`, a Widget Store) letting users install read-only folder
browsers or `'tool'`-kind dashboards (Docker, Nx) as new nav-rail entries.

**None of it exists in code today** — no `LibraryEntry`/`WidgetEntry` types,
no registry files, no `CreateLibraryModal`/`OpenFolderModal`/`WidgetStore`,
no `installWidget`/`listWidgets` on `PlatformAPI`. `src/App.tsx`'s
`NAV_ITEMS` is a hardcoded array (`planning`, `canvas`, `workspace`,
`validation`, `source-control`) with no registry-driven extensibility. Treat this as a real, from-scratch subsystem to
design and build later (see `ROADMAP.md` Phase 3), not a small gap to patch.
`FolderBrowserView`'s `scope`/`readOnly` props (§4) are the one piece of live
plumbing that a future "read-only browser" widget kind could build on.

## 7. Planning graph

`GraphNode` (`{id, label, kind: 'built' | 'proposed', map, filePath?, type?, description?, status?, planId?}`)
and `GraphEdge` (`{source, target, kind: 'borrows' | 'plan-step'}`) are the
graph's two primitives; `GraphMapId` is keyed to a registered library or a
fixed map (`welcome`, `validation`, `todo`, `claude`, `open`).

**Architecture view:** a plan tab's architecture is the open project's real
import graph — `graph/workspaceScanCache.ts` scans every file once (cached,
refreshed per changed file) and `graph/architectureScope.ts` draws it whole up
to 1500 files. Past that it keeps the files near the plan, fills the rest of
the budget with the most-connected files, and folds only the remainder into
folder nodes.

**Generation:** `tools/generate-graph.mjs` emits the Validation doc map to
`src/planning/graph/generated/`. Run it directly with `npm run generate:graph`.

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

**Roadmaps** (`src/planning/roadmaps/*.md`, following
`PLAN_TEMPLATE.md`) are separate, human/AI-authored prose documents — Context,
Component Design, Execution Targets, and a checklist Task Roadmap. They are not parsed into graph nodes;
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

## 9. The refactor engine (removed)

The folder-layout refactor engine (`tools/refactor-engine.mjs`, Atomic/MVVM/
MVC/MVP migrations) and its `RefactorPanel` UI were removed in `09c56de`. The
`/optimize` analyzer (`.sleipnir/analyze.mjs`) is what measures structure now.

## 10. Source control panel

`src/source-control/SourceControlView.tsx` (+ `.ViewModel.tsx`) is a full
Git UI — status, staged/unstaged diffs, stage/unstage, commit, branch list and
branch-tree view, checkout, create branch, push/pull/fetch — backed by
`tools/git-control.mjs`, which shells out to the system `git` binary (`execFile`,
no git npm dependency). `push()` auto-adds `--set-upstream origin <branch>` on
a repo's first push. It's intentionally host-agnostic: it works against
whatever remote the current repo actually has.

## 11. Conventions

- **Named feature folders** — a new area of the product (e.g. rendering) gets
  a named folder under `src/` or inside the feature it belongs to; never a
  numbered prefix.
- **MVVM naming** — `Name.tsx` (UI/layout), `Name.ViewModel.tsx` (a React
  hook holding logic/state), `iName.tsx` (prop/type interfaces). Several shell
  components keep state inline rather than splitting out a ViewModel; split
  one out once the logic outgrows the layout.
- **Plan-first** — larger work starts as a plan in the Planning graph
  (`/plan`), so each step is reviewable and records the files it changed.
- **Heavy packages stay lazy** — see §2's load rules.

## 12. Build & packaging

`npm run build` runs `tsc -b && vite build` → `dist/`. `npm run electron:build`
does that, then `electron-builder`, producing a `dmg`/`zip` (mac), `nsis`
installer (win), or `AppImage` (linux) into `release/`. The packaged app
bundles `dist/**/*`, `electron/**/*`, `tools/**/*`, and `package.json` (see
`build.files` in `package.json`), and unpacks `node-pty` from the asar
archive (native `.node` binaries can't load from inside it) — everything the
shared backend and terminal need at runtime, without the rest of the source
tree.
