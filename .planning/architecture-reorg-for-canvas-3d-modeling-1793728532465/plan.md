<!-- sleipnir:plan — generated from .planning/notes.json. Write freely under the title and between a step's /step-meta and /step markers; everything else is regenerated. -->
# Architecture reorg for canvas + 3D modeling

Show Sleipnir's whole architecture in its own graph, keep startup light as 3D grows, drop the research/analytics pipeline, and replace numbered folders with named feature folders (planning, canvas, modeling, platform).
<!-- /plan-meta -->

<!-- steps -->

## 1. Show the whole architecture in the graph
<!-- step:plan/architecture-reorg-for-canvas-3d-modeling-1793728532465/show-the-whole-architecture-in-the-graph-1793728553135 -->
**Status:** Done — Cap 300 -> 1500 and spare budget goes to most-connected files; Sleipnir's 753 listed files now all draw (was 300 max, 0 with no focus)

Fixes missing nodes when Sleipnir opens itself: scopeArchitecture keeps at most 300 files (max=300) and folds the rest into depth-2 folder nodes; Sleipnir has ~470 code files plus docs/assets, so most of the graph collapses. Count only source files toward the cap, raise it (~1500), and with no plan focus show everything instead of folders. Moves: files drawn on Sleipnir ~300 -> all ~470.

**Edits**
- `src/00_planning/graph/architectureScope.ts`
- `src/00_planning/graph/composePlanView.ts`
- `src/00_planning/graph/architectureView.test.ts`
- `src/00_planning/PlanningView.ViewModel.tsx`
<!-- /step-meta:plan/architecture-reorg-for-canvas-3d-modeling-1793728532465/show-the-whole-architecture-in-the-graph-1793728553135 -->

<!-- /step:plan/architecture-reorg-for-canvas-3d-modeling-1793728532465/show-the-whole-architecture-in-the-graph-1793728553135 -->

## 2. Stop boot from waiting on every view chunk
<!-- step:plan/architecture-reorg-for-canvas-3d-modeling-1793728532465/stop-boot-from-waiting-on-every-view-chunk-1793728553388 -->
**Status:** Done — Boot no longer waits on view chunks (6 chunks, ~1.1MB -> 0); they warm one per idle moment; firstLoadBudget.test.ts keeps three/codemirror/xterm off the entry

main.tsx holds the boot screen on preloadViews(), which loads all six lazy chunks (FolderBrowser ~870KB, Terminal ~337KB, Canvas...) before first paint. Await only the first-shown view, warm the rest on idle, and keep three.js behind the lazy Viewport3D chunk. Add a test that fails if an eager module imports three/@react-three. Moves: chunks awaited at boot 6 -> 1.

**Files**
- `src/app/firstLoadBudget.test.ts` — node (typescript)

**Edits**
- `src/main.tsx`
- `src/app/lazyViews.ts`
- `src/boot.ts`
<!-- /step-meta:plan/architecture-reorg-for-canvas-3d-modeling-1793728532465/stop-boot-from-waiting-on-every-view-chunk-1793728553388 -->

<!-- /step:plan/architecture-reorg-for-canvas-3d-modeling-1793728532465/stop-boot-from-waiting-on-every-view-chunk-1793728553388 -->

## 3. Remove research, analytics and the empty components area
<!-- step:plan/architecture-reorg-for-canvas-3d-modeling-1793728532465/remove-research-analytics-and-the-empty-components-area-1793728553637 -->
**Status:** Done — Deleted 01_research, 05_analytics, empty 02_components, PortfolioStory and the Research Notes map (dead folders 3 -> 0); Canvas Docs pane kept as 01_canvas/panels/DocsPane.tsx

The research->analytics pipeline is abandoned: delete src/01_research (10 files), src/05_analytics (3, already hidden), and the empty src/02_components, and scrub their references (proposed-nodes research node, the 02_components default root in LeftRailingView and vite.config, App.tsx comment). Moves: dead feature folders 3 -> 0.

**Edits**
- `src/00_planning/graph/proposed-nodes.ts`
- `src/app/DesignSystem/LeftRailingView.tsx`
- `vite.config.ts`
- `src/App.tsx`
- `tools/sleipnir-backend.mjs`
<!-- /step-meta:plan/architecture-reorg-for-canvas-3d-modeling-1793728532465/remove-research-analytics-and-the-empty-components-area-1793728553637 -->

<!-- /step:plan/architecture-reorg-for-canvas-3d-modeling-1793728532465/remove-research-analytics-and-the-empty-components-area-1793728553637 -->

## 4. Move the platform API out of planning
<!-- step:plan/architecture-reorg-for-canvas-3d-modeling-1793728532465/move-the-platform-api-out-of-planning-1793728553852 -->
**Status:** Done — 00_planning/api -> src/platform; 66 files re-pointed, imports into planning/api from other features 46 -> 0 (platform keeps type-only imports of graph/types)

src/00_planning/api (PlatformAPI, sleipnirApi, electronApi, webApi, iPlanningWatch) is the app-wide transport, imported by 46 files outside planning — canvas, git, settings all reach into planning for it. Move it to src/platform/ and update imports. Moves: cross-feature imports into planning/api 46 -> 0.

**Edits**
- `src/00_planning/api/PlatformAPI.ts`
- `src/00_planning/api/sleipnirApi.ts`
- `src/00_planning/api/electronApi.ts`
- `src/00_planning/api/webApi.ts`
- `src/00_planning/api/iPlanningWatch.ts`
<!-- /step-meta:plan/architecture-reorg-for-canvas-3d-modeling-1793728532465/move-the-platform-api-out-of-planning-1793728553852 -->

<!-- /step:plan/architecture-reorg-for-canvas-3d-modeling-1793728532465/move-the-platform-api-out-of-planning-1793728553852 -->

## 5. Rename small numbered folders
<!-- step:plan/architecture-reorg-for-canvas-3d-modeling-1793728532465/rename-small-numbered-folders-1793728554129 -->
**Status:** Done — themes, keybindings, validation, source-control (numbered folders 6 -> 2); 59 files moved, imports and docs re-pointed

Drop numeric prefixes that no longer encode a pipeline: 00_themes -> themes, 00_keybindings -> keybindings, 04_validation -> validation, 06_source_control -> source-control. Update vite test.setupFiles, lazyViews, App.tsx and imports. Moves: numbered folders 8 -> 2.

**Edits**
- `vite.config.ts`
- `src/app/lazyViews.ts`
- `src/App.tsx`
- `src/main.tsx`
<!-- /step-meta:plan/architecture-reorg-for-canvas-3d-modeling-1793728532465/rename-small-numbered-folders-1793728554129 -->

<!-- /step:plan/architecture-reorg-for-canvas-3d-modeling-1793728532465/rename-small-numbered-folders-1793728554129 -->

## 6. Rename planning and canvas folders
<!-- step:plan/architecture-reorg-for-canvas-3d-modeling-1793728532465/rename-planning-and-canvas-folders-1793728554348 -->
**Status:** Done — 00_planning -> planning, 01_canvas -> canvas (237 files); numbered folders in src 2 -> 0, 1166 tests pass

00_planning -> planning and 01_canvas -> canvas, the two big ones (~250 files), done alone so the diff is pure moves plus import paths. Update planning-path tests, vite watch ignores, skill/command docs that name the paths. Moves: numbered folders 2 -> 0.

**Edits**
- `vite.config.ts`
- `src/App.tsx`
- `src/app/lazyViews.ts`
- `src/main.tsx`
- `src/00_planning/api/planningPaths.test.ts`
<!-- /step-meta:plan/architecture-reorg-for-canvas-3d-modeling-1793728532465/rename-planning-and-canvas-folders-1793728554348 -->

<!-- /step:plan/architecture-reorg-for-canvas-3d-modeling-1793728532465/rename-planning-and-canvas-folders-1793728554348 -->

## 7. Lift the document model into src/document
<!-- step:plan/architecture-reorg-for-canvas-3d-modeling-1793728532465/lift-the-document-model-into-src-document-1793737318384 -->
**Status:** Done — 53 files to src/document (incl. sceneTypes, frontView, placement), board IO to canvas/io; document imports from canvas/3D 3 -> 0 (only planning's language table remains)

Plan A, part 1: the scene document (types, objects, doc, paint, paths, vector, variants, ... plus scene3d/sceneTypes and frontView, which the document itself needs) moves from canvas/model to src/document, shared by the 2D canvas and 3D modeling. Board persistence and clipboard (store, stagedFiles, stagingTsconfig, clipboard, clipboardImage) stay in canvas as canvas/io. Moves: model files that import scene3d 3 -> 0.

**Edits**
- `src/canvas/model/types.ts`
- `src/canvas/model/objects.ts`
- `src/canvas/model/doc.ts`
- `src/canvas/scene3d/sceneTypes.ts`
- `src/canvas/scene3d/frontView.ts`
- `src/canvas/model/store.ts`
<!-- /step-meta:plan/architecture-reorg-for-canvas-3d-modeling-1793728532465/lift-the-document-model-into-src-document-1793737318384 -->

<!-- /step:plan/architecture-reorg-for-canvas-3d-modeling-1793728532465/lift-the-document-model-into-src-document-1793737318384 -->

## 8. Split 3D modeling into its own feature
<!-- step:plan/architecture-reorg-for-canvas-3d-modeling-1793728532465/split-3d-modeling-into-its-own-feature-1793728554536 -->
**Status:** Done — scene3d, geometry, viewport -> src/modeling (21 files); modeling imports only document + utils (modeling -> canvas 0, canvas -> modeling one-way); shared CLICK_DRAG_THRESHOLD in utils/pointer.ts

**Comments**
- someone: Paused before moving anything: the 3D code is part of the canvas document, not beside it. model/types.ts, objects.ts and doc.ts import scene3d (Placement3D, SolidSpec, frontView), and board/ and panels/ draw and edit solids — 11 canvas files import scene3d, and scene3d imports canvas/model 30+ times. Moving scene3d/geometry/viewport to src/modeling as-is would create a canvas <-> modeling folder cycle (0 -> 1). three.js is already only in viewport/ and loads lazily. Options: (A) lift canvas/model into a shared src/document that both canvas (2D board) and modeling (3D) use, then move the 3D folders; (B) group them under canvas/modeling/ inside the same feature. Needs a decision.
- someone: Going with option A (user, 2026-11-03): src/document first (new step before this one), then this step moves scene3d, geometry and viewport to src/modeling, importing only document. Target: modeling -> canvas imports 0.

Lift scene3d, viewport and geometry out of canvas into src/modeling/ (with room for rendering/lighting next to it), so the 2D board and the 3D modeler grow apart and only modeling pulls in three.js. canvas/model/types.ts (fan-in 87) stays the shared document types. Moves: three.js importers inside canvas -> 0.

**Edits**
- `src/01_canvas/viewport/Viewport3D.tsx`
- `src/01_canvas/scene3d/sceneTypes.ts`
- `src/01_canvas/scene3d/sceneMeshes.ts`
- `src/01_canvas/geometry/body.ts`
- `src/01_canvas/CanvasView.tsx`
<!-- /step-meta:plan/architecture-reorg-for-canvas-3d-modeling-1793728532465/split-3d-modeling-into-its-own-feature-1793728554536 -->

<!-- /step:plan/architecture-reorg-for-canvas-3d-modeling-1793728532465/split-3d-modeling-into-its-own-feature-1793728554536 -->

## 9. Split the canvas view model by mode
<!-- step:plan/architecture-reorg-for-canvas-3d-modeling-1793728532465/split-the-canvas-view-model-by-mode-1793728554721 -->
**Status:** Done — CanvasView.ViewModel 3716 -> 878 lines: 7 hooks (pointer, path editing, layer commands, components, clipboard, 3D tools, shortcuts) + boardEditing.ts; fan-out 36 -> 33 (target 12 not met), fan-in 5 -> 1

CanvasView.ViewModel.tsx is 3717 lines importing 36 files; every 2D and 3D feature lands there. Split into a thin coordinator plus board (2D) and modeling (3D) view models. Moves: largest file 3717 -> under 1200 lines, fan-out 36 -> ~12.

**Edits**
- `src/01_canvas/CanvasView.ViewModel.tsx`
- `src/01_canvas/CanvasView.tsx`
<!-- /step-meta:plan/architecture-reorg-for-canvas-3d-modeling-1793728532465/split-the-canvas-view-model-by-mode-1793728554721 -->

<!-- /step:plan/architecture-reorg-for-canvas-3d-modeling-1793728532465/split-the-canvas-view-model-by-mode-1793728554721 -->

## 10. Rewrite the architecture docs for the new layout
<!-- step:plan/architecture-reorg-for-canvas-3d-modeling-1793728532465/rewrite-the-architecture-docs-for-the-new-layout-1793728554953 -->
**Status:** Done — ARCHITECTURE.md (feature folders + load rules), README, AGENT.md, .agent/*, folder READMEs rewritten; stale pipeline mentions in docs ~45 -> 0; dropped now-unused utils/useFilteredList.ts

ARCHITECTURE.md still describes the numbered research->analytics pipeline. Rewrite it around the feature folders (planning, canvas, modeling, source-control, platform, app shell) and the load rules from step 2; update canvas LAYOUT.md and ROADMAP.

**Edits**
- `ARCHITECTURE.md`
- `ROADMAP.md`
- `src/01_canvas/LAYOUT.md`
- `README.md`
<!-- /step-meta:plan/architecture-reorg-for-canvas-3d-modeling-1793728532465/rewrite-the-architecture-docs-for-the-new-layout-1793728554953 -->

<!-- /step:plan/architecture-reorg-for-canvas-3d-modeling-1793728532465/rewrite-the-architecture-docs-for-the-new-layout-1793728554953 -->
