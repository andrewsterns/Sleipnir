# Nx Integration Guide for Sleipnir

## Overview
Sleipnir now uses Nx as a monorepo tool for scalable, modular development. This enables:
- Unified development for research, prototypes, and DSM
- Easy scaling to multiple apps or libraries
- Powerful code generation, testing, and dependency graph tools

## Key Nx Commands
- `nx serve` — Run the main application
- `nx build` — Build the application
- `nx test` — Run tests
- `nx generate` — Generate new components, libraries, or apps

## Structure
- All main features are under `/src/` as modules
- Nx config files: `nx.json`, `workspace.json` or `project.json`
- Future apps or libraries can be added under `/apps/` or `/libs/` as needed

## Migration Notes
- Existing code remains in `/src/` for now
- You can incrementally migrate features to `/apps/` or `/libs/` if desired
- Nx supports Vite, React, Storybook, and more

## Resources
- [Nx Documentation](https://nx.dev/getting-started/intro)
- [Nx React Guide](https://nx.dev/recipes/react)

---

*This guide will be updated as Sleipnir evolves with Nx.*
