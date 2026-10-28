# Challenge: react-shop

A small storefront with the problems a growing React app collects.

    node ../../agentSkills/vendor/analyze.mjs report --root .

## Planted problems — what /optimize should find

1. **A page used as a library.** `pages/ProductPage.tsx` imports 6 project files (plus react and three), and besides
   `App`, 3 other files import it (`CartPage`, `CheckoutPage`, `components/RecentlyViewed`) — only for
   `ProductCard`. Fix: move `ProductCard` to `components/ProductCard.tsx`.
2. **Import cycles.** `store/cartStore.ts` ↔ `api/cartApi.ts` (the store syncs through
   the API; the API reads the token from the store). And because `ProductPage` renders
   `RecentlyViewed`, which imports `ProductCard` back from the page, the page and that
   component form a second loop — fixed by item 1. Fix for the first: move the token to
   `api/session.ts` (or pass it in).
3. **Upward import.** `utils/format.ts` imports `components/PriceTag.tsx` just for
   `CURRENCY`. Fix: move the constant down into `utils/` (or a `config.ts`).
   *Found by the analyzer, not planted on purpose:* PriceTag imports `formatMoney` from
   format, so this upward import also closes a third cycle — the same fix removes it.
4. **Heavy package on the first load.** `three` is imported statically by `ProductPage`
   but only used after "View in 3D". Fix: `await import('three')` inside `open3dViewer`.
5. **A barrel.** `components/index.ts` re-exports 6 components; the page pulls all of them
   through it. Fix: import the components directly.
6. **Dead code.** `components/OldBanner.tsx` and `utils/legacyMath.ts` are never imported.
7. **A grab-bag util.** `utils/helpers.ts` mixes formatting with analytics and reaches into
   the store; split `track` into `api/analytics.ts`.

A good /optimize plan fixes 1–4 first (they change behaviour or load time), then 5–7, and
re-measures after each: cycles 3 → 0, ProductPage fan-in 4 → 1 (only App), three off the first load.
