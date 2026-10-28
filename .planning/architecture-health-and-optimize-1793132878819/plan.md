<!-- sleipnir:plan — generated from .planning/notes.json. Write freely under the title and between a step's /step-meta and /step markers; everything else is regenerated. -->
# Architecture health and optimize
<!-- /plan-meta -->

<!-- steps -->

## 1. Graph metrics core
<!-- step:plan/architecture-health-and-optimize-1793132878819/graph-metrics-core-1793132878892 -->
One dependency-free module (node builtins only) that turns {files, import edges} into the numbers everything else uses: fan-in and fan-out per file, instability (fan-out / (fan-in + fan-out)), cycles via strongly connected components, dead files (no importers, not an entry point), hubs, clusters (label propagation), churn-weighted hotspots, and reverse reachability for blast radius. Also a lightweight scanner (TS/JS, Python, Go, Rust imports) so it can run without the app. Vendored beside the other CLIs so the app, the in-app agent and terminal agents all compute identical results; the AI never estimates a number.

**Files**
- `tools/agentSkills/vendor/analyze.mjs` — node (react)
- `tools/agentSkills/vendor/analyze.test.ts` — node (typescript)
<!-- /step-meta:plan/architecture-health-and-optimize-1793132878819/graph-metrics-core-1793132878892 -->

<!-- /step:plan/architecture-health-and-optimize-1793132878819/graph-metrics-core-1793132878892 -->

## 2. Metrics on the Planning graph
<!-- step:plan/architecture-health-and-optimize-1793132878819/metrics-on-the-planning-graph-1793132878985 -->
Feed the edges Sleipnir already detects (importAdapters/detectEdges) through the metrics core, memoized per graph so a re-scan only recomputes what changed. Adds fan-in/fan-out, cycle membership and dead-file flags to graph nodes without changing the layout data. Zero tokens: purely local.

**Files**
- `src/00_planning/graph/graphMetrics.ts` — node (typescript)
- `src/00_planning/graph/graphMetrics.test.ts` — node (typescript)

**Edits**
- `src/00_planning/graph/types.ts`
- `src/00_planning/PlanningView.ViewModel.tsx`
- `src/00_planning/graph/workspaceScanCache.ts`
<!-- /step-meta:plan/architecture-health-and-optimize-1793132878819/metrics-on-the-planning-graph-1793132878985 -->

<!-- /step:plan/architecture-health-and-optimize-1793132878819/metrics-on-the-planning-graph-1793132878985 -->

## 3. Health lens on the graph
<!-- step:plan/architecture-health-and-optimize-1793132878819/health-lens-on-the-graph-1793132879115 -->
An optional Health view toggle beside ARCHITECTURE / PLAN ONLY, so the default all-white graph is untouched. With it on: node size grows with fan-in, counts (imports and imported-by) on hover or selection, cycles drawn red, wrong-direction imports amber, dead files faded. Visual rules live in a pure module so they are testable; theme tokens carry the colors in light and dark.

**Files**
- `src/00_planning/graph/healthLens.ts` — node (typescript)
- `src/00_planning/graph/healthLens.test.ts` — node (typescript)

**Edits**
- `src/00_planning/graph/GraphCanvas.tsx`
- `src/00_planning/graph/layout.ts`
- `src/00_planning/PlanningView.tsx`
- `src/00_themes/tactical.css`
- `src/00_themes/light.css`
<!-- /step-meta:plan/architecture-health-and-optimize-1793132878819/health-lens-on-the-graph-1793132879115 -->

<!-- /step:plan/architecture-health-and-optimize-1793132878819/health-lens-on-the-graph-1793132879115 -->

## 4. Readable large graphs
<!-- step:plan/architecture-health-and-optimize-1793132878819/readable-large-graphs-1793132879289 -->
Big projects overlap today. Hide labels below a zoom level except for important nodes (high fan-in, selected, neighbours), collapse folders into single nodes with an aggregate count and expand on click, and keep the force layout stable when collapsing. Makes the Health view legible at repo scale.

**Files**
- `src/00_planning/graph/labelCulling.ts` — node (typescript)
- `src/00_planning/graph/labelCulling.test.ts` — node (typescript)

**Edits**
- `src/00_planning/graph/GraphCanvas.tsx`
- `src/00_planning/graph/layout.ts`
- `src/00_planning/graph/architectureScope.ts`
<!-- /step-meta:plan/architecture-health-and-optimize-1793132878819/readable-large-graphs-1793132879289 -->

<!-- /step:plan/architecture-health-and-optimize-1793132878819/readable-large-graphs-1793132879289 -->

## 5. Health panel and blast radius
<!-- step:plan/architecture-health-and-optimize-1793132878819/health-panel-and-blast-radius-1793132879480 -->
A panel next to the graph listing hubs, cycles, wrong-direction imports, dead files and hotspots, each clickable to focus the graph. Selecting a file in the Health view lights up everything that depends on it, directly or not: its blast radius, for safer changes and faster debugging.

**Files**
- `src/00_planning/HealthPanel.tsx` — view (react)
- `src/00_planning/HealthPanel.ViewModel.tsx` — view-model (react)

**Edits**
- `src/00_planning/PlanningView.tsx`
- `src/00_planning/PlanningView.ViewModel.tsx`
- `src/00_planning/graph/GraphCanvas.tsx`
<!-- /step-meta:plan/architecture-health-and-optimize-1793132878819/health-panel-and-blast-radius-1793132879480 -->

<!-- /step:plan/architecture-health-and-optimize-1793132878819/health-panel-and-blast-radius-1793132879480 -->

## 6. Git churn hotspots
<!-- step:plan/architecture-health-and-optimize-1793132878819/git-churn-hotspots-1793132879644 -->
Count how often each file changed (git log over a window) and combine with fan-in: files that are central AND change often are where bugs cluster and the best refactor targets. Exposed through the same backend/IPC path as the other git calls, cached, and shown in the Health panel and lens.

**Edits**
- `tools/git-control.mjs`
- `tools/sleipnir-backend.mjs`
- `electron/main.cjs`
- `electron/preload.cjs`
- `src/00_planning/api/PlatformAPI.ts`
- `src/00_planning/api/electronApi.ts`
- `src/00_planning/api/webApi.ts`
- `src/00_planning/api/sleipnirApi.ts`
- `vite.config.ts`
<!-- /step-meta:plan/architecture-health-and-optimize-1793132878819/git-churn-hotspots-1793132879644 -->

<!-- /step:plan/architecture-health-and-optimize-1793132878819/git-churn-hotspots-1793132879644 -->

## 7. analyze_architecture agent tool
<!-- step:plan/architecture-health-and-optimize-1793132878819/analyze-architecture-agent-tool-1793132879826 -->
An in-app agent tool that runs the metrics core on the open project and returns a compact, capped report (top 20 hubs, cycles up to a limit, violations, hotspots, per-file counts on request): a few thousand tokens instead of source code. The agent then reads only the files it decides to change. Scoping by folder and a goal keep it smaller still.

**Files**
- `electron/agent/tools/architecture.cjs` — node (react)

**Edits**
- `electron/agent/tools/registry.cjs`
- `electron/agent/systemPrompt.cjs`
<!-- /step-meta:plan/architecture-health-and-optimize-1793132878819/analyze-architecture-agent-tool-1793132879826 -->

<!-- /step:plan/architecture-health-and-optimize-1793132878819/analyze-architecture-agent-tool-1793132879826 -->

## 8. The /optimize command
<!-- step:plan/architecture-health-and-optimize-1793132878819/the-optimize-command-1793132879982 -->
'/optimize [folder] [for <goal>]' in the app and in Claude Code, Codex and Gemini: get the report (analyze_architecture in the app, node .sleipnir/analyze.mjs report for terminal agents), decide improvements, and draft them as a reviewable plan in the Planning graph via the existing plan tool, each step naming the files it moves, extracts or splits. Nothing changes until a step is approved. Scaffolded like /plan, /frame and /component (analyze.mjs vendored into .sleipnir/), and listed in the chat's slash suggestions.

**Edits**
- `tools/agentSkills/registry.mjs`
- `tools/agentSkills/scaffold.mjs`
- `tools/agentSkills/emitters/index.mjs`
- `tools/agentSkills/agentSkills.test.ts`
- `src/app/AgentChat/AgentChat.tsx`
- `electron/agent/systemPrompt.cjs`
<!-- /step-meta:plan/architecture-health-and-optimize-1793132878819/the-optimize-command-1793132879982 -->

<!-- /step:plan/architecture-health-and-optimize-1793132878819/the-optimize-command-1793132879982 -->

## 9. Feature finder
<!-- step:plan/architecture-health-and-optimize-1793132878819/feature-finder-1793133462101 -->
Turn '/optimize my right click menu' into the feature's own sub-graph: seed files from a name and behaviour search (component names, handlers like onContextMenu, strings, routes), then grow along imports (what it uses) and importers (where it is mounted), ranked by graph distance and fan-in, capped to ~15 files. Narrows what the agent reads (fewer tokens, better focus) and is drawn on the graph as the scope of the run.

**Files**
- `tools/agentSkills/vendor/featureScope.mjs` — node (react)
- `tools/agentSkills/vendor/featureScope.test.ts` — node (typescript)

**Edits**
- `electron/agent/tools/registry.cjs`
<!-- /step-meta:plan/architecture-health-and-optimize-1793132878819/feature-finder-1793133462101 -->

<!-- /step:plan/architecture-health-and-optimize-1793132878819/feature-finder-1793133462101 -->

## 10. Measurement harness
<!-- step:plan/architecture-health-and-optimize-1793132878819/measurement-harness-1793133462209 -->
Measure before changing anything, the same way every time: interaction timing in the running app or a preview over the DevTools Protocol (time from input to paint, long tasks, React re-render counts) and per-language micro-benchmarks (Vitest bench, Rust criterion, Go testing.B, pytest-benchmark). Several runs, median and spread reported, so noise is never mistaken for a win. A measurement can be saved as a performance test with a budget that the Validation view enforces.

**Files**
- `electron/perfProbe.cjs` — node (react)
- `electron/perfProbe.test.ts` — node (typescript)
- `tools/agentSkills/vendor/bench.mjs` — node (react)

**Edits**
- `electron/validation.cjs`
- `electron/preview.cjs`
- `electron/main.cjs`
- `electron/preload.cjs`
- `src/04_validation/ValidationView.ViewModel.tsx`
<!-- /step-meta:plan/architecture-health-and-optimize-1793132878819/measurement-harness-1793133462209 -->

<!-- /step:plan/architecture-health-and-optimize-1793132878819/measurement-harness-1793133462209 -->

## 11. Optimization loop
<!-- step:plan/architecture-health-and-optimize-1793132878819/optimization-loop-1793133462337 -->
'/optimize <feature> and try it': baseline, then rounds of one hypothesis, one small change, tests as the correctness gate, re-measure, keep only if it beats the baseline by more than the noise, otherwise undo. Each kept change is a reviewable change set. Capped rounds and token budget, stops early when nothing helps, never pushes. Hypotheses come from a pattern catalog (state lifted too high causing re-renders, sync work in handlers, missing memoization, heavy imports on the hot path, N+1 calls) plus the graph signals.

**Files**
- `electron/agent/optimizeLoop.cjs` — node (react)
- `electron/agent/optimizeLoop.test.ts` — node (typescript)

**Edits**
- `electron/agent/changeSets.cjs`
- `electron/chat.cjs`
- `electron/agent/systemPrompt.cjs`
<!-- /step-meta:plan/architecture-health-and-optimize-1793132878819/optimization-loop-1793133462337 -->

<!-- /step:plan/architecture-health-and-optimize-1793132878819/optimization-loop-1793133462337 -->

## 12. Optimize results card
<!-- step:plan/architecture-health-and-optimize-1793132878819/optimize-results-card-1793133462552 -->
A report in the chat and on the plan: baseline and final numbers (menu open 180ms to 45ms, re-renders 40 to 3), every attempt with its measurement and whether it was kept or undone, the files touched highlighted on the graph, and the saved performance budget. Makes the agent's work inspectable and repeatable.

**Files**
- `src/app/AgentChat/OptimizeReport.tsx` — view (react)
- `src/app/AgentChat/OptimizeReport.ViewModel.tsx` — view-model (react)

**Edits**
- `src/app/AgentChat/AgentChat.tsx`
- `src/00_planning/graph/GraphCanvas.tsx`
<!-- /step-meta:plan/architecture-health-and-optimize-1793132878819/optimize-results-card-1793133462552 -->

<!-- /step:plan/architecture-health-and-optimize-1793132878819/optimize-results-card-1793133462552 -->

## 13. Measure every approved step
<!-- step:plan/architecture-health-and-optimize-1793132878819/measure-every-approved-step-1793132880232 -->
Snapshot the metrics when an optimize plan is created and again after each step is approved and built, then show the change on the step and in the plan status bar (cycles 3 to 1, ExamplePage fan-in 3 to 0, largest hub 22 to 14). Turns 'did this help?' into a number, and flags a step that made things worse.

**Files**
- `src/00_planning/graph/metricsDelta.ts` — node (typescript)
- `src/00_planning/graph/metricsDelta.test.ts` — node (typescript)

**Edits**
- `src/00_planning/ApproveStepModal.ViewModel.tsx`
- `src/00_planning/useStatusReconciler.ts`
- `src/00_planning/PlanBuildStatusBar.tsx`
<!-- /step-meta:plan/architecture-health-and-optimize-1793132878819/measure-every-approved-step-1793132880232 -->

<!-- /step:plan/architecture-health-and-optimize-1793132878819/measure-every-approved-step-1793132880232 -->

## 14. Flow beyond imports
<!-- step:plan/architecture-health-and-optimize-1793132878819/flow-beyond-imports-1793132880438 -->
Map logic flow that imports don't show: Electron IPC channels (ipcMain.handle with invoke), HTTP routes (frontend fetch of /api/x with the backend route, across languages), and event emit/on pairs. New edge kinds drawn with their own line styles (dashed IPC, dotted events), included in the metrics and the optimize report, so async and cross-language systems are analyzed as one graph.

**Files**
- `src/00_planning/graph/importAdapters/flowRefs.ts` — node (typescript)
- `src/00_planning/graph/importAdapters/flowRefs.test.ts` — node (typescript)

**Edits**
- `src/00_planning/graph/types.ts`
- `src/00_planning/graph/importAdapters/detectEdges.ts`
- `src/00_planning/graph/GraphCanvas.tsx`
<!-- /step-meta:plan/architecture-health-and-optimize-1793132878819/flow-beyond-imports-1793132880438 -->

<!-- /step:plan/architecture-health-and-optimize-1793132878819/flow-beyond-imports-1793132880438 -->

## 15. Test and pipeline failures on the graph
<!-- step:plan/architecture-health-and-optimize-1793132878819/test-and-pipeline-failures-on-the-graph-1793133462721 -->
Map failing tests and CI runs (Vitest results, GitHub Actions job logs) onto the graph: a failure lights its test file and import path, and suspects are ranked by blast radius, recent churn, co-change history (files that change together without importing each other) and what changed since the last green run. Also predictive test selection: run only the tests whose import closure touches the change, for faster loops in /optimize and everyday work.

**Files**
- `tools/agentSkills/vendor/failureMap.mjs` — node (react)
- `tools/agentSkills/vendor/failureMap.test.ts` — node (typescript)

**Edits**
- `electron/validation.cjs`
- `tools/git-control.mjs`
- `src/04_validation/ValidationView.tsx`
- `src/00_planning/graph/GraphCanvas.tsx`
<!-- /step-meta:plan/architecture-health-and-optimize-1793132878819/test-and-pipeline-failures-on-the-graph-1793133462721 -->

<!-- /step:plan/architecture-health-and-optimize-1793132878819/test-and-pipeline-failures-on-the-graph-1793133462721 -->
