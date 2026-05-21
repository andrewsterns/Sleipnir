# 01_Planning: The Roadmap Engine

All execution in Sleipnir MUST start here. A roadmap is a Markdown file that defines the **Why**, the **What**, and the **How** before any code is written.

## 1. Roadmap Mandates
- **Markdown Only:** All plans are `.md` files. No logic, no code.
- **Citations:** Every plan must cite a source from `00_research` (for the "Why") and `02_components` (for the "How").
- **Execution Targets:** Plans must explicitly list which directories will be modified (e.g., `src/02_components/atoms/Button/`, `src/03_prototypes/Demo/`).
- **Task List:** Every roadmap must contain a `- [ ]` checklist of actionable tasks.

## 2. Standard Workflow
1. Create a new roadmap using `PLAN_TEMPLATE.md`.
2. Link research from `00_research/`.
3. Map out component changes in `02_components/`.
4. Define the experimental sandbox in `03_prototypes/`.
5. Execute the tasks sequentially.

## 3. Directory Structure
- `roadmaps/` — Specific feature/theme/test plans.
- `PLAN_TEMPLATE.md` — The blueprint for all new plans.
