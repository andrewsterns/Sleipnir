
# Sleipnir Project

## 🚀 First-Time Setup Instructions

### Prerequisites
- **Node.js** (v18+ recommended): https://nodejs.org/
- **Docker Desktop**: https://www.docker.com/products/docker-desktop/
- **Nx CLI** (global, optional but recommended):
  ```sh
  npm install -g nx
  ```

### 1. Clone the Repository
```sh
git clone <repo-url>
cd Sleipnir
```

### 2. Install Dependencies
```sh
npm install
```

### 3. Start Docker (Required for all development)
- Make sure Docker Desktop is running before any Nx or npm commands.
- All Nx commands are run inside Docker containers for consistency.

### 4. Run the App
```sh
npm run docker:up         # Start Docker containers
npm run docker:nx serve   # Serve the app via Docker/Nx
```

### 5. Run Tests
```sh
npm run docker:test
```

### 6. Stop Docker Containers
```sh
npm run docker:down
```

---

For more, see the Nx documentation: https://nx.dev/getting-started/intro

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
