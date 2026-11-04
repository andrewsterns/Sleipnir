# validation: Session Validation

This directory contains the logic for **verifying and validating** the
success of prototypes, and the Vitest configuration for the whole workspace.

## 1. Directory structure
- `[Name].test.tsx` — Integration or unit tests for specific prototypes,
  components, or app-shell logic (Vitest + Testing Library discovers these
  anywhere under `src/`, not only here).
- `setup.ts` — Global test setup, wired in as `test.setupFiles` in
  `vite.config.ts` (jsdom environment).

## 2. Running tests
```sh
npm test        # vitest, watch mode
npm run test:ui  # vitest UI
npm run test:run # single run (CI-style)
```

## 3. Validation mandate
Every change keeps `npm run test:run` and `npx tsc -b` green.
