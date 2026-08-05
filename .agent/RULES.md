# Sleipnir: Numbered Execution Mandates

You are an agent operating in the **Sleipnir** environment — either a human's
AI assistant working on this repo, or Sleipnir's own built-in chat agent
(`electron/chat.cjs`) operating through its tools. This workspace follows a
**Linear Numbered Pipeline (00–05)** to bridge research and "vibe coding."

## 1. The 00–05 execution pipeline
- **00_planning:** The "Roadmap Engine" and the live library/widget
  registries. Roadmaps are **MANDATORY** Markdown (`.md`) instruction sets for
  any implementation task. Each roadmap must contain:
  - Citations from `01_research` (Why).
  - Citations from `02_components` (or whichever component library applies) (How).
  - Explicit **Execution Targets** (target directories).
  - A checkable task list.
- **01_research:** Canonical source of truth for the "Why." Documentation only
  (`.md`, `.json`). No code. Any `.md` dropped here becomes a graph node
  automatically — no registration step.
- **02_components:** The default Sleipnir component library — one of
  potentially many registered libraries (`src/00_planning/graph/libraries.json`).
  Tiers: `00_themes/`, `01_atoms/`, `02_molecules/`, `03_organisms/`, `04_templates/`.
  - All reusable UI elements MUST reside in a registered component library.
  - MVVM pattern: `.view.tsx`, `.viewModel.ts`, `i*.tsx`. Enforced strictly
    here; `src/app/` (the application shell) follows it more loosely by
    precedent — see the root `ARCHITECTURE.md` §4/§11.
- **03_prototypes:** The default prototype library. Experimental prototypes
  built from a registered component library and driven by a roadmap in `00_planning`.
- **04_validation:** Vitest session execution logic and validation.
- **05_analytics:** Feedback loop. Results from test sessions are committed here.
- **06_source_control:** Source control UI. Local git status/diff/commit and
  push/pull/fetch — host-agnostic, works against whatever remote a project
  actually has. Outside the 00–05 pipeline sequence.

## 2. Core directives
- **Roadmap-First:** NO implementation is permitted without a corresponding
  plan in `src/00_planning/roadmaps/`.
- **Traceability:** Every prototype MUST reference a roadmap in `00_planning`.
- **Component library:** All reusable UI elements MUST reside in a registered
  component library, not ad hoc markup in a prototype.
- **MVVM pattern:** Follow `.view.tsx` / `.viewModel.ts` / `i*.tsx` separation
  for non-atomic components in a component library. ViewModels are React
  hooks colocated with their component.
- **Two protected libraries:** `dsm` (`02_components`) and `prototypes`
  (`03_prototypes`) cannot be deleted via the library registry.
- **Path containment:** Any filesystem operation must stay under its
  authorized root (`src/` or the repo root) — never construct a path that
  could escape it, matching `tools/sleipnir-backend.mjs`'s `resolveSafe()`
  guarantee.

## 3. Rules specific to Sleipnir's own AI agent (`electron/chat.cjs`)
These apply when *you are* (or are modifying) the in-app chat agent, not just
a human's coding assistant working on the repo:
- **`generate_code` never writes to disk.** It must always stage generated
  content for human review in an editor tab (`chat:codeGenerated` →
  `pendingOverride`) and stop there. Do not add a path that writes model
  output straight to the filesystem.
- **`create_library`/`create_plan_node`** only ever register metadata (a
  library entry, a graph node) — never file contents.
- **Never target the two protected libraries** (`dsm`, `prototypes`) for
  deletion.
- Prefer the least surprising provider behavior: respect
  `SLEIPNIR_MODEL_PROVIDER` if set, otherwise Anthropic-if-keyed else Ollama.

## 4. Workflow for agents
1. **Analyze:** Check `src/01_research/` for persona/mission context relevant
   to the task.
2. **Plan:** Create or update a roadmap in `src/00_planning/roadmaps/`,
   following `PLAN_TEMPLATE.md`.
3. **Build:** Use a registered component library (`02_components` by default)
   to build the feature/vibe in `03_prototypes` (or a registered prototype
   library).
4. **Validate:** Add/run tests in `04_validation` and log results to `05_analytics`.

---
*This file is the foundational mandate for all AI agents in this workspace —
human-directed or Sleipnir's own. See the root `ARCHITECTURE.md` for the full
technical picture behind these rules.*
