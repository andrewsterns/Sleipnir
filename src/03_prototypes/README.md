# 03_Prototypes: The Vibe Sandbox

This is the **experimental engine** of Sleipnir. Every prototype here is a "Mission" that tests a specific design theory or research hypothesis.

## 1. Directory Structure
- `[Name]Prototype/` — A self-contained sandbox for testing a concept.
- `Prototypes.tsx` — The main index view for all active prototypes.

## 2. Mandatory Workflow
1. Every prototype MUST cite a roadmap in `src/01_planning/`.
2. UI components used here MUST be pulled from `src/02_components/`.
3. Once a "vibe" is confirmed, it is either archived or its logic is refactored into `02_components` as a permanent atom/molecule.
