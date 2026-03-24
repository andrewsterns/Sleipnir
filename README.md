# Sleipnir Project

Welcome to the Sleipnir project! This project is organized as an Nx monorepo for maximum collaborative efficiency, research-driven design, and clear planning workflows.

## Key Directories
- `/src/research/` — Research data, analytics, personas, and research views
- `/src/prototypes/` — Interactive prototypes and user test modules
- `/src/dsm/` — Design System Master (component library, DSM UI)
- `/src/components/` — Shared UI components

## Nx Monorepo
- Nx is used for project management, code generation, and scaling
- Use `nx serve` to run the main app, `nx build` to build, and `nx test` for testing

## Getting Started
- Install dependencies: `npm install`
- Run the app: `nx serve` (or `npm start` for legacy setup)
- Build: `nx build`
- Test: `nx test`

## App Navigation
- Main menu (tabs or sidebar) with:
  - Research
  - Prototypes
  - DSM (Design System Master)

## Conventions
- MVVM: `.view`, `.viewModel`, `.model` file naming
- All planning and design should reference research data

## Next Steps
- Use the Research tab for research data and analytics
- Use the Prototypes tab for interactive prototypes
- Use the DSM tab for component library and design system documentation

---

For more, see the Nx documentation: https://nx.dev/getting-started/intro
