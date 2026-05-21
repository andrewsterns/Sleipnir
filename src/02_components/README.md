# 02_Components: The Singular Component Library

This is the **Atomic Design System Master (DSM)**. Every UI element used in prototypes MUST be defined here first.

## 1. Directory Structure
- `atoms/` — Smallest functional units (Buttons, Inputs, Icons).
- `molecules/` — Simple groups of atoms (Counter, SearchBar).
- `organisms/` — Complex components (Header, Sidebar).
- `templates/` — Page layouts without data.
- `themes/` — CSS Variables and visual configuration (IBCS, Dark, Light).
- `assets/` — 2D/3D assets, logos, and textures.
- `showcase/` — The DSM View for browsing the library.

## 2. Component Mandate (MVVM)
Every molecule or organism MUST follow the MVVM pattern:
- `[Name].view.tsx` — UI and layout.
- `[Name].viewModel.ts` — Logic (React Hook).
- `[Name].model.ts` — Data interfaces/contracts.
- `[Name].stories.tsx` — Storybook documentation.
- `[Name].test.tsx` — Unit tests.
