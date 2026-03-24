# Sleipnir: Numbered Execution Mandates

You are an agent operating in the **Sleipnir** environment. This workspace follows a **Linear Numbered Pipeline (00-05)** to bridge research and "vibe coding."

## 1. The 00-05 Execution Pipeline
- **Environment:** Docker is the **mandatory** execution environment for all development, testing, and building. All `nx` commands must be run via the `docker exec` bridge (e.g., `npm run docker:nx`).
- **00_research:** Canonical source of truth. Documentation Only (.md, .json). No code.
- **01_planning:** The "Live Roadmap." Vibe-code plans and feature roadmaps with references to 00.
- **02_components:** The "Singular Component Library." Atoms, Molecules, and 2D/3D Assets. Includes the DSM showcase.
- **03_prototypes:** The "Vibe Sandbox." Experimental prototypes built from 02 and driven by 01.
- **04_tests:** Session execution logic and validation.
- **05_analytics:** Feedback loop. Results from test sessions are committed here.

## 2. Core Directives
- **.agent/ vs Roadmaps:** Root `.agent/` contains the Constitution and System Map. `src/01_planning/` contains the Execution Roadmap.
- **Traceability:** Every prototype in `03` MUST reference a roadmap in `01`.
- **Atomic DSM:** All UI elements MUST reside in `02_components`.
- **MVVM Pattern:** Strictly follow the `.view.tsx`, `.viewModel.ts`, and `.model.ts` separation for all non-atomic components.

## 3. Workflow for Agents
1. **Analyze:** Check `src/00_research/` for persona/mission context.
2. **Plan:** Update/Create a roadmap in `src/01_planning/`.
3. **Build:** Use `02_components` to build the vibe in `03_prototypes`.
4. **Validate:** Run test sessions in `04_tests` and log to `05_analytics`.

---
*This file is the foundational mandate for all AI agents in this workspace.*
