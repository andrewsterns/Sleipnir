# 00_planning: Roadmap Engine + Live Registries

All execution in Sleipnir MUST start here. A roadmap is a Markdown file that
defines the **Why**, the **What**, and the **How** before any code is written.
This directory also hosts the app's live registries — the planning graph, the
component/prototype library registry, and the widget registry — that make
Components and Prototypes extensible beyond their default folders. See the
root [`ARCHITECTURE.md`](../../ARCHITECTURE.md) (§5–§8) for the full technical
picture; this file covers just what lives in `00_planning/` itself.

## 1. Roadmap mandates
- **Markdown only:** All plans are `.md` files under `roadmaps/`. No logic, no code.
- **Citations:** Every plan must cite a source from `01_research` (for the "Why") and the component library it touches (for the "How").
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

## 3. Library registry
`graph/libraries.json` (backed by `tools/library-registry.mjs`) lists every
registered component or prototype library — `dsm` (`../02_components`) and
`prototypes` (`../03_prototypes`) are seeded and protected from deletion.
Create one via `CreateLibraryModal` (name, kind, architecture, language);
remove one from Planning without deleting files via the library dropdown, or
permanently via `DeleteLibraryModal` (type-to-confirm). See
`../../ARCHITECTURE.md` §5.

## 4. Widget registry
`graph/widgets.json` (installed) and `graph/widget-catalog.json` (browsable
catalog) back the widget system — folder-browser entries that appear as their
own nav-rail icon, one level above libraries. Install via *File → Open
Folder…* (`OpenFolderModal.tsx`) or the Widget Store
(`WidgetStore.view.tsx`/`.ViewModel.tsx`). See `../../ARCHITECTURE.md` §6.

## 5. PlatformAPI
`api/PlatformAPI.ts` declares the one interface every filesystem/graph/git/
refactor operation goes through; `api/electronApi.ts` and `api/webApi.ts`
implement it against IPC and `fetch` respectively, and `api/sleipnirApi.ts`
is the single import surface the rest of the app uses (`getPlatformAPI()`
picks the right one at call time). See `../../ARCHITECTURE.md` §1.

## 6. Directory structure
- `roadmaps/` — Specific feature/theme/test plans.
- `archive/` — Completed roadmaps, read-only.
- `PLAN_TEMPLATE.md` — The blueprint for all new plans.
- `graph/` — Planning graph data/rendering, library registry, widget registry.
- `api/` — The `PlatformAPI` dual-transport abstraction.
- `PlanningView.tsx` / `.ViewModel.tsx` — The Planning page: roadmaps, the
  graph canvas, and the per-library/doc tabs (including the `claude` tab
  where the AI agent's own plan nodes land).
- `CreateLibraryModal.*`, `DeleteLibraryModal.*`, `OpenFolderModal.*`,
  `WidgetStore.*` — The registry UIs described above.
- `scaffoldOptions.ts` — Tier/language/part options for the component
  scaffolder (`scaffoldComponent`, wired through `PlatformAPI`).

## 7. Standard workflow
1. Create a new roadmap from `PLAN_TEMPLATE.md`.
2. Link research from `01_research/`.
3. Map out component changes in the target component library.
4. Define the experimental sandbox in a prototype library.
5. Execute the tasks sequentially, checking them off as you go.
