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
- **Resurrect Validation** with real content — surface the project's own test
  results in-app (Vitest today only exists as a CLI; the "Validation" pipeline
  stage currently has no UI at all).
- **Multi-terminal / split editor panes** — one terminal instance and one
  visible editor at a time today.
- **Expose what already exists** — theme switching (4 themes exist in CSS,
  no UI toggle). Keybinding customization is partly still true: `Frame`'s
  `onHotkey` extension point now has one real consumer (the command
  palette's Ctrl+P), but there's still no settings UI for a user to view or
  remap any keybinding.

## Phase 3 — Deepen the differentiators
- **AI agent**: inline contextual actions from a selection/diagnostic
  ("explain this," "fix this"), more tools (read arbitrary files, run tests,
  run terminal commands with confirmation), multi-session chat. Today it's a
  standalone dock with 3 tools and one session.
- **Git**: stash, a real side-by-side diff view, merge-conflict resolution UI
  (today you're told to go resolve it in the terminal).
- **Widget `'tool'` kind**: the type system already reserves a `'tool'` widget
  kind for real dashboards (Docker, Nx) beyond "browse a folder read-only" —
  it has zero render path today. Building it out is a genuine extensibility
  differentiator if done well.

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
