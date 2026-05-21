# Sleipnir: Numbered Execution Mandates

You are an agent operating in the **Sleipnir** environment. This workspace follows a **Linear Numbered Pipeline (00-05)** to bridge research and "vibe coding."

## 1. The 00-05 Execution Pipeline
- **Environment:** Docker is the **mandatory** execution environment for all development, testing, and building. All `nx` commands must be run via the `docker exec` bridge (e.g., `npm run docker:nx`).
- **00_research:** Canonical source of truth. Documentation Only (.md, .json). No code.
- **01_planning:** The "Roadmap Engine." **MANDATORY** Markdown (.md) instruction set for all tasks. Must contain:
  - Citations from `00_research` (Why).
  - Citations from `02_components` (How).
  - Explicit **Execution Targets** (Target Dirs).
  - Checkable task list.
- **02_components:** The "Singular Component Library." Atoms, Molecules, Assets, and **Themes**.
  - All UI elements MUST reside here.
  - MVVM pattern: `.view.tsx`, `.viewModel.ts`, and `.model.ts`.
- **03_prototypes:** The "Vibe Sandbox." Experimental prototypes built from 02 and driven by 01.
- **04_tests:** Session execution logic and validation.
- **05_analytics:** Feedback loop. Results from test sessions are committed here.

## 2. Core Directives
- **Roadmap-First:** NO implementation is permitted without a corresponding plan in `01_planning`.
- **Traceability:** Every prototype in `03` MUST reference a roadmap in `01`.
- **Atomic DSM:** All UI elements MUST reside in `02_components`.
- **MVVM Pattern:** Strictly follow the `.view.tsx`, `.viewModel.ts`, and `.model.ts` separation for all non-atomic components. ViewModels are React hooks located in the component directory.

## 3. Workflow for Agents
1. **Analyze:** Check `src/00_research/` for persona/mission context.
2. **Plan:** Update/Create a roadmap in `src/01_planning/`.
3. **Build:** Use `02_components` to build the vibe in `03_prototypes`.
4. **Validate:** Run test sessions in `04_tests` and log to `05_analytics`.

---
*This file is the foundational mandate for all AI agents in this workspace.*
