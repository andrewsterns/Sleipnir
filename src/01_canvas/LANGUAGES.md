# Canvas: multi-language emit

Staged plan for emitting canvas components in languages other than React.

## Context

The canvas can already *describe* a component in any language — `CanvasComponent.target`
exists (`model/types.ts`), the dropdown that sets it exists (`panels/CreateComponentModal.tsx`),
and a board has no language of its own, so heterogeneous boards are already legal documents.

What's missing is that **`target` is dead data.** `CanvasView.ViewModel.tsx` imports
`emitRegionBody`/`emitComponentFile` unconditionally from `./emit/react`, and
`componentFileName` hardcodes `.tsx`. Every component is React no matter what the
dropdown says. That's the gap this plan closes.

### The two questions this answers

- **Several components, several languages, one board?** Already expressible today —
  `target`, `componentRoot`, and `filePath` are all per-component and `CanvasDoc` has no
  board-level language. Purely emit-side work. Phase 1.
- **One component, several languages?** *Not* expressible. `target`, `filePath`, `sync`,
  `ejectReason`, and `lastWrittenHash` are singular scalars on `CanvasComponent`. Needs
  those five folded into an `outputs[]` array, a schema bump, and a migration. Phase 2.

Phase 1 first: it forces the emitter registry and the parameterized region sentinel into
existence, and both are prerequisites for Phase 2 anyway.

---

## Ground rule

After Stage 2, **nothing outside `emit/` may import `emit/react.ts`.** Two files do today
(`CanvasView.ViewModel.tsx`, `panels/CreateComponentModal.tsx`). That single rule is the
test of whether the seam is real.

---

## Stage 1 — Parameterize the region sentinel (land alone, first)

`emit/region.ts` hardcodes `//` comment syntax in both the markers and the two regexes.
Its own header calls it "the load-bearing safety module of the whole sync feature — a bug
here silently eats someone's code," so it changes by itself, in its own commit, before any
emitter needs it.

```ts
export type CommentStyleId = 'line-slash' | 'block-slash' | 'html'
```

A **closed id union**, never a caller-supplied `{open, close}` object — that makes it
structurally impossible to feed user text into a regex. Compile the four values
(`open`, `close`, `openRe`, `closeRe`) once at module level, escaping regex metacharacters
in `/*`, `*/`, `<!--`, `-->`. Omit the trailing-close group from the pattern entirely when
`close === ''` rather than leaving it optional.

Backward compatibility is the whole design: the parameter is **last and defaults to
`'line-slash'`** on all four exports (`extractRegion`, `buildRegion`, `spliceRegion`,
`hasRegionFor`). Every existing call site and every `.tsx` already on disk keeps working
untouched.

Style is **supplied by the emitter, never sniffed** from the file. A `//` sentinel in a
`.html` file must not be treated as a region — splicing `//` markers into markup produces
visible garbage.

**Consequence to implement in the same stage:** `target` becomes immutable once
`filePath` is set, or the recorded style and the file can disagree. Disable the Inspector's
TARGET control when `component.filePath` exists, reason inline.

**Gate:** `emit/region.test.ts` must pass **completely unmodified**. If one assertion needs
editing, the default-parameter design is wrong — revert the change, not the test.

New: `emit/region.styles.test.ts` — every existing scenario replayed per style via
`describe.each`; cross-style negatives (wrong style → `null`, never a partial match); a
round-trip property test over bodies containing `//`, `/*`, `*/`, `<!--`, `<sleipnir:layout`,
blank lines and mixed indent; and an explicit assertion that **the hash is
style-independent** (`lastWrittenHash` covers the region body, which never contains the
comment markers).

---

## Stage 2 — Emitter registry, React only (pure refactor, zero behavior change)

**`emit/CanvasEmitter.ts`** (new) — the interface, plus `RenderedFile` and `EmitContext`
moved out of `react.ts`:

```ts
export interface CanvasEmitter {
  readonly target: CanvasTarget
  readonly ext: string            // must equal extForLanguage(target)
  readonly comment: CommentStyleId
  readonly indent: string         // Swift is 4, not 2
  readonly caveat?: string        // shown beside an available-but-partial target
  fileName(name: string): string
  symbol(name: string): string
  apiPreview(component: CanvasComponent): string   // the modal's "export const X · XProps" line
  emitRegionBody(component: CanvasComponent, ctx: EmitContext): string
  collectImports(component: CanvasComponent, ctx: EmitContext): string[]  // [] is legal
  emitComponentFile(component: CanvasComponent, ctx: EmitContext, regionHash: string): RenderedFile
}
```

`fileName`/`symbol`/`indent` sit on the interface rather than being derived centrally
because Swift breaks both the repo's file-naming rule (`Card.swift`) and its indent width.
The interface is where that divergence gets declared instead of special-cased later.

**`emit/naming.ts`** (new) — the genuinely shared half: `componentSymbol`,
`componentFileName(name, target)` (built on the existing, currently-unused
`extForLanguage` from `00_planning/graph/naming.ts` — this is what finally wires it in),
`componentClassName` for HTML/CSS, and `propsInterfaceName` flagged JS-family-only.

**`emit/registry.ts`** (new) — `findEmitter(target)` returning `null`, `emitterFor(target)`
throwing `NoEmitterError`, and `AVAILABLE_TARGETS` derived from the registered set.
**There is no fallback emitter, ever** — emitting React into a file the user asked to be
HTML is worse than emitting nothing.

Rewrite `emit/targets.ts` to derive `CANVAS_TARGETS` from `LANGUAGES` × the registry
instead of hand-maintaining `AVAILABLE_TARGETS` beside it. Keep the `UNAVAILABLE_REASON`
prose (it's user-facing and honest) and add a **drift-guard test**: `available XOR
unavailableReason` for every entry.

Delete on the way through: `relativeSpecifier` (`react.ts`) is a duplicate of the tested
`relativeImportPath` in `model/paths.ts` — extend that one with `keepExtension?` (Vue needs
it) and drop the copy. `emitForComponent` is dead.

**Dispatch — the answer differs per site, deliberately:**

| Site | Missing emitter | Why |
|---|---|---|
| `approveComponent` | **throw** | First real write; `CreateComponentModal.submit()` already catches, shows the message inline, and stays open — zero new UI. Must reject so `onClose()` is skipped. |
| `pushComponent` | **return** `'no-emitter'` / `'style-mismatch'` | Already returns a discriminated result the view surfaces; a throw would abort remaining components in any batch path. Grep `'detached'` for non-exhaustive switches before widening. |
| `dirtyComponentIds` | **`continue`** | No emitter → can never be pushed → can never be dirty. Same shape as the existing `!filePath` skip. Never throw inside a `useMemo`. |

Also in this stage, because Phase 1 is unreachable without it: **wire the Inspector's
TARGET dropdown**, which is a literal no-op today (`defaultValue="react"`, empty
`onChange`). Without it every component is React because the control does nothing.

**Independent of all of this, ship it now:** `parseDoc` (`model/store.ts`) rebuilds the doc
field-by-field and silently **drops `componentFolders`** — live data loss today (create a
folder, reload, it's gone). Fix the field (spread first, then override defaults) *and* the
mechanism, with a round-trip test asserting every key of a fully-populated `CanvasDoc`
survives `serializeDoc` → `parseDoc`. Every new field added later depends on this.

---

## Stage 3 — HTML (the proving target)

HTML is the right second emitter precisely because it's the awkward one: it forces the
`<!-- -->` sentinel, forces `componentFileName` off `.tsx`, and forces `collectImports` to
be allowed to return `[]`. Vue would let all three stay accidentally React-shaped while
looking like progress.

- **One file, inline `style=""`.** Reuse `templates/index.ts`'s `renderHtml` document shape
  so the two scaffolders agree; region inside `<body>`, with `<head>`/`<script>`/anything
  outside the markers human-owned. A bare fragment wouldn't open in a browser, which is the
  one thing HTML is good for.
- **New derivation `cssDeclarations(css)` goes in `model/toCss.ts`**, not a new file — it
  belongs beside the derivation it serializes so exactly one module knows the CSS
  vocabulary. Two fidelity-critical rules: camelCase → kebab-case, and **numbers need `px`
  appended** (React's `style` prop does that implicitly; a raw attribute does not), with the
  unitless exception list mirroring React's (`opacity`, `flexGrow`, `flexShrink`,
  `fontWeight`, `lineHeight`, `zIndex`, `order`). `toCss.ts` has **no test file today** —
  add one here.
- **Variants:** every variant as a sibling root, all but the default carrying `hidden` plus
  `data-sleipnir-variant="…"`. HTML has no conditional; nothing is lost and three lines of
  the user's own JS makes it live.
- **Nested instances are inlined** (`collectImports() === []`). Two things to say out loud
  in the emitter header: instancing does *not* survive into HTML the way `types.ts` promises
  for React, and inlining needs a **cycle guard** the React emitter never did — reuse
  `MAX_INSTANCE_DEPTH` from `board/CanvasNodeView.tsx`, or a cyclic instance graph
  infinite-loops inside a `useMemo`. Consumers going dirty when an inlined child changes
  already works for free (`dirtyComponentIds` hashes the inlined body) — assert it.
- **Preview is exact, for free** — board divs and emitted divs carry the same `toCss` output.
- **CSS stays unavailable**, reason updated: it's emitted inline here, and a standalone
  stylesheet is a multi-file component, i.e. Phase 2. Also drop `'css'` from `CanvasTarget`
  — a stylesheet with no markup isn't a component. It stays in `LANGUAGES`, so it still
  shows as disabled-with-reason, which is all it ever did.

**Acceptance test for the whole phase:** one board, two components, one React and one HTML,
both approved and pushed, each file carrying its own sentinel style, `dirtyComponentIds`
tracking both.

---

## Stage 4 — Vue

Costs a new `LanguageId` (`'vue'`, ext `vue`) in `00_planning/graph/architectures.ts`, which
produces compile errors at exactly two exhaustive fan-outs — a feature, not a cost:
`templates/index.ts`'s `renderContent` switch, and `importAdapters/index.ts`'s
`Record<LanguageId, …>` (→ `tsxAdapter`; SFCs use ES imports).

- **Sentinel is `'html'`, not `'line-slash'`** — the region lives inside `<template>`. This
  is the subtle one: a `.vue` file has two comment syntaxes and the region is in the markup
  half. Write `//` there and it renders as visible page text. Assert it in a test.
- Variants become real branching (`v-if`/`v-else-if`/`v-else`) and instances real
  composition — `import Card from './card.vue'`, **extension retained**, which is what
  `relativeImportPath`'s `keepExtension` flag is for.
- `:style="{ … }"` takes a camelCase JS object, so `styleLiteral`/`quote` from `react.ts` are
  reusable — extract them to `emit/jsLiteral.ts` *here*, at the second consumer, not earlier.
- Preview exact, for free (same `CssProps`).
- **Highlighting:** no `@codemirror/lang-vue` installed, and `codeEditorLanguages.ts` returns
  `[]` for unknown extensions, so a `.vue` file opens editable-but-plain — graceful, not
  broken. Map `vue → html()` with **no new dependency** first; add the real package only if
  it looks visibly wrong. While here, **collapse the duplicate ext→language maps** in
  `codeEditorLanguages.ts` and `importAdapters/index.ts` (the latter's own comment admits the
  duplication) — a third target turns that into real drift.

---

## Stage 5 — Swift / SwiftUI (the expensive one)

Everything above is a lowering of the same `CanvasStyle` IR. Swift is not.

- New `LanguageId` `'swift'`; `importAdapters` → `null` (no per-file import for same-module
  types). `fileName()` returns `Card.swift` (PascalCase), knowingly diverging from
  `naming.ts`'s claim of one rule across all languages. Sentinel `'line-slash'`, indent 4.
- Variants become a real Swift `enum` + `switch` — *better* than the TS union. Requires a
  keyword list: `default` is reserved and needs backticks.
- **`emit/toSwiftUI.ts` is a brand-new derivation, not a serialization of `toCss.ts`.**
  `flow` → `VStack`/`HStack`/`LazyVGrid`/`ZStack`; `fills` → `.background()`; stroke
  `position: inside|outside|center` has **no** direct equivalent; per-corner radius needs a
  custom `Shape`; `w: 'hug'` → *no modifier at all*; freeform absolute → `ZStack` +
  `.offset()` (**not** `.position()`, which uses center coordinates — a classic
  off-by-half-the-size bug); `justify: 'around'` has no equivalent; `ColorRef` tokens become
  `Color("bg-2")` asset references the user's catalog doesn't contain. Budget this as roughly
  `toCss.ts` + `react.ts` combined, with its own exhaustive test suite.
- **The honesty bill.** `CanvasNodeView.tsx` renders CSS divs, so the board shows the *CSS*
  lowering, not the SwiftUI one. They will disagree on stroke position, per-corner radius,
  `space-around`, `hug` beside an `.infinity` sibling, and text metrics. `model/types.ts`
  currently claims "one IR, one design-time renderer, N pure emitters… WYSIWYG is exact and
  free" — **that claim becomes false when Swift lands, and the header must be amended.**
  Ship only with a visible *"approximate preview (SwiftUI)"* badge on the board (a badge, not
  a doc note) and a documented divergence list in the emitter header.
- Highlighting: no CM6 Swift grammar exists. Leave `.swift` unhighlighted; do **not**
  approximate with `lang-javascript` (Swift's `func`/`let`/interpolation mishighlight
  badly). `@codemirror/legacy-modes` ships a `StreamLanguage` Swift mode if it's needed.

---

## Phase 2 — One component, many languages

Only after ≥2 real emitters exist and it's clear what actually varies between them.

```ts
export interface CanvasComponentOutput {
  target: CanvasTarget
  filePath?: string
  sync: ComponentSyncState
  ejectReason?: string
  /** Per-FILE region hashes, keyed by path — one target may own several files (html + css). */
  lastWrittenHashes?: Record<string, string>
}
// CanvasComponent.outputs: CanvasComponentOutput[]   // non-empty; [0] is primary
```

`CANVAS_SCHEMA_VERSION` → `2`, with a forward migration in `parseDoc` folding the five
legacy scalars into `outputs[0]`. The migration **must be idempotent** on an already-v2 doc
— that's the single most important test. A migrated doc must also stop claiming `version: 1`.

`emitComponentFile` widens to `emitFiles(): EmittedFile[]`, `emitRegionBody` to
`emitRegions(): {path, body, comment}[]`.

**Same-target-wins for imports:** `EmitContext` gains `target`, and `filePathFor` becomes
`(componentId, target)`. Never import a `.swift` from a `.tsx` — if the instanced component
has no output for the emitting file's target, omit the import and emit a
`// missing <target> output for <name>` marker at the call site. Surface it in the UI through
a separate `emitter.lintComponent()`, **not** by widening `emitRegionBody`'s return type —
that would ripple straight into the hash.

Downstream widenings: `store.ts`'s `componentFilePaths` → `flatMap`; `componentTree.ts` →
one leaf per output (a react+swift component correctly appears twice); `dirtyComponentIds`
keyed per file path; `approveComponent` approves one output at a time; `pushComponent` loops.
`useCanvasComponentPaths` and `stages.ts` need no change (per-file status is arguably more
correct).

---

## Verification

Per stage, in order:

1. `npx tsc -p tsconfig.app.json --noEmit` — clean. (`tsc -p tsconfig.json` is a no-op here.)
2. `npx vitest run src/01_canvas` — and for Stage 1 specifically, confirm
   `emit/region.test.ts` was not modified: `git diff --stat src/01_canvas/emit/region.test.ts`
   must be empty.
3. `npx vitest run` — full suite.
4. Real app, per emitter stage: `npm run electron:dev`, draw a frame, CREATE COMPONENT,
   pick the new language, APPROVE, then open the written file in the Workspace tab and
   confirm the sentinel comment style matches the file type. Then edit the frame and
   UPDATE COMPONENT, and confirm hand-written content outside the region survived
   byte-for-byte. (`ELECTRON_RUN_AS_NODE` must be unset in the launching shell, or Electron
   starts as plain Node and `app` is undefined.)
