<!-- BEGIN SLEIPNIR v6 — generated, edits inside are overwritten -->
## Planning with Sleipnir

Plans live in `.planning/` and show live in Sleipnir's graph. Never hand-edit
`.planning/*.json`: a plan's `nodeIds` only references node ids, and hand-written
plans end up as empty tabs. Use the CLI (Node only, Sleipnir needn't be running):

    node .sleipnir/plan.mjs list-steps --root . [--plan-id <id>]
    node .sleipnir/plan.mjs set-status --root . --step <id> --status in_progress|testing|completed [--note "one line"]
    node .sleipnir/plan.mjs comment --root . --step <id> --text "..."
    node .sleipnir/plan.mjs create-plan --root . --label "..."   # then create-node; /plan has the details
    node .sleipnir/plan.mjs --help

When you work on a plan's step, read it in `list-steps` first — people's comments,
status changes and the files they want you to focus on or avoid are there. Sleipnir sets it in progress when you edit its
files and testing when you run tests, and records what it changes. When it's done,
mark it `completed` with a one-line note; use `set-status` for anything else only
to name your step when steps share files, or to correct one. To draft a new plan,
follow `/plan`.

## Designing on the Sleipnir Canvas

Visual designs live on Canvas boards in `.components/.boards/`; Sleipnir turns them
into code. "Design this" means `/frame` (an editable design) or `/component` (a
component Sleipnir writes the code for), built with `node .sleipnir/canvas.mjs`. Never
hand-edit the board JSON or the code Sleipnir generates from it.

## Sleipnir: optimize

Before changing a project's structure or chasing a slow feature, measure:
`node .sleipnir/analyze.mjs report --root . [--feature "<words>"]` maps every import in a few
thousand tokens — read it instead of the source tree. `/optimize` has the full method.
<!-- END SLEIPNIR -->
