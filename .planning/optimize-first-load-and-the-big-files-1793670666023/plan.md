<!-- sleipnir:plan — generated from .planning/notes.json. Write freely under the title and between a step's /step-meta and /step markers; everything else is regenerated. -->
# Optimize: first load and the big files

From the 2026-11-02 architecture report: keep CodeMirror off the first load, then cut the three god/orchestrator files down along their own section seams, move a misplaced file and drop dead ones. The two import cycles are optimizeLab fixtures and are left alone on purpose.
<!-- /plan-meta -->

<!-- steps -->

## 1. Keep CodeMirror off the first load
<!-- step:plan/optimize-first-load-and-the-big-files-1793670666023/keep-codemirror-off-the-first-load-1793670682157 -->
**Status:** Done — Diff highlighter loads on demand: heavy eager 1 → 0, first-load JS 1,034 → 710 kB (gzip 332 → 226 kB)

Planning is on screen at launch, and App → PlanningView → ActivityPanel → DiffView → diffHighlight → codeEditorTheme pulls @codemirror/view (and language) into the first chunk; AgentChat's ToolActivityRow does the same. Load DiffView's highlighter on demand (dynamic import of diffHighlight inside DiffView, plain text until it resolves) so diffs only fetch CodeMirror when one is opened. Moves: heavy packages loaded eagerly 1 → 0; first-load JS should drop by CodeMirror's size (measure with vite build before/after).

**Edits**
- `src/06_source_control/DiffView.tsx`
- `src/06_source_control/diffHighlight.ts`
- `src/00_planning/ActivityPanel.tsx`
- `src/app/AgentChat/ToolActivityRow.tsx`
<!-- /step-meta:plan/optimize-first-load-and-the-big-files-1793670666023/keep-codemirror-off-the-first-load-1793670682157 -->

<!-- /step:plan/optimize-first-load-and-the-big-files-1793670666023/keep-codemirror-off-the-first-load-1793670682157 -->

## 2. Split the backend along its seams
<!-- step:plan/optimize-first-load-and-the-big-files-1793670666023/split-the-backend-along-its-seams-1793670682278 -->
**Status:** Done — Split into 5 tools/backend modules behind the facade: 2435 -> 652 lines, hotspot 212 -> 110; facade kept by choice (barrel +1, misplaced +1)

**Comments**
- claude: Split done into tools/backend/{paths,agentScaffolding,planningStore,stepReports,planSteps}.mjs; exports and function bodies identical, 1117 tests pass. Backend 2435 -> 652 lines, hotspot 212 -> 110. But god files stay 3 (facade still in 13 / out 10) and two new flags: barrels 0 -> 1 (the facade), misplaced 6 -> 7 (agentSkills/scaffold.mjs now mostly talks to tools/backend). Paused for a decision: keep the facade, or point the 13 importers at the modules directly.

tools/sleipnir-backend.mjs is the top hotspot (score 212, 2435 lines, 77 exports, in 13, out 10, 11 changes) and a god file. It already has three marked sections: agent scaffolding, architecture-aware plan steps, agents reporting progress. Move each into its own module and keep sleipnir-backend.mjs as the thin re-export its 13 importers (vite.config.ts, sleipnir-plan.mjs, tests) already use, so no caller changes. Moves: backend 2435 → ~900 lines, god files 3 → 2, hotspot score down as churn spreads.

**Files**
- `tools/backend/agentScaffolding.mjs` — node (javascript)
- `tools/backend/planSteps.mjs` — node (javascript)
- `tools/backend/stepReports.mjs` — node (javascript)

**Edits**
- `tools/sleipnir-backend.mjs`
<!-- /step-meta:plan/optimize-first-load-and-the-big-files-1793670666023/split-the-backend-along-its-seams-1793670682278 -->

<!-- /step:plan/optimize-first-load-and-the-big-files-1793670666023/split-the-backend-along-its-seams-1793670682278 -->

## 3. Pull boards, pen and pointer out of the canvas ViewModel
<!-- step:plan/optimize-first-load-and-the-big-files-1793670666023/pull-boards-pen-and-pointer-out-of-the-canvas-viewmodel-1793670682472 -->
**Status:** Done — Board persistence -> hooks/useCanvasBoards.ts: ViewModel 3909 -> 3463 lines, out 30 -> 27; pen/pointer left in (too coupled)

**Comments**
- claude: Did boards only. Measured the coupling first: pointer handling uses 36 of the ViewModel's names and pen/point editing exposes 26, so extracting them would only move lines behind a 36-field interface. Board persistence (in 9, out 9) moved to hooks/useCanvasBoards.ts verbatim.

src/01_canvas/CanvasView.ViewModel.tsx is 3909 lines with out 30. Its own section markers give the seams: board list/load/autosave/staged files/external change (≈ lines 583-997), pen + point editing (≈1020-1305), pointer interaction (≈1306-2142). Extract each into a hook in src/01_canvas/hooks/ beside usePanZoom; the ViewModel composes them. Also cuts re-render scope: pen and pointer state stop living beside board persistence. Moves: ViewModel 3909 → <1500 lines, out 30 → ~15.

**Files**
- `src/01_canvas/hooks/useCanvasBoards.ts` — view-model (typescript)
- `src/01_canvas/hooks/useCanvasPen.ts` — view-model (typescript)
- `src/01_canvas/hooks/useCanvasPointer.ts` — view-model (typescript)

**Edits**
- `src/01_canvas/CanvasView.ViewModel.tsx`
- `src/01_canvas/CanvasView.test.tsx`
<!-- /step-meta:plan/optimize-first-load-and-the-big-files-1793670666023/pull-boards-pen-and-pointer-out-of-the-canvas-viewmodel-1793670682472 -->

<!-- /step:plan/optimize-first-load-and-the-big-files-1793670666023/pull-boards-pen-and-pointer-out-of-the-canvas-viewmodel-1793670682472 -->

## 4. Move activityLog next to its users
<!-- step:plan/optimize-first-load-and-the-big-files-1793670666023/move-activitylog-next-to-its-users-1793670682662 -->
**Status:** Done — Moved to src/00_planning/activityLog.ts (+test), 6 importers updated: misplaced 7 -> 5 (emit/react.ts cleared too, by the boards hook)

src/00_planning/graph/activityLog.ts is imported only by src/00_planning/* panels (100% of its connections) and imports only graph/types. Move it (and its test) to src/00_planning/activityLog.ts and update the 6 importers. Moves: possibly misplaced 6 → 5.

**Edits**
- `src/00_planning/graph/activityLog.ts`
- `src/00_planning/graph/activityLog.test.ts`
- `src/00_planning/ActivityPanel.ViewModel.tsx`
- `src/00_planning/ActivityPanel.tsx`
- `src/00_planning/PlanStepsList.ViewModel.tsx`
- `src/00_planning/PlanningView.ViewModel.tsx`
- `src/00_planning/PlanningView.tsx`
- `src/00_planning/TrailInsightsPanel.tsx`
<!-- /step-meta:plan/optimize-first-load-and-the-big-files-1793670666023/move-activitylog-next-to-its-users-1793670682662 -->

<!-- /step:plan/optimize-first-load-and-the-big-files-1793670666023/move-activitylog-next-to-its-users-1793670682662 -->

## 5. Move schemaAdapters into chatProviders
<!-- step:plan/optimize-first-load-and-the-big-files-1793670666023/move-schemaadapters-into-chatproviders-1793670682835 -->
**Status:** Done — Moved to electron/chatProviders/ (+test), 5 requires updated: misplaced 5 -> 4

electron/agent/schemaAdapters.cjs is used by the four electron/chatProviders/* files (80% of its connections) plus chat.cjs. Move it and its test into electron/chatProviders/. Moves: possibly misplaced 5 → 4.

**Edits**
- `electron/agent/schemaAdapters.cjs`
- `electron/agent/schemaAdapters.test.ts`
- `electron/chat.cjs`
- `electron/chatProviders/anthropic.cjs`
- `electron/chatProviders/gemini.cjs`
- `electron/chatProviders/ollama.cjs`
- `electron/chatProviders/openai.cjs`
<!-- /step-meta:plan/optimize-first-load-and-the-big-files-1793670666023/move-schemaadapters-into-chatproviders-1793670682835 -->

<!-- /step:plan/optimize-first-load-and-the-big-files-1793670666023/move-schemaadapters-into-chatproviders-1793670682835 -->

## 6. Delete the two dead source files
<!-- step:plan/optimize-first-load-and-the-big-files-1793670666023/delete-the-two-dead-source-files-1793670683011 -->
**Status:** Done — Deleted CanvasComponentsPanel.tsx and treeSelection.ts: unreferenced 4 -> 2 (the rest are optimizeLab fixtures)

Nothing imports src/01_canvas/panels/CanvasComponentsPanel.tsx or src/app/DesignSystem/treeSelection.ts (checked with grep across src, electron and tools). Delete both. The other two unreferenced files are optimizeLab fixtures and stay. Moves: unreferenced 4 → 2.

**Edits**
- `src/01_canvas/panels/CanvasComponentsPanel.tsx`
- `src/app/DesignSystem/treeSelection.ts`
<!-- /step-meta:plan/optimize-first-load-and-the-big-files-1793670666023/delete-the-two-dead-source-files-1793670683011 -->

<!-- /step:plan/optimize-first-load-and-the-big-files-1793670666023/delete-the-two-dead-source-files-1793670683011 -->
