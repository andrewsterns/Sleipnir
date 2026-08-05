# Nx Integration Guide for Sleipnir

## Current state

Sleipnir is Nx-managed but is currently a **single-project workspace** — `nx.json`
and `project.json` wrap the existing npm/Vite/Vitest/ESLint commands rather than
splitting the app into multiple Nx projects. There's no `apps/`/`libs/` split
today; all source stays under `src/`.

`project.json` targets:

| Target | Command |
| --- | --- |
| `nx build` | `npm run build` (`tsc -b && vite build`) |
| `nx dev` / `nx start` / `nx serve` | `vite` |
| `nx preview` | `vite preview` |
| `nx test` | `vitest run` |
| `nx test:watch` | `vitest` |
| `nx lint` | `eslint .` |

`nx.json` registers two inferred-target plugins instead of hand-listing every
target twice:
- `@nx/vite/plugin` — infers `build`/`preview`/`test`/`serve`/`serve-static`
  from `vite.config.ts`
- `@nx/eslint/plugin` — infers `lint` from `eslint.config.js`

Both of these overlap with the explicit targets in `project.json` above; the
explicit ones win. Nx's build cache (`targetDefaults` in `nx.json`) applies to
`build`.

## Running it

```sh
npx nx serve sleipnir   # same as `npm run dev`
npx nx build sleipnir
npx nx test sleipnir
npx nx lint sleipnir
```

Or via the Docker dev container: `npm run docker:nx <target>` (see the root
[README.md](README.md) for the current port caveat with Docker).

## Migration notes

If this grows into a true multi-project workspace (e.g. splitting a
registered component library or the `tools/` backend into its own Nx
project), keep in mind that `tools/sleipnir-backend.mjs` is imported directly
(via dynamic `import()`) by both `electron/main.cjs` and `vite.config.ts` —
any restructuring needs to preserve that import path or update both call
sites together.

## Resources
- [Nx Documentation](https://nx.dev/getting-started/intro)
- [Nx React Guide](https://nx.dev/recipes/react)
- [Nx Vite Plugin](https://nx.dev/nx-api/vite)
