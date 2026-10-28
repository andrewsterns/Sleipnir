# Challenge: context-menu-lag

"Right-clicking an item takes a moment before the menu shows." A feature-level
performance problem, not an architecture one — the test for `/optimize my right click menu`.

    node ../../agentSkills/vendor/analyze.mjs feature --root . "my right click menu"

## 1. Find the feature (graph)

The request names no file. The feature finder should land on the menu code —
`menu/ContextMenu.tsx`, `menu/useContextMenu.ts`, `menu/menuItems.ts`, `menu/MenuItem.tsx` —
plus where it is mounted (`App.tsx`, `board/Board.tsx`), and leave out `settings/` and
`search/`. That is the ~8 files an agent should read instead of the whole project.

## 2. The planted causes of lag (code)

1. **State lifted too high.** The menu's `{x, y, targetId}` lives in `App` and is passed to
   all 3000 `BoardItem`s, so every right-click re-renders the whole board. Fix: keep menu
   state beside the menu, and give items only a boolean (or highlight via CSS/data attr).
2. **No memoization.** `BoardItem` sorts and joins tags on every render and isn't wrapped in
   `memo`. Fix: `memo(BoardItem)` and compute `summary` once (`useMemo` or in `makeItems`).
3. **O(n²) work.** `buildMenuItems` dedupes with `findIndex` inside `filter` over every
   item's tags (6000 entries → ~18M comparisons). Fix: a `Map`/`Set` (O(n)), and build only
   the distinct groups once, not per right-click.
4. **Duplicate work on the hot path.** `useContextMenu` builds the whole menu before opening,
   then `ContextMenu` builds it again on render. Fix: build once (memoized on `items`).

## 3. Measure, change, re-measure (what the optimization loop does)

- Benchmark `buildMenuItems(makeItems(3000), 'item-1')` before and after fix 3.
- Time right-click → menu painted and count `BoardItem` renders before and after fix 1.
- Keep a change only if it beats the baseline beyond run-to-run noise; tests must pass.

Expected outcome: renders per right-click 3000 → 1–2, `buildMenuItems` from tens of ms to
well under 1 ms, menu open time dominated by paint.
