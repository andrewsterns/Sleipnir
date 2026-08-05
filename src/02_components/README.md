# 02_components: The Default Component Library

This is Sleipnir's default component library — one of potentially many
registered component libraries (see `../00_planning/graph/libraries.json` and
the root [`ARCHITECTURE.md`](../../ARCHITECTURE.md) §5). Every UI element used
in prototypes MUST come from a registered component library; this is the
default one.

It's browsed and edited through the app's Component Library view
(`src/app/DesignSystem/`), not from a folder inside this directory — that view
is the app's own tooling for browsing *any* registered library, this one
included.

## 1. Directory structure
- `00_themes/` — CSS variables and visual configuration (`default`, `dark`,
  `houseplant`, `tactical`), plus `colors/`, `fonts/`, and `default-icons/`.
- `01_atoms/` — Smallest functional units (`Frame`, `Icon`, `Logo`, `Text`, ...).
- `02_molecules/` — Simple groups of atoms (`Button`, `Dropdown`, `Tabs`, `Search`, ...).
- `03_organisms/` — Complex, composed components (`Header`, `List`, `StatusPanel`, ...).
- `04_templates/` — Page layouts without data.

## 2. Component mandate (MVVM)
Every molecule or organism MUST follow the MVVM pattern:
- `[Name].view.tsx` — UI and layout.
- `[Name].viewModel.ts` — Logic (a React hook).
- `[Name].model.ts` — Data interfaces/contracts.
- `[Name].stories.tsx` — Storybook-style documentation, where present.
- `[Name].test.tsx` — Unit tests.

Atoms may skip the ViewModel/model split when they hold no real logic, but
should still follow `[Name].tsx` + colocated styles/tests.

## 3. Adding a component
Use the in-app scaffolder (Component Library view → New Component) or
`npm run generate:mvvm -- <Name> <dir>`, then run `npm run generate:graph`
(or let the app trigger it) so the new component appears in the planning
graph.
