# planning: Roadmap Engine + Live Registries

All execution in Sleipnir MUST start here. A roadmap is a Markdown file that
defines the **Why**, the **What**, and the **How** before any code is written.
This directory also hosts the app's one live registry — the planning graph.
(A library/widget registry that would make Components and Prototypes
extensible beyond their default folders was designed but never built — see
`ARCHITECTURE.md` §5–6 for what that would take.) See the root
[`ARCHITECTURE.md`](../../ARCHITECTURE.md) (§7–§8) for the planning-graph and
AI-agent technical picture; this file covers just what lives in
`planning/` itself.

## 1. Roadmap mandates
- **Markdown only:** All plans are `.md` files under `roadmaps/`. No logic, no code.
- **Citations:** Every plan cites what it is for (the "Why") and the files it touches (the "How").
- **Execution Targets:** Plans must explicitly list which directories will be modified.
- **Task list:** Every roadmap must contain a `- [ ]` checklist of actionable tasks.
- Start from `PLAN_TEMPLATE.md`. Completed roadmaps move to `archive/` (read-only).

## 2. The planning graph
`graph/types.ts` defines `GraphNode`/`GraphEdge`/`GraphMapId`. Each registered
library gets its own map/tab, generated from the real source tree by
`tools/generate-graph.mjs` into `graph/generated/*.json`, assembled at
build/runtime by `graph/combine.ts`, and rendered as a force-directed graph by
`graph/GraphCanvas.tsx` (layout math in `graph/layout.ts`). A few maps have no
generated JSON and are populated purely at runtime: `claude` (nodes the AI
agent creates via its `create_plan_node` tool), `todo`, and `open` (files
opened via the File menu that have no other graph presence). `graph/notes.json`
persists the runtime-created `claude`/note nodes; `graph/proposed-nodes.ts`
holds hand-authored aspirational nodes merged into every map.

## 3–4. Library/widget registry — not implemented
Neither exists today: there is no library registry, widget system or Widget
Store. `src/App.tsx`'s `NAV_ITEMS` is a hardcoded array. See `../../ARCHITECTURE.md` §5–6 for what was designed and what
building it for real would take.

## 5. PlatformAPI
Lives in `src/platform/` now, since every feature uses it: `PlatformAPI.ts`
declares the one interface every filesystem/graph/git operation goes through;
`electronApi.ts` and `webApi.ts` implement it against IPC and `fetch`, and
`sleipnirApi.ts` is the single import surface the rest of the app uses. See
`../../ARCHITECTURE.md` §1.

## 6. Directory structure
- `roadmaps/` — Specific feature/theme/test plans.
- `archive/` — Completed roadmaps, read-only.
- `PLAN_TEMPLATE.md` — The blueprint for all new plans.
- `graph/` — Planning graph data/rendering (types, generated JSON, canvas,
  layout, `notes.json`/`proposed-nodes.ts`).
- `PlanningView.tsx` / `.ViewModel.tsx` — The Planning page: roadmaps, the
  graph canvas, and the per-library/doc tabs (including the `claude` tab
  where the AI agent's own plan nodes land).
- `scaffoldOptions.ts` — Tier/language/part options for the component
  scaffolder (`scaffoldComponent`, wired through `PlatformAPI`).

## 7. Standard workflow
1. Create a new roadmap from `PLAN_TEMPLATE.md`.
2. Map out the files it changes.
3. Execute the tasks sequentially, checking them off as you go.
