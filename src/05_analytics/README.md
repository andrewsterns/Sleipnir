# 05_analytics: Feedback Loop

This is the final stage of the **00–05 pipeline**. This directory stores the
**results** of testing sessions — `AnalyticsView.tsx`/`.ViewModel.tsx` is the
in-app view over that data.

## 1. Directory structure
- `AnalyticsView.tsx` / `.ViewModel.tsx` — The Analytics tab.
- `[SessionID]/` — Data and reports from specific prototype testing sessions,
  as they accumulate.

## 2. Feedback mandate
The data here should be used to update `01_research` with what was actually
learned, completing the research-driven development cycle:
`01_research` → `00_planning` → `02_components`/`03_prototypes` →
`04_validation` → `05_analytics` → back to `01_research`.
