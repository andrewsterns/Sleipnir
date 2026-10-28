<!-- sleipnir:plan — generated from .planning/notes.json. Write freely under the title and between a step's /step-meta and /step markers; everything else is regenerated. -->
# Architecture health & /optimize
<!-- /plan-meta -->

<!-- steps -->

## 1. Graph metrics core
<!-- step:plan/architecture-health-optimize-1793132850767/graph-metrics-core-1793132850850 -->
One dependency-free module (node builtins only) that turns {files, import edges} into the numbers everything else uses: fan-in and fan-out per file, instability (fan-out / (fan-in + fan-out)), cycles via strongly connected components, dead files (no importers, not an entry point), hubs, clusters (label propagation) and reverse reachability for blast radius. Lives beside the other vendored CLIs so the app, the in-app agent and terminal agents all compute identical results — the AI never estimates a number.

**Files**
- `tools/agentSkills/vendor/analyze.mjs` — node (react)
- `tools/agentSkills/vendor/analyze.test.ts` — node (typescript)
<!-- /step-meta:plan/architecture-health-optimize-1793132850767/graph-metrics-core-1793132850850 -->

<!-- /step:plan/architecture-health-optimize-1793132850767/graph-metrics-core-1793132850850 -->

## 2. Metrics on the Planning graph
<!-- step:plan/architecture-health-optimize-1793132850767/metrics-on-the-planning-graph-1793132850946 -->
Feed the edges Sleipnir already detects (importAdapters/detectEdges) through the metrics core, memoized per graph so a re-scan only recomputes what changed. Adds fan-in/fan-out, cycle membership and dead-file flags to graph nodes without changing the layout data. Zero tokens: purely local.

**Files**
- `src/00_planning/graph/graphMetrics.ts` — node (typescript)
- `src/00_planning/graph/graphMetrics.test.ts` — node (typescript)

**Edits**
- `src/00_planning/graph/types.ts`
- `src/00_planning/PlanningView.ViewModel.tsx`
- `src/00_planning/graph/workspaceScanCache.ts`
<!-- /step-meta:plan/architecture-health-optimize-1793132850767/metrics-on-the-planning-graph-1793132850946 -->

<!-- /step:plan/architecture-health-optimize-1793132850767/metrics-on-the-planning-graph-1793132850946 -->

## 3. Health lens on the graph
<!-- step:plan/architecture-health-optimize-1793132850767/health-lens-on-the-graph-1793132851059 -->
An optional 'Health' view toggle beside ARCHITECTURE / PLAN ONLY, so the default all-white graph is untouched. With it on: node size grows with fan-in, counts (imports and imported-by) on hover or selection, cycles drawn red, wrong-direction imports amber, dead files faded. Visual rules live in a pure module so they are testable and theme tokens carry the colors in light and dark.

**Files**
- `src/00_planning/graph/healthLens.ts` — node (typescript)
- `src/00_planning/graph/healthLens.test.ts` — node (typescript)

**Edits**
- `src/00_planning/graph/GraphCanvas.tsx`
- `src/00_planning/graph/layout.ts`
- `src/00_planning/PlanningView.tsx`
- `src/00_themes/tactical.css`
- `src/00_themes/light.css`
<!-- /step-meta:plan/architecture-health-optimize-1793132850767/health-lens-on-the-graph-1793132851059 -->

<!-- /step:plan/architecture-health-optimize-1793132850767/health-lens-on-the-graph-1793132851059 -->

## 4. Readable large graphs
<!-- step:plan/architecture-health-optimize-1793132850767/readable-large-graphs-1793132851209 -->
Big projects overlap today. Hide labels below a zoom level except for important nodes (high fan-in, selected, neighbours), collapse folders into single nodes with an aggregate count and expand on click, and keep the force layout stable when collapsing. Makes the health view legible at repo scale.

**Files**
- `src/00_planning/graph/labelCulling.ts` — node (typescript)
- `src/00_planning/graph/labelCulling.test.ts` — node (typescript)

**Edits**
- `src/00_planning/graph/GraphCanvas.tsx`
- `src/00_planning/graph/layout.ts`
- `src/00_planning/graph/architectureScope.ts`
<!-- /step-meta:plan/architecture-health-optimize-1793132850767/readable-large-graphs-1793132851209 -->

<!-- /step:plan/architecture-health-optimize-1793132850767/readable-large-graphs-1793132851209 -->

## 5. Health panel and blast radius
<!-- step:plan/architecture-health-optimize-1793132850767/health-panel-and-blast-radius-1793132851352 -->
A panel next to the graph listing hubs, cycles, wrong-direction imports, dead files and (later) hotspots, each clickable to focus the graph. Selecting a file in the Health view lights up everything that depends on it, directly or not — its blast radius, for safer changes and faster debugging.

**Files**
- `src/00_planning/HealthPanel.tsx` — view (react)
- `src/00_planning/HealthPanel.ViewModel.tsx` — view-model (react)

**Edits**
- `src/00_planning/PlanningView.tsx`
- `src/00_planning/PlanningView.ViewModel.tsx`
- `src/00_planning/graph/GraphCanvas.tsx`
<!-- /step-meta:plan/architecture-health-optimize-1793132850767/health-panel-and-blast-radius-1793132851352 -->

<!-- /step:plan/architecture-health-optimize-1793132850767/health-panel-and-blast-radius-1793132851352 -->

## 6. analyze_architecture agent tool
<!-- step:plan/architecture-health-optimize-1793132850767/analyze-architecture-agent-tool-1793132851608 -->
An in-app agent tool that runs the metrics core on the open project and returns a compact, capped report (top 20 hubs, every cycle up to a limit, violations, hotspots, per-file counts on request) — a few thousand tokens instead of source code. The agent then reads only the files it decides to change. Scoping by folder and a goal keep it smaller still.

**Files**
- `electron/agent/tools/architecture.cjs` — node (react)

**Edits**
- `electron/agent/tools/registry.cjs`
- `electron/agent/systemPrompt.cjs`
<!-- /step-meta:plan/architecture-health-optimize-1793132850767/analyze-architecture-agent-tool-1793132851608 -->

<!-- /step:plan/architecture-health-optimize-1793132850767/analyze-architecture-agent-tool-1793132851608 -->

## 7. C:/Program Files/Git/optimize command
<!-- step:plan/architecture-health-optimize-1793132850767/c-program-files-git-optimize-command-1793132851778 -->
/optimize [folder] [for <goal>] in the app and in Claude Code, Codex and Gemini: get the report (analyze_architecture, or node .sleipnir/analyze.mjs report for terminal agents), decide improvements, and draft them as a reviewable plan in the Planning graph via the existing plan tool — each step naming the files it moves, extracts or splits. Nothing changes until a step is approved. Scaffolded like /plan, /frame and /component, and listed in the chat's slash suggestions.

**Edits**
- `tools/agentSkills/registry.mjs`
- `tools/agentSkills/scaffold.mjs`
- `tools/agentSkills/emitters/index.mjs`
- `tools/agentSkills/agentSkills.test.ts`
- `src/app/AgentChat/AgentChat.tsx`
- `electron/agent/systemPrompt.cjs`
<!-- /step-meta:plan/architecture-health-optimize-1793132850767/c-program-files-git-optimize-command-1793132851778 -->

<!-- /step:plan/architecture-health-optimize-1793132850767/c-program-files-git-optimize-command-1793132851778 -->

## 8. Measure every approved step
<!-- step:plan/architecture-health-optimize-1793132850767/measure-every-approved-step-1793132851912 -->
Snapshot the metrics when an /optimize plan is created and again after each step is approved and built, then show the change on the step and in the plan status bar (cycles 3 → 1, ExamplePage fan-in 3 → 0, largest hub 22 → 14). Turns 'did this help?' into a number, and flags a step that made things worse.

**Files**
- `src/00_planning/graph/metricsDelta.ts` — node (typescript)
- `src/00_planning/graph/metricsDelta.test.ts` — node (typescript)

**Edits**
- `src/00_planning/ApproveStepModal.ViewModel.tsx`
- `src/00_planning/useStatusReconciler.ts`
- `src/00_planning/PlanBuildStatusBar.tsx`
<!-- /step-meta:plan/architecture-health-optimize-1793132850767/measure-every-approved-step-1793132851912 -->

<!-- /step:plan/architecture-health-optimize-1793132850767/measure-every-approved-step-1793132851912 -->
