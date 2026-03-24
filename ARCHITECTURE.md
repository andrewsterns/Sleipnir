# Project Architecture: Numbered Pipeline

Sleipnir is organized as a linear execution pipeline to ensure "vibe coding" is always research-grounded.

## Directory Structure
- `workflow/` — **Meta-Architecture**. Conventions, rules, and system mandates.
- `src/00_research/` — **Research Documentation**. Personas, proposals, and journey maps.
- `src/01_planning/` — **Execution Roadmaps**. Detailed plans for current prototype sprints.
- `src/02_components/` — **Atomic Component Library**. Includes atoms, molecules, and assets.
- `src/03_prototypes/` — **Interactive Sandbox**. Consolidated area for all experimental prototypes.
- `src/04_tests/` — **Session Validation**. Logic for running and verifying prototype tests.
- `src/05_analytics/` — **Result Data**. Output from testing sessions for further research.

## Key Boundaries
1. **00 is Docs Only:** No logic in research.
2. **01 is the Trigger:** Implementation only starts after a roadmap is defined in `01_planning`.
3. **02 is the Source:** All UI elements in prototypes must come from the `02_components` library.

## Getting Started
- `npm install`
- `nx serve`
- `nx test`
