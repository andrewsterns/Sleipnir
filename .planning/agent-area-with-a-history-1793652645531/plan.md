<!-- sleipnir:plan — generated from .planning/notes.json. Write freely under the title and between a step's /step-meta and /step markers; everything else is regenerated. -->
# Agent area with a history

Planning becomes Agent: a picture of the markdown the agent reads and writes. Architecture, Skills and Health are pinned views that can't be removed; plans are the history below them, newest first. A plan opens on its own, and a spacing slider gives a crowded graph room to breathe.
<!-- /plan-meta -->

<!-- steps -->

## 1. Pinned views
<!-- step:plan/agent-area-with-a-history-1793652645531/pinned-views-1793652645615 -->
**Status:** Done — Architecture, Skills and Health open as plan-less tabs (graph/pinnedViews.ts); their controls follow the open view

Architecture, Skills and Health open as their own tabs, without a plan: the project, the agents' instructions and skills, and the import health.

**Files**
- `src/00_planning/graph/pinnedViews.ts` — node (typescript)

**Edits**
- `src/00_planning/PlanningView.ViewModel.tsx`
- `src/00_planning/PlanningView.tsx`
<!-- /step-meta:plan/agent-area-with-a-history-1793652645531/pinned-views-1793652645615 -->

<!-- /step:plan/agent-area-with-a-history-1793652645531/pinned-views-1793652645615 -->

## 2. The picker as a history
<!-- step:plan/agent-area-with-a-history-1793652645531/the-picker-as-a-history-1793652645750 -->
**Status:** Done — Picker lists PINNED views, then HISTORY: plans newest first with date and progress (planHistory)

The dropdown lists the pinned views first, then every plan newest first with its date and progress.

**Edits**
- `src/app/WorkspaceTabStrip/TabPicker.tsx`
- `src/00_planning/PlanningView.tsx`
<!-- /step-meta:plan/agent-area-with-a-history-1793652645531/the-picker-as-a-history-1793652645750 -->

<!-- /step:plan/agent-area-with-a-history-1793652645531/the-picker-as-a-history-1793652645750 -->

## 3. A plan opens on its own
<!-- step:plan/agent-area-with-a-history-1793652645531/a-plan-opens-on-its-own-1793652645853 -->
**Status:** Done — Plan tabs open as PLAN, with an IN PROJECT switch; done alongside step 1 since the old toggle's modes moved to pinned views

The four-way toggle goes; a plan tab shows the plan alone, with an IN PROJECT switch to see it over the architecture.

**Edits**
- `src/00_planning/PlanningView.tsx`
- `src/00_planning/PlanningView.ViewModel.tsx`
<!-- /step-meta:plan/agent-area-with-a-history-1793652645531/a-plan-opens-on-its-own-1793652645853 -->

<!-- /step:plan/agent-area-with-a-history-1793652645531/a-plan-opens-on-its-own-1793652645853 -->

## 4. Planning becomes Agent
<!-- step:plan/agent-area-with-a-history-1793652645531/planning-becomes-agent-1793652645977 -->
**Status:** Done — Rail item and missing-files banner say Agent; the picker reads HISTORY

The rail and picker name the area for what it shows: the agent's markdown, plans and skills.

**Edits**
- `src/App.tsx`
- `src/00_planning/PlanningView.tsx`
<!-- /step-meta:plan/agent-area-with-a-history-1793652645531/planning-becomes-agent-1793652645977 -->

<!-- /step:plan/agent-area-with-a-history-1793652645531/planning-becomes-agent-1793652645977 -->

## 5. Spacing slider
<!-- step:plan/agent-area-with-a-history-1793652645531/spacing-slider-1793652646091 -->
**Status:** Done — SPACING slider bottom-right scales link length, repulsion and berth (1-4x), live, remembered per viewer

A slider in the graph's bottom right spreads nodes apart — longer links, stronger repulsion — for crowded projects, remembered per viewer.

**Edits**
- `src/00_planning/graph/layout.ts`
- `src/00_planning/graph/GraphCanvas.tsx`
- `src/00_planning/PlanningView.tsx`
<!-- /step-meta:plan/agent-area-with-a-history-1793652645531/spacing-slider-1793652646091 -->

<!-- /step:plan/agent-area-with-a-history-1793652645531/spacing-slider-1793652646091 -->
