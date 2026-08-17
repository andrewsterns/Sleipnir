# Project Architecture: Numbered Pipeline

Sleipnir is organized as a linear execution pipeline to ensure "vibe coding" —
by a human or by the built-in AI agent — is always research-grounded. This is
the short directory map for agents; see the root [`ARCHITECTURE.md`](../ARCHITECTURE.md)
for the full technical architecture (transport parity, the planning graph
pipeline, the AI agent's tool-use loop, and the refactor engine). Note:
`ARCHITECTURE.md` §5–6 also documents a library/widget registry that was
designed but never implemented — don't assume it exists.

## Directory structure
- `.agent/` — **Meta-Architecture**. Conventions, rules, and system mandates (this directory).
- `src/00_planning/` — **Execution Roadmaps + Live Registries**. Roadmap docs and
  the planning graph.
- `src/01_research/` — **Research Documentation**. Personas, proposals, and journey maps. Docs only.
- `src/02_components/` — **Default Component Library**. `00_themes/ → 01_atoms/ → 02_molecules/ → 03_organisms/ → 04_templates/`. Currently the only component library — there's no registry to add more (see the note above).
- `src/03_prototypes/` — **Default Prototype Library**. Consolidated area for all experimental prototypes.
- `src/04_validation/` — **Session Validation**. Vitest logic for running and verifying prototype tests.
- `src/05_analytics/` — **Result Data**. Output from testing sessions for further research.
- `src/06_source_control/` — **Source Control**. Local git status/diff/commit and push/pull/fetch, host-agnostic. Not part of the 00–05 pipeline sequence; reachable from its own nav-rail entry.
- `src/app/` — **Application Shell**. Sleipnir's own chrome (nav rail, title bar, AI chat, terminal, refactor UI, the design-system editor) — built from `02_components` primitives but not itself a reusable library. Not a pipeline stage.
- `tools/` — **Shared Backend**. Framework-agnostic Node modules (filesystem, git, refactor engine, codegen) that both the Electron and web dev-server transports call into identically.
- `electron/` — **Desktop Shell**. Electron main process, IPC handlers, and the Electron-only features (real terminal, AI chat orchestration, encrypted API key storage, native dialogs).

## Key boundaries
1. **01_research is docs only:** No logic in research; a dropped `.md` file becomes a graph node automatically.
2. **00_planning is the trigger:** Implementation only starts after a roadmap is defined in `00_planning/roadmaps/`.
3. **02_components is the current source:** All UI in a prototype must come from `02_components` — it's the only registered component library today.
4. **`generate_code` never writes to disk; `run_command` never runs unconfirmed:** The AI agent's code-generation tool always stages content in an editor tab for human review/save, and its command-execution tool blocks on an explicit human confirmation before anything runs — see `.agent/RULES.md`.

## Getting started
- `npm install`
- `npm run electron:dev` (desktop app) or `npm run dev` (browser only, `:5183`)
- `npm test`
