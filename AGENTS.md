<!-- BEGIN SLEIPNIR v4 — generated, edits inside are overwritten -->
## Planning with Sleipnir

This project's plans live in `.planning/` and render as a live graph in Sleipnir.
Anything written there in the shapes below becomes real nodes and tabs
automatically — no restart, no refresh — whatever wrote it: Sleipnir's own UI, its
in-app AI chat, or a terminal agent like you.

**Do not hand-edit `plans.json`, `notes.json` or `stages.json`.** The id, slug and
edge shapes are easy to get subtly wrong. In particular, a plan's `nodeIds` only ever
*references* node ids — it never holds step content itself. Writing a plan with a
hand-written description and `nodeIds: []` produces a named tab with zero nodes, which
is the most common way this goes wrong.

Use the bundled CLI instead. It needs Node and nothing else — no install step, no
`package.json`, and Sleipnir does not have to be running:

    node .sleipnir/plan.mjs detect-project --root .
    node .sleipnir/plan.mjs create-plan --root . --label "My plan" [--total-steps N] [--temporary]
    node .sleipnir/plan.mjs create-node --root . --plan-id <id> \
        --label "Step name" --description "What this step does" \
        [--file <path>:<role>[:<language>]]... [--edits <path1,path2>] [--after <stepId|none>]

`detect-project` prints the project's languages (`primary`, `languages`), any it can
see but can't scaffold (`unsupported`), and layout hints (`conventions.srcDir`). Plan
in that language and that layout.

`create-plan` prints the new plan's id. Pass it as `--plan-id` to every `create-node`
so the steps land on that plan's own tab. Steps also always land in Sleipnir's shared
"AI" review tab, grouped by plan id, so a human can review and approve each one
from either place.

Pass `--total-steps` when you know the count up front: Sleipnir then shows a real
N-of-M progress bar and a definitive completion moment. Harmless to omit.

### Order

Steps are drawn as a sequence in the order you create them. `--after <stepId>`
inserts a step after an earlier one instead (later steps shift down);
`--after none` leaves a step unlinked, for work that can happen in parallel.
`--parent-id <nodeId>` nests a step under another.

### Planned files

`--file <path>:<role>[:<language>]` declares a NEW file the step will create. Repeat it
once per file. Use the file's **real project path** following the detected layout
(e.g. `src/features/cart/cartView.tsx`) — never a path under `.planning/`, and never
a path that already exists (those go in `--edits`).

- Roles: `node`, `view`, `view-model`, `interface`, `controller`, `presenter`.
  Name sibling files of one feature `<name><Role>` (`cartView.tsx`, `cartViewModel.tsx`)
  and Sleipnir links them the way the architecture implies: a View imports its
  ViewModel/Controller/Presenter, a ViewModel imports its Interface.
- Language comes from the extension (`.tsx` react, `.ts` typescript, `.rs` rust,
  `.py` python, `.go` go, `.js` javascript, `.html`, `.css`), else the detected
  primary language.

A planned file is a **placeholder**: nothing is written to disk. When a human approves
the step in Sleipnir, Sleipnir generates the files and wires their imports.

`--edits a,b` lists EXISTING files the step will change, so they are highlighted in
the architecture view.

### plan.md

Every plan gets `.planning/<plan>/plan.md`, one section per step, regenerated as steps
are written. Anything written under the title, or between a step's `/step-meta` and
`/step` markers, is kept.

### Proposing a file with its full content (legacy)

    node .sleipnir/plan.mjs propose-file --root . --plan-id <id> --label "Step name" \
        --description "What this file does" --file-path <workspace-relative-path> \
        --content-file <path-to-a-file-with-the-content|-> [--links <nodeId1,nodeId2>]

Stages one new file's complete content on a step for review — also never written until
a human saves it. Prefer `create-node --file`, which lets Sleipnir generate the file
from the project's own templates.

### If `.sleipnir/plan.mjs` is missing

Write the JSON yourself, in exactly these shapes. `.planning/plans.json` is a bare
array; `.planning/notes.json` is `{ "nodes": [], "edges": [] }`.

A plan in `plans.json`:

    {
      "id": "plan/<slug>-<epochMillis>",
      "label": "My plan",
      "nodeIds": ["plan/my-plan-1700000000000/first-step-1700000000001"],
      "createdAt": 1700000000000,
      "expectedSteps": 3
    }

A step in `notes.json`'s `nodes` (`order` is its 1-based position in the plan):

    {
      "id": "plan/<planSlug>/<stepSlug>-<epochMillis>",
      "label": "Step name",
      "kind": "proposed",
      "map": "claude",
      "type": "plan-step",
      "description": "What this step does",
      "status": "draft",
      "planId": "plan/my-plan-1700000000000",
      "order": 1
    }

A new file a step will create (a placeholder — never write the real file):

    {
      "id": "planned/<planSlug>/src/cart/cartView.tsx",
      "label": "cartView.tsx",
      "kind": "proposed",
      "map": "claude",
      "type": "planned-file",
      "planned": true,
      "planId": "plan/my-plan-1700000000000",
      "stepId": "<the step's id>",
      "filePath": "src/cart/cartView.tsx",
      "role": "view",
      "language": "react"
    }

Edges in `notes.json`'s `edges`:

- step order: `{ "source": "<previousStepId>", "target": "<stepId>", "kind": "sequence" }`
- step to its planned file, or parent to nested step: `{ "source": "<stepId>", "target": "<id>", "kind": "plan-step" }`
- a planned file importing another: `{ "source": "<viewId>", "target": "<viewModelId>", "kind": "borrows" }`

A slug is the label lowercased with every run of non-alphanumeric characters
replaced by `-` and leading/trailing `-` trimmed. Step ids embed the plan's slug
with any leading `plan/` stripped, so they read `plan/my-plan-.../step-...`, never
`plan/plan/...`. Every step id ends in `Date.now()`.

The rule worth repeating: a plan's `nodeIds` must list ids that actually exist in
`notes.json` — its steps and their planned files. A plan whose `nodeIds` is `[]`
renders as a named tab with nothing in it.

### Files in `.planning/`

| File | Holds |
| --- | --- |
| `plans.json` | Named plan tabs. `nodeIds` only ever *references* ids in `notes.json`. |
| `notes.json` | The real node content — drafts, scaffolds, plan steps, planned files. |
| `stages.json` | Per-node sprint stage tags (`proposed`, `in-progress`, …). |
| `archive.json` | Archived/hidden node ids. |
| `<plan>/plan.md` | A plan's readable document, generated from `notes.json`. |

## Designing on the Sleipnir Canvas

This project has Canvas boards in `.components/.boards/`: visual designs that
Sleipnir renders and turns into real code. `/frame` and `/component` mean "design
this on the board", not "write source files by hand".

Build designs with the bundled CLI — it needs only Node, and Sleipnir shows the
result live:

    node .sleipnir/canvas.mjs spec-help                 # the spec format, with an example
    node .sleipnir/canvas.mjs list-boards --root .
    node .sleipnir/canvas.mjs build --root . --spec <file|-> [--board <name|id>] [--component <Name>] [--svg]

A spec is one JSON object, the root frame: nested frames with `layout` ("vertical",
"horizontal", "grid" or "free"), `gap`, `padding`, `align`, `justify`, plus `text`,
`rect`, `ellipse` and `image` nodes, painted with `fill` ("#hex" or a theme token such
as `bg-2`, `text-1`, `border-1`), `stroke`, `radius` and `shadow`. Run `spec-help` for all of it.

`--component <Name>` asks Sleipnir to make the result a component and write its React
code into `.components/<name>/<name>.tsx` (`--svg`: an SVG component, shapes only). The
code is generated by Sleipnir from the board — do not write that file yourself, and
never hand-edit `.components/.boards/*.json`.

Design like a product designer: size the root like the real thing (1440 wide for a
desktop page, 390 for mobile), prefer stacks with gap and padding over free x/y (they
become real flex layouts in the code), use the theme tokens unless asked for specific
colors, and write real copy.

## Sleipnir: optimize

`/optimize` improves the project's structure, or one feature's speed, from
measurements rather than guesses. The bundled analyzer maps every import (TypeScript,
JavaScript, Python, Go, Rust) with nothing but Node:

    node .sleipnir/analyze.mjs report  --root . [--feature "<words>"] [--scope <dir>] [--goal "<text>"]
    node .sleipnir/analyze.mjs file    --root . <path>       # importers, imports, blast radius
    node .sleipnir/analyze.mjs feature --root . "<words>"    # the files that make up a feature

The report stays a few thousand tokens on any project — read it instead of the source
tree, then open only the files its findings name. It lists import loops, imports that
point up the layers (a util importing a component), pages imported as libraries, heavy
packages on the first load, hubs, files doing too much, barrels, misplaced and unused
files, and hotspots (changed often, and big or widely imported). Sleipnir's Planning graph draws the
same numbers in its HEALTH view.
<!-- END SLEIPNIR -->
