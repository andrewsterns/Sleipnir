<!-- sleipnir:plan — generated from .planning/notes.json. Write freely under the title and between a step's /step-meta and /step markers; everything else is regenerated. -->
# Plan panel as a timeline

The left panel reads a plan like a branch history: steps on one line, each opening and closing in place, read-only apart from status.
<!-- /plan-meta -->

<!-- steps -->

## 1. Steps open and close
<!-- step:plan/plan-panel-as-a-timeline-1793650721914/steps-open-and-close-1793650722038 -->
**Status:** Done — Auto-open fires only when the working or picked step changes; clicking an open step closes it

An open step closes again when clicked; only a newly started or newly picked step opens by itself.

**Edits**
- `src/00_planning/PlanStepsList.ViewModel.tsx`
<!-- /step-meta:plan/plan-panel-as-a-timeline-1793650721914/steps-open-and-close-1793650722038 -->

<!-- /step:plan/plan-panel-as-a-timeline-1793650721914/steps-open-and-close-1793650722038 -->

## 2. Steps on a timeline
<!-- step:plan/plan-panel-as-a-timeline-1793650721914/steps-on-a-timeline-1793650722233 -->
**Status:** Done — Status marks on one line, solid through done and dashed ahead; last activity time per row; history as ticks

Each step's status mark sits on one vertical line, solid through finished work and dashed ahead, with its history as ticks on the same line.

**Edits**
- `src/00_planning/PlanStepsList.tsx`
- `src/00_planning/ActivityPanel.tsx`
<!-- /step-meta:plan/plan-panel-as-a-timeline-1793650721914/steps-on-a-timeline-1793650722233 -->

<!-- /step:plan/plan-panel-as-a-timeline-1793650721914/steps-on-a-timeline-1793650722233 -->

## 3. Reading, not commenting
<!-- step:plan/plan-panel-as-a-timeline-1793650721914/reading-not-commenting-1793650722356 -->
**Status:** Done — Comment box removed from step activity; changed files show by name; agents still comment via the CLI

The step list is for reading: status, history and links into the workspace. The comment box goes; agents and the CLI can still comment.

**Edits**
- `src/00_planning/ActivityPanel.tsx`
- `src/00_planning/ActivityPanel.ViewModel.tsx`
<!-- /step-meta:plan/plan-panel-as-a-timeline-1793650721914/reading-not-commenting-1793650722356 -->

<!-- /step:plan/plan-panel-as-a-timeline-1793650721914/reading-not-commenting-1793650722356 -->
