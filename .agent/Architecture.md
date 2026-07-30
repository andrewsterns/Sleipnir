# .agent: Sleipnir Meta-Architecture

This directory contains the **Constitution of Sleipnir**. It defines the rules, stack, and pipeline that all agents MUST follow.

## 1. The Constitution
- **`Architecture.md`**: The technical map and directory hierarchy.
- **`README.md`**: General project orientation for new agents.
- **`RULES.md`**: The foundational AI instructions (replaces GEMINI.md).

## 2. Pipeline Enforcement (00-05)
The mandates here enforce the following linear flow in `src/`:
- **00_research**: The "Why" (Documentation Only).
- **01_planning**: The "Intent" (Roadmaps).
- **02_components**: The "How" (Atoms/Molecules/Assets).
- **03_prototypes**: The "Sandbox" (Vibe Coding).
- **04_tests**: The "Validation" (Session Logic).
- **05_analytics**: The "Feedback" (Results).

## 3. Agent Rules
- Never move code into `00_research`.
- Never start building in `03_prototypes` without a roadmap in `01_planning`.
- All UI must be built as components in `02_components` first.
