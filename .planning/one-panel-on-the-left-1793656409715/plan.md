<!-- sleipnir:plan — generated from .planning/notes.json. Write freely under the title and between a step's /step-meta and /step markers; everything else is regenerated. -->
# One panel on the left

Everything the right panel showed moves into the left one, which widens to hold it: a picked node's details, the Health report, the effort insights, and the skills as a list that opens in place. The graph gets the rest of the window.
<!-- /plan-meta -->

<!-- steps -->

## 1. Details in the left panel
<!-- step:plan/one-panel-on-the-left-1793656409715/details-in-the-left-panel-1793656409905 -->
**Status:** Done — Node card, effort insights and skill card open at the top of a 320px left panel with a close button; right panel removed

A picked node's card and the effort insights open at the top of the left panel, with a close button; the left panel widens and the right panel goes.

**Edits**
- `src/00_planning/PlanningView.tsx`
<!-- /step-meta:plan/one-panel-on-the-left-1793656409715/details-in-the-left-panel-1793656409905 -->

<!-- /step:plan/one-panel-on-the-left-1793656409715/details-in-the-left-panel-1793656409905 -->

## 2. Health on the left
<!-- step:plan/one-panel-on-the-left-1793656409715/health-on-the-left-1793656410009 -->
**Status:** Done — Health report fills the left panel on the Health view

The Health view's report — totals, the selected file, the loops and hot spots — fills the left panel.

**Edits**
- `src/00_planning/HealthPanel.tsx`
- `src/00_planning/PlanningView.tsx`
<!-- /step-meta:plan/one-panel-on-the-left-1793656409715/health-on-the-left-1793656410009 -->

<!-- /step:plan/one-panel-on-the-left-1793656409715/health-on-the-left-1793656410009 -->

## 3. Skills listed on the left
<!-- step:plan/one-panel-on-the-left-1793656409715/skills-listed-on-the-left-1793656410128 -->
**Status:** Done — Skills view lists instruction files with token cost, then skills that open in place to their card (SkillsList)

The Skills view lists the instruction files with their size, then every skill as a row that opens in place to its card.

**Files**
- `src/00_planning/skills/SkillsList.tsx` — view (react)

**Edits**
- `src/00_planning/PlanningView.tsx`
<!-- /step-meta:plan/one-panel-on-the-left-1793656409715/skills-listed-on-the-left-1793656410128 -->

<!-- /step:plan/one-panel-on-the-left-1793656409715/skills-listed-on-the-left-1793656410128 -->
