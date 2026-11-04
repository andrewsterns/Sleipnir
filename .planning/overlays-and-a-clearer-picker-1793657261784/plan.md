<!-- sleipnir:plan — generated from .planning/notes.json. Write freely under the title and between a step's /step-meta and /step markers; everything else is regenerated. -->
# Overlays and a clearer picker

The picker says what's in it — architecture, skills and the chats' plans — and Health joins Effort as an overlay you lay over any file view instead of a view of its own.
<!-- /plan-meta -->

<!-- steps -->

## 1. A picker that says what it holds
<!-- step:plan/overlays-and-a-clearer-picker-1793657261784/a-picker-that-says-what-it-holds-1793657261873 -->
**Status:** Done — Closed field reads ARCHITECTURE · SKILLS · CHATS; sections VIEWS and CHATS & PLANS

Closed it reads ARCHITECTURE · SKILLS · CHATS; open, VIEWS then CHATS & PLANS, newest first.

**Edits**
- `src/app/WorkspaceTabStrip/TabPicker.tsx`
- `src/00_planning/PlanningView.tsx`
<!-- /step-meta:plan/overlays-and-a-clearer-picker-1793657261784/a-picker-that-says-what-it-holds-1793657261873 -->

<!-- /step:plan/overlays-and-a-clearer-picker-1793657261784/a-picker-that-says-what-it-holds-1793657261873 -->

## 2. Health is an overlay
<!-- step:plan/overlays-and-a-clearer-picker-1793657261784/health-is-an-overlay-1793657261985 -->
**Status:** Done — Health left the pinned views; HEALTH | EFFORT overlay pair laid over Architecture or a plan, off on Skills

Health leaves the pinned views and sits beside Effort as one of two overlays, laid over the architecture or a plan in the project; its report opens in the left panel.

**Edits**
- `src/00_planning/graph/pinnedViews.ts`
- `src/00_planning/PlanningView.ViewModel.tsx`
- `src/00_planning/PlanningView.tsx`
<!-- /step-meta:plan/overlays-and-a-clearer-picker-1793657261784/health-is-an-overlay-1793657261985 -->

<!-- /step:plan/overlays-and-a-clearer-picker-1793657261784/health-is-an-overlay-1793657261985 -->
