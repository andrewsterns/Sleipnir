<!-- sleipnir:plan — generated from .planning/notes.json. Write freely under the title and between a step's /step-meta and /step markers; everything else is regenerated. -->
# Simpler graph and plan panel

A calmer graph and one place to follow a plan: one ink with status shown by shape, a steady box where the agent works, and the plan read top to bottom in the left panel.
<!-- /plan-meta -->

<!-- steps -->

## 1. One ink, no opacity
<!-- step:plan/simpler-graph-and-plan-panel-1793633425011/one-ink-no-opacity-1793633425095 -->
**Status:** Done (set by you) — Every graph mark in the one ink at full strength; status is shape only; no dimming, glows or pulse

Every graph mark in one color — white on dark, black on light — at full strength: nodes, lines, labels, rings, boxes. Status is shape alone (dashed ring proposed, ring in progress, ring in a box testing, dot done, small dot committed); selection is a ring and a heavier line, not a color or a fade. Heat glows and dimming go.

**Edits**
- `src/00_planning/graph/GraphCanvas.tsx`
- `src/00_planning/graph/nodeTone.ts`
- `src/00_planning/graph/StatusGlyph.tsx`
- `src/00_themes/tactical.css`
- `src/00_themes/light.css`
<!-- /step-meta:plan/simpler-graph-and-plan-panel-1793633425011/one-ink-no-opacity-1793633425095 -->

<!-- /step:plan/simpler-graph-and-plan-panel-1793633425011/one-ink-no-opacity-1793633425095 -->

## 2. The box holds where the agent is
<!-- step:plan/simpler-graph-and-plan-panel-1793633425011/the-box-holds-where-the-agent-is-1793633425212 -->
**Status:** Done — One steady box on the node the agent is on now, held until it moves on or stops

One steady corner box on the node the agent is on now — no blinking, no fading trail of boxes.

**Edits**
- `src/00_planning/graph/FocusBox.tsx`
- `src/00_planning/graph/GraphCanvas.tsx`
<!-- /step-meta:plan/simpler-graph-and-plan-panel-1793633425011/the-box-holds-where-the-agent-is-1793633425212 -->

<!-- /step:plan/simpler-graph-and-plan-panel-1793633425011/the-box-holds-where-the-agent-is-1793633425212 -->

## 3. The plan in the left panel
<!-- step:plan/simpler-graph-and-plan-panel-1793633425011/the-plan-in-the-left-panel-1793633425352 -->
**Status:** Done — Steps 1..n accordion with plan description in the left panel; right panel only for files/skills; trail.mjs made bundle-safe

A plan tab lists its steps 1 to n with their status, the plan description above them, and each step opening in place to its description, files, status and activity — so the right panel is only needed for a file or a skill.

**Edits**
- `src/00_planning/PlanningView.tsx`
- `src/00_planning/PlanningView.ViewModel.tsx`
- `tools/planDoc.mjs`
- `tools/agentSkills/vendor/plan.mjs`
- `tools/sleipnir-backend.mjs`
<!-- /step-meta:plan/simpler-graph-and-plan-panel-1793633425011/the-plan-in-the-left-panel-1793633425352 -->

<!-- /step:plan/simpler-graph-and-plan-panel-1793633425011/the-plan-in-the-left-panel-1793633425352 -->
