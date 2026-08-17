# Sleipnir Roadmap: Becoming a True IDE

Sleipnir's editing core is already real — a genuine TypeScript language
server (hover, diagnostics, autocomplete, signature help), full CodeMirror
editing ergonomics, thoughtful auto-save/dirty-state tracking. And it has
something no mainstream IDE has: a live dependency graph of a design system,
a one-click architecture migration engine (Atomic ↔ MVVM ↔ MVC ↔ MVP), and
an AI agent that plans and stages code for review inside that graph. That
combination is Sleipnir's actual differentiator, not "catching up to VS Code."

But today Sleipnir can only ever edit **its own repo** — every file operation
resolves against a hardcoded project root. This roadmap sequences the path
to a general-purpose IDE, front-loading the one change that makes every
later phase valuable.

## Phase 0 — General Workspace (complete)
Let "Open Folder" actually repoint the app at an arbitrary project on disk —
full read/write/create file editing via a real native folder picker, a
persisted "last workspace" so relaunching reopens the same project. This is
additive: a new, independently-rooted `scope: 'workspace'` alongside the
existing `src`/`repo` scopes. The Planning graph, Component/Prototype
libraries, and Refactor engine deliberately keep working exactly as today,
scoped to Sleipnir's own repo — see "Explicitly deferred" below for why.

## Phase 1 — Navigate and find anything (complete)
Once Sleipnir can open someone else's project, these stop being nice-to-haves:
- **Command palette / quick-open** (Ctrl+P) — fuzzy file switcher over "the
  current project" (the open Workspace if any, else Sleipnir's own repo).
  Prefixing the query with `>` switches to project-wide content search
  (grep) over the same scope, instead of a separate NavRail category — every
  widget already has its own local search box, so a second, disconnected
  "Search" page was redundant.
- **Fixed cross-file LSP navigation** — go-to-definition, find-references,
  and rename-symbol previously only worked for files already open as tabs
  (rename could report success while silently missing un-open files). Fixed
  via a custom LSP `Workspace` implementation that forces the right tab open
  before navigating/editing.

## Phase 2 — Make the IDE feel complete (next)
- **Validation** (complete) — the open Workspace's own Vitest suite runs via
  `vitest run --reporter=json` and shows structured pass/fail results in-app
  (`ValidationView`, `electron/validation.cjs`), instead of CLI-only.
- **Split editor panes** — multiple simultaneously-visible editor regions.
  Not started. (Multi-terminal is already done: `TerminalDock` supports any
  number of concurrent tabs today.)
- **Keybinding customization** (partial) — `Settings → Keybindings` exists and
  can remap Quick Open's hotkey (Ctrl/Cmd+P), the one real consumer of
  `Frame`'s `onHotkey` extension point. Still no way to view or remap any
  other binding. (Theme switching is already done — `Settings → Appearance`
  exposes 2 of the 5 CSS themes; the other 3 predate the tactical-tuned UI and
  are intentionally left hidden.)
- **Multi-window support** (complete) — File > New Window opens a new window
  with its own independent project. Each window's terminal/chat/preview/
  command-runner sessions are killed when that window closes, not just at
  app quit (previously they leaked until the whole app quit).

## Phase 3 — Deepen the differentiators
- **AI agent** (partial): `read_file` and `run_command` tools now exist —
  the agent can inspect existing files and propose shell commands (tests,
  installs, build scripts), each gated behind an explicit confirmation
  dialog before anything executes, with live streamed output. Up from 2
  tools (`create_plan_node`, `generate_code`) and no file/command access.
  Still open: inline contextual actions from a selection/diagnostic
  ("explain this," "fix this"), multi-session chat (today one session per
  window).
- **Git** (complete): stash (push/apply/pop/drop), an optional side-by-side
  diff view, and a merge-conflict banner (open the file, then mark it
  resolved) are all shipped.
- **Widget `'tool'` kind**: deferred, non-goal for now. `ARCHITECTURE.md`
  previously described a library/widget registry (types, a registry file, a
  Widget Store) as built — it isn't; none of it exists in code today. Treat
  this as a from-scratch subsystem to design later, not a small render-path
  gap to fill in.

## Phase 4 — Make the Planning pipeline workspace-aware (large, deferred)
Replace `combine.ts`'s build-time `import.meta.glob` with a dynamic runtime
load and make `generate-graph.mjs` scan an arbitrary root, so the graph /
component-library / refactor-engine experience can extend beyond Sleipnir's
own repo. Deliberately sequenced last — it's a bigger rewrite than everything
above combined, and every phase before it is valuable on its own first.

## Explicitly deferred / non-goals for now
- **General-purpose debugging** (breakpoints, step-through, call stack) — a
  huge lift across languages; revisit only with demonstrated need.
- **Collaboration/remote dev, settings sync, an external extension
  marketplace** — not on the path to "true IDE for one developer," which is
  the more valuable near-term target.

---

# Launch Readiness (shipping to real users)

The phases above are *product* work — features. This section is the separate
axis of *actually distributing* Sleipnir: packaging, trust, ops, legal. As of
the launch-readiness audit, the product is strong but none of this scaffolding
exists yet. Ordered by "a packaged build literally breaks" → "strangers can
trust and run it."

## 🔴 Blockers — a packaged build breaks without these
- [x] **Bundle all `tools/*.mjs`.** `build.files` only shipped 3 of them, but
  the main process dynamically imports `git-control`, `preview-registry`,
  `source-extensions`, and (packaged-only) `lsp-proxy` too — so git/preview/
  file-tree/LSP threw on first use in a real install. Fixed to `tools/**/*`.
- [x] **Unpack `node-pty` from asar.** Native `.node` binaries can't load from
  inside the asar archive, so the terminal failed to spawn on every packaged
  install. Added `asarUnpack` for it.
- [ ] **Code signing + notarization.** Unsigned builds are blocked by Windows
  SmartScreen ("unknown publisher") and refused by macOS Gatekeeper. Needs a
  Windows cert + macOS Developer ID + notarization in the build config.
- [x] **License / EULA.** `LICENSE` (PolyForm Noncommercial 1.0.0) and
  `package.json`'s `license` field are both in place and consistent with
  what README.md/PRIVACY.md claim.

## 🟠 Should-fix before a public launch
- [x] **Crash/error handling.** `electron/main.cjs` has real
  `uncaughtException`/`unhandledRejection` handlers that log to
  `userData/logs/main.log` (`logMainError`). Note: main-process only — there's
  still no renderer-crash handling (`render-process-gone`) and no remote
  crash reporter (Sentry/Bugsnag-style), just local file logging.
- [x] **Auto-update.** `electron-updater` is wired (`initAutoUpdater`,
  auto-checks on launch in packaged builds) with a `build.publish` GitHub
  config. The manual "check for updates" IPC handler exists but has no menu/
  button calling it yet — minor, not a blocker.
- [x] **Smoke tests.** `pathSafety.test.ts` and `tsxAdapter.test.ts` cover the
  stated minimum (backend path-safety + an import adapter). Coverage is still
  thin overall — worth growing, not a launch blocker anymore.
- [x] **CI.** `.github/workflows/ci.yml` runs typecheck/lint/test/build on
  every push and PR; `release.yml` builds/publishes on version tags (wired,
  not yet exercised — no release has been tagged).
- [ ] **Real version + changelog.** Still `0.0.0`, no git tags cut yet. Purely
  manual today (`npm version <bump>` per `RELEASING.md`) — a release action
  for when you're ready to ship, not a code task.
- [x] **Privacy note.** `PRIVACY.md` covers what leaves the machine (Anthropic
  BYOK vs. local Ollama, auto-update's GitHub check, no telemetry) and is
  consistent with README.md.

## 🟡 Known product gaps surfaced by the audit (fold into the phases above)
- **Save-on-close prompt** (fixed) — closing a window or the app with unsaved
  AI-generated content now prompts (Cancel / Discard / Save & Close) instead
  of silently discarding it (`handleCloseAttempt` in `electron/main.cjs`).
- **Per-window resource cleanup** (fixed) — see the Multi-window support
  bullet in Phase 2 above.
- Remaining: split editor panes, full keybinding remapping (today only Quick
  Open's), the still-open AI agent items in Phase 3 (inline contextual
  actions, multi-session chat).
