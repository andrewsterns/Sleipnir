// The one canonical definition of every "skill" Sleipnir teaches an external AI
// agent, and the single source the per-agent scaffolding files are rendered
// from (see ./emitters/, driven by ./scaffold.mjs).
//
// Deliberately the same shape as electron/chat.cjs's TOOL_DEFS: one
// provider-neutral definition, one small translator per target. There it aims
// at LLM tool-call schemas; here it aims at agent CLIs, each of which wants the
// same instructions in its own file format:
//
//   AGENTS.md                     the cross-agent standard (~30 agents read it)
//   CLAUDE.md                     Claude Code, which reads only CLAUDE.md
//   GEMINI.md                     Gemini CLI
//   .claude/commands/plan.md      Claude Code slash command   (md + frontmatter)
//   .codex/prompts/plan.md        Codex CLI slash command     (md + frontmatter)
//   .gemini/commands/plan.toml    Gemini CLI slash command    (TOML)
//
// Writing the instructions once here is the whole point: the same trust-boundary
// rule is already restated by hand in six places across this repo (the four
// TOOL_DEFS descriptions, sleipnir-plan.mjs's header and HELP, .agent/RULES.md,
// ARCHITECTURE.md §8, and PlanningView.tsx's runtime prompt strings), and they
// drift. New scaffolding should not add a seventh.

import { LANGUAGES } from './vendor/languages.mjs'

// Bumped whenever any emitted content changes. Stamped into the managed block
// markers and .sleipnir/scaffold.json so scaffold.mjs can tell "this project is
// on an older template" from "a human edited this" without diffing prose.
// v2: detect-project, ordered steps (--after), planned files (--file/--edits), plan.md.
// v3: /frame and /component, and the vendored canvas CLI.
// v4: /optimize, and the vendored architecture analyzer.
// v5: the language table, vendored beside the CLIs that read it.
// v6: slim AGENTS.md (references move into their skills), testing status, comments.
// v7: /model and /sketch, and the vendored model commands.
// v8: /model is /sculpt (Claude Code has its own /model), and builds go in one batch.
export const SCAFFOLD_VERSION = 8

// Where the vendored CLI lands, relative to the project root. Relative on
// purpose: the emitted files are committed and cloned by people who have never
// installed Sleipnir, so an absolute path to this machine's install would break
// on every other machine. This is the bug that made the whole feature
// necessary — see tools/sleipnir-backend.mjs's PLAN_CLI_PATH.
export const PLAN_CLI = '.sleipnir/plan.mjs'

// The design CLI, vendored beside it (tools/agentSkills/vendor/canvas.mjs).
export const CANVAS_CLI = '.sleipnir/canvas.mjs'

// The architecture analyzer (vendor/analyze.mjs) and the graph core it shares
// with the app (vendor/graphCore.mjs), which it imports from beside it.
export const ANALYZE_CLI = '.sleipnir/analyze.mjs'
export const GRAPH_CORE = '.sleipnir/graphCore.mjs'
// The language table (vendor/languages.mjs) the analyzer imports from beside it.
export const LANGUAGES_LIB = '.sleipnir/languages.mjs'
// The agent-trail hook (vendor/trail.mjs) and the file it appends to.
export const TRAIL_CLI = '.sleipnir/trail.mjs'
export const TRAIL_FILE = '.planning/trail.jsonl'
// The model commands (vendor/model.mjs, built from src/modeling/commands/ by buildModelCli.mjs).
export const MODEL_CLI = '.sleipnir/model.mjs'

// Emitters replace this with their own target's argument placeholder.
export const ARGS_TOKEN = '{{ARGS}}'

// The extensions planned files may use, from the language table: the one each
// scaffoldable language writes, e.g. "\`.tsx\` react".
const PLANNABLE_EXTENSIONS = LANGUAGES.filter((l) => l.planning && l.id !== 'jquery')
  .map((l) => `\`.${l.extensions[0]}\` ${l.id}`)
  .join(', ')

// Shapes an agent needs when the vendored CLI isn't there to write them
// correctly. Kept as prose rather than generated from the backend because it is
// documentation of a wire format, and being slightly stale is better than being
// absent — a guessing agent is exactly what produces a named plan tab with zero
// nodes in it.
const FALLBACK_SHAPES = `### If \`${PLAN_CLI}\` is missing

Write the JSON yourself, in exactly these shapes. \`.planning/plans.json\` is a bare
array; \`.planning/notes.json\` is \`{ "nodes": [], "edges": [] }\`.

A plan in \`plans.json\`:

    {
      "id": "plan/<slug>-<epochMillis>",
      "label": "My plan",
      "nodeIds": ["plan/my-plan-1700000000000/first-step-1700000000001"],
      "createdAt": 1700000000000,
      "expectedSteps": 3
    }

A step in \`notes.json\`'s \`nodes\` (\`order\` is its 1-based position in the plan):

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

Edges in \`notes.json\`'s \`edges\`:

- step order: \`{ "source": "<previousStepId>", "target": "<stepId>", "kind": "sequence" }\`
- step to its planned file, or parent to nested step: \`{ "source": "<stepId>", "target": "<id>", "kind": "plan-step" }\`
- a planned file importing another: \`{ "source": "<viewId>", "target": "<viewModelId>", "kind": "borrows" }\`

A slug is the label lowercased with every run of non-alphanumeric characters
replaced by \`-\` and leading/trailing \`-\` trimmed. Step ids embed the plan's slug
with any leading \`plan/\` stripped, so they read \`plan/my-plan-.../step-...\`, never
\`plan/plan/...\`. Every step id ends in \`Date.now()\`.

The rule worth repeating: a plan's \`nodeIds\` must list ids that actually exist in
\`notes.json\` — its steps and their planned files. A plan whose \`nodeIds\` is \`[]\`
renders as a named tab with nothing in it.`

// The full planning reference: loaded with /plan, never in every session.
const PLAN_REFERENCE = `This project's plans live in \`.planning/\` and render as a live graph in Sleipnir.
Anything written there in the shapes below becomes real nodes and tabs
automatically — no restart, no refresh — whatever wrote it: Sleipnir's own UI, its
in-app AI chat, or a terminal agent like you.

**Do not hand-edit \`plans.json\`, \`notes.json\` or \`stages.json\`.** The id, slug and
edge shapes are easy to get subtly wrong. In particular, a plan's \`nodeIds\` only ever
*references* node ids — it never holds step content itself. Writing a plan with a
hand-written description and \`nodeIds: []\` produces a named tab with zero nodes, which
is the most common way this goes wrong.

Use the bundled CLI instead. It needs Node and nothing else — no install step, no
\`package.json\`, and Sleipnir does not have to be running:

    node ${PLAN_CLI} detect-project --root .
    node ${PLAN_CLI} create-plan --root . --label "My plan" [--total-steps N] [--temporary]
    node ${PLAN_CLI} create-node --root . --plan-id <id> \\
        --label "Step name" --description "What this step does" \\
        [--file <path>:<role>[:<language>]]... [--edits <path1,path2>] [--after <stepId|none>]

\`detect-project\` prints the project's languages (\`primary\`, \`languages\`), any it can
see but can't scaffold yet (\`unsupported\`), and layout hints (\`conventions.srcDir\`,
\`includeDir\`, and \`sourceDirs\` per language, e.g. \`src/main/java\`). Plan in that
language and that layout — in a mixed repo, each folder in its own language.

\`create-plan\` prints the new plan's id. Pass it as \`--plan-id\` to every \`create-node\`
so the steps land on that plan's own tab. Steps also always land in Sleipnir's shared
"AI" review tab, grouped by plan id, so a human can review and approve each one
from either place.

Pass \`--total-steps\` when you know the count up front: Sleipnir then shows a real
N-of-M progress bar and a definitive completion moment. Harmless to omit.

### Order

Steps are drawn as a sequence in the order you create them. \`--after <stepId>\`
inserts a step after an earlier one instead (later steps shift down);
\`--after none\` leaves a step unlinked, for work that can happen in parallel.
\`--parent-id <nodeId>\` nests a step under another.

### Planned files

\`--file <path>:<role>[:<language>]\` declares a NEW file the step will create. Repeat it
once per file. Use the file's **real project path** following the detected layout
(e.g. \`src/features/cart/cartView.tsx\`) — never a path under \`.planning/\`, and never
a path that already exists (those go in \`--edits\`).

- Roles: \`node\`, \`view\`, \`view-model\`, \`interface\`, \`controller\`, \`presenter\`.
  Name sibling files of one feature \`<name><Role>\` (\`cartView.tsx\`, \`cartViewModel.tsx\`)
  and Sleipnir links them the way the architecture implies: a View imports its
  ViewModel/Controller/Presenter, a ViewModel imports its Interface.
- Language comes from the extension (${PLANNABLE_EXTENSIONS}), else the detected
  primary language.
- In C and C++ a role is a header plus a source: plan both (\`sensor_view.h\` and
  \`sensor_view.c\`, same role); the source includes its header. An Interface is the
  header alone. File names follow the language: snake_case for C, C++, Rust, Python
  and Go, PascalCase for Java, Kotlin, Swift and C#, camelCase for the JS family.

A planned file is a **placeholder**: nothing is written to disk. When a human approves
the step in Sleipnir, Sleipnir generates the files and wires their imports.

\`--edits a,b\` lists EXISTING files the step will change, so they are highlighted in
the architecture view.

### Reporting progress

When you carry out a plan — yours or one already in \`.planning/\` — keep it as your
working todo list, so the plan shows what you are actually doing. Sleipnir's graph
shows each step's status live, and the human watches it to follow your work:

    node ${PLAN_CLI} list-steps --root . [--plan-id <id>]
    node ${PLAN_CLI} set-status --root . --step <stepId> --status in_progress
    node ${PLAN_CLI} set-status --root . --step <stepId> --status testing
    node ${PLAN_CLI} set-status --root . --step <stepId> --status completed --note "What you did, in one line"

A step is \`pending\`, \`in_progress\`, \`testing\` or \`completed\` — your own todo list's
states, plus testing; Sleipnir shows them as Proposed, In progress, Testing and Done.
Set one step \`in_progress\` when you start it, only one at a time, \`testing\` while you
run its tests, and \`completed\` the moment it is done, not in a batch at the end. \`--note\` is one line of what you did; it shows
on the step's card and in plan.md. \`list-steps\` prints every step's id and status,
to pick up where a plan left off.

Sleipnir records every file created, changed or deleted between a step going
\`in_progress\` and \`completed\`, and shows them on the step with their diffs. So mark
a step \`in_progress\` **before** you touch its files, and complete it before you start
the next — otherwise its changes land on the wrong step.

### plan.md

Every plan gets \`.planning/<plan>/plan.md\`, one section per step with its status,
regenerated as steps are written and reported on. Anything written under the title,
or between a step's \`/step-meta\` and \`/step\` markers, is kept.

### Proposing a file with its full content (legacy)

    node ${PLAN_CLI} propose-file --root . --plan-id <id> --label "Step name" \\
        --description "What this file does" --file-path <workspace-relative-path> \\
        --content-file <path-to-a-file-with-the-content|-> [--links <nodeId1,nodeId2>]

Stages one new file's complete content on a step for review — also never written until
a human saves it. Prefer \`create-node --file\`, which lets Sleipnir generate the file
from the project's own templates.

${FALLBACK_SHAPES}

### Files in \`.planning/\`

| File | Holds |
| --- | --- |
| \`plans.json\` | Named plan tabs. \`nodeIds\` only ever *references* ids in \`notes.json\`. |
| \`notes.json\` | The real node content — drafts, scaffolds, plan steps, planned files. |
| \`stages.json\` | Per-node status: \`pending\`, \`in_progress\`, \`testing\` or \`completed\`. |
| \`archive.json\` | Archived/hidden node ids. |
| \`<plan>/plan.md\` | A plan's readable document, generated from \`notes.json\`. |
| \`<plan>/activity.json\` | What agents reported on the plan's steps: notes, and the files each step changed. |`

// The imperative form, rendered into each agent's slash-command file. Separate
// from PLAN_CONTEXT because the jobs differ: context is ambient and describes
// the system, a command is invoked once and says what to do now.
const PLAN_COMMAND = `The user wants a plan for: ${ARGS_TOKEN}

Draft it into Sleipnir's Planning graph: an ordered set of reviewable steps, each
declaring the files it will create or change, placed in the project's real architecture.

1. Learn the project before planning:

       node ${PLAN_CLI} detect-project --root .

   Then explore enough of the codebase to ground the plan in what is actually there —
   the folder layout, naming, and the existing files the work touches. A plan that
   names real files and follows the project's own structure is worth reviewing; a
   generic one is not.
2. Decide the steps, in order, before writing any of them, so you know the count.
   For each step decide which NEW files it creates (real project paths, in the
   detected language, sibling role files named \`<name><Role>\`) and which EXISTING
   files it edits.
3. Create the plan. It prints an id — use that id for every step:

       node ${PLAN_CLI} create-plan --root . --label "<short plan name>" --total-steps <N> \\
           --description "<what the plan is for, in a sentence or two>"

4. Create each step in order:

       node ${PLAN_CLI} create-node --root . --plan-id <id> \\
           --label "<step name>" --description "<what this step does and why>" \\
           --file <path>:<role> --edits <existing1,existing2>

   Repeat \`--file\` once per new file; omit \`--file\`/\`--edits\` when a step has none.
   Steps chain in creation order; use \`--after <stepId>\` to insert elsewhere or
   \`--after none\` for independent work.
5. Report the plan id, the steps in order with their files, and that the plan is
   waiting for review in Sleipnir's Planning graph (and in \`.planning/<plan>/plan.md\`).

Constraints:

- Do not write \`.planning/*.json\` or \`plan.md\` directly. Use the CLI.
- Do not create or edit real source files. Planned files are placeholders; Sleipnir
  writes them only after a human approves the step.
- Never plan a file under \`.planning/\`.
- Use one plan id for the whole plan, or the steps scatter across tabs.`

// Canvas design — /frame and /component. One context for both (rendered into
// AGENTS.md once); each command says what to do now.
const CANVAS_REFERENCE = `This project has Sketch documents in \`.components/.boards/\`: 2D designs that
Sleipnir renders and turns into real code. \`/sketch\` (or \`/frame\`, the same thing) and
\`/component\` mean "design this in a Sketch", not "write source files by hand". \`build\`
only writes to Sketch documents — 3D scenes are Environments, built with \`/sculpt\`, which
can place a finished Sketch onto a plane or a part's face.

Build designs with the bundled CLI — it needs only Node, and Sleipnir shows the
result live:

    node ${CANVAS_CLI} spec-help                 # the spec format, with an example
    node ${CANVAS_CLI} list-boards --root .
    node ${CANVAS_CLI} build --root . --spec <file|-> [--board <name|id>] [--component <Name>] [--svg]

A spec is one JSON object, the root frame: nested frames with \`layout\` ("vertical",
"horizontal", "grid" or "free"), \`gap\`, \`padding\`, \`align\`, \`justify\`, plus \`text\`,
\`rect\`, \`ellipse\` and \`image\` nodes, painted with \`fill\` ("#hex" or a theme token such
as \`bg-2\`, \`text-1\`, \`border-1\`), \`stroke\`, \`radius\` and \`shadow\`. Run \`spec-help\` for all of it.

\`--component <Name>\` asks Sleipnir to make the result a component and write its React
code into \`.components/<name>/<name>.tsx\` (\`--svg\`: an SVG component, shapes only). The
code is generated by Sleipnir from the board — do not write that file yourself, and
never hand-edit \`.components/.boards/*.json\`.

Design like a product designer: size the root like the real thing (1440 wide for a
desktop page, 390 for mobile), prefer stacks with gap and padding over free x/y (they
become real flex layouts in the code), use the theme tokens unless asked for specific
colors, and write real copy.`

const FRAME_COMMAND = `The user wants this designed as a Sketch: ${ARGS_TOKEN}

1. Read the spec format: \`node ${CANVAS_CLI} spec-help\`.
2. Design ONE root frame for it — a page is one frame with nested sections. Size it
   like the real thing and lay it out with vertical/horizontal stacks, gap and padding.
3. Write the spec to a temporary JSON file (or pipe it) and build it:

       node ${CANVAS_CLI} build --root . --spec <file>

4. Report the Sketch and frame it landed on. It stays an editable design; the user can
   refine it in Sleipnir and turn it into code there. Do not write source files.`

const MODEL_COMMAND = `The user wants this sculpted in 3D: ${ARGS_TOKEN}

1. See what's here: \`node ${MODEL_CLI} list --root .\`, and \`node ${MODEL_CLI} help\` for every
   command and flag. Use the Environment they name, or make one with \`env create\`.
2. Work out real sizes in meters before the first command, and which part stands on which.
3. Write the whole build as one batch, a command per line, ending with \`describe\`, and run it:
   \`node ${MODEL_CLI} batch --root . --env <name> --file <path>\`. It's all or nothing: a line
   that fails names itself and nothing is written, so fix that line and run it again.
4. Compare describe's numbers with what was asked — size, where it stands, which way faces
   point — and fix what's off, in one more batch. Look at the numbers, not at screenshots.
5. Report the parts you made and anything you couldn't. Never hand-edit the board JSON.`

const MODEL_REFERENCE = `Words: an **Environment** is a 3D scene. A **Sketch** is a 2D drawing: a document of its
own (design it with \`/sketch\`), or a shape standing on a plane. A **Part** is what's built
from sketches by **Features** (Extrude 1, Revolve 2). **Place** puts a Sketch document in an
Environment, linked, so edits to it show there; **Unlink** makes that copy local. A Sketch
is drawn at 100 px to the meter, so give \`place --width <m>\` to size a design for its surface.

Space: meters, Y up, the ground at Y = 0. The Sketch layer's own px are 100 to the meter.
Extrudes go out of a plane's front:

    Front   faces +Z    --at x,y is scene X, Y
    Top     faces +Y    --at x,y is scene X, -Z (its up points away)
    Side    faces +X    --at x,y is scene -Z, Y (its right points away)

Recipes — a starter first when one fits (\`starter --shape box\`, then \`move\` it: starters land
1 m wide, beside what's there):

    box        rect on Top, extruded (from the ground up)
    cylinder   circle (--shape ellipse) on Top, extruded
    sphere     circle on Front, revolved about its center
    cone       triangle (--shape polygon --sides 3) on Front, revolved about its center
    custom     --shape path --points "x,y x,y …" (meters), then extrude or revolve

Stacking: stand a sketch on a face (\`--plane "Base: end"\`) and it rides along when that
face moves. \`describe\` prints faces by the names commands take (end, start, side 2,
"Extrude 2 end").

Moving: \`move\` carries a whole part and keeps its sketch on its plane. Turning is
counterclockwise looking down the axis at the origin, about the part's middle unless
\`--about x,y,z\` names a hinge: a lid lying flat opens with \`--turn x,-100 --about <back edge>\`.
Scaling is about the middle too, so give \`--about\` on the ground to keep a part standing on it.

Changing: \`feature\` sets a feature's numbers, \`edit --pull\` pushes or pulls a flat face,
\`extrude --part --face\` grows new material out of one, \`resize\` changes a sketch. A refusal
says why and what to do instead.

Not built yet: subtract and intersect show as added, and lofts don't build. Each extrude
makes its own part, so cut-outs have to be drawn into the outline.`

const COMPONENT_COMMAND = `The user wants this built as a component: ${ARGS_TOKEN}

1. Read the spec format: \`node ${CANVAS_CLI} spec-help\`.
2. Design it as ONE root frame — the component's own box, laid out with stacks, gap and
   padding — and pick a PascalCase component name.
3. Build it as a component (add \`--svg\` for an icon or illustration made only of shapes):

       node ${CANVAS_CLI} build --root . --spec <file> --component <Name>

4. Report it. Sleipnir turns it into a component and writes the React code into
   \`.components/<name>/<name>.tsx\` as soon as the board is open — do not write that file
   yourself.`

// /optimize — architecture and feature performance, measured rather than guessed.
const OPTIMIZE_REFERENCE = `\`/optimize\` improves the project's structure, or one feature's speed, from
measurements rather than guesses. The bundled analyzer maps every import (TypeScript,
JavaScript, Python, Go, Rust, C, C++, Java, Kotlin, Swift, C#) with nothing but Node:

    node ${ANALYZE_CLI} report  --root . [--feature "<words>"] [--scope <dir>] [--goal "<text>"]
    node ${ANALYZE_CLI} file    --root . <path>       # importers, imports, blast radius
    node ${ANALYZE_CLI} feature --root . "<words>"    # the files that make up a feature

The report stays a few thousand tokens on any project — read it instead of the source
tree, then open only the files its findings name. It lists import loops, imports that
point up the layers (a util importing a component), pages imported as libraries, heavy
packages on the first load, hubs, files doing too much, barrels, misplaced and unused
files, and hotspots (changed often, and big or widely imported). Sleipnir's Planning graph draws the
same numbers in its HEALTH view.`

const OPTIMIZE_COMMAND = `The user wants this optimized: ${ARGS_TOKEN}

1. Measure first. If they named a feature ("my right click menu", "checkout"):

       node ${ANALYZE_CLI} report --root . --feature "<their words>" --goal "<what they want>"

   otherwise the whole project:

       node ${ANALYZE_CLI} report --root .

   Read the report, then only the files it points at.
2. Find the cause. Structure problems (import loops, upward imports, a page used as a
   library, a heavy package loaded eagerly) are in the report. Runtime cost (re-renders,
   state held too high, work repeated per item, O(n²) loops, blocking I/O, missing
   memoization or virtualization) is in the feature's own files — read them for it.
3. Before moving, splitting or deleting a file, see what it touches:
   \`node ${ANALYZE_CLI} file --root . <path>\`.
4. Propose the fix as a Sleipnir plan (the /plan flow above, \`--edits\` for existing
   files, \`--file\` for new ones): one step per change, the ones that change behaviour
   or load time first, each saying what it fixes and which number should move
   (cycles 3 → 0, fan-in 4 → 1, three off the first load).
5. Only if the user asked you to apply it: one step at a time — mark it in progress
   (\`node ${PLAN_CLI} set-status --root . --step <stepId> --status in_progress\`), change,
   run the tests, re-run the report, confirm the number moved, then mark it completed
   with a note naming the number. Stop and say so if a step makes anything worse.
6. Finish with the before and after numbers.`

// What AGENTS.md carries — loaded into every session of every agent, so it
// holds only what an agent needs before it knows it's doing Sleipnir work: the
// commands that keep the plan live, the two rules agents break unprompted, and
// where the rest lives. Everything else ships in the skill that uses it (the
// *_REFERENCE texts, appended to each command) or in the CLI's --help, and
// costs nothing until it's used. About 500 tokens, from about 3,100.
const PLAN_CONTEXT = `Plans live in \`.planning/\` and show live in Sleipnir's graph. Never hand-edit
\`.planning/*.json\`: a plan's \`nodeIds\` only references node ids, and hand-written
plans end up as empty tabs. Use the CLI (Node only, Sleipnir needn't be running):

    node ${PLAN_CLI} list-steps --root . [--plan-id <id>]
    node ${PLAN_CLI} set-status --root . --step <id> --status in_progress|testing|completed [--note "one line"]
    node ${PLAN_CLI} comment --root . --step <id> --text "..."
    node ${PLAN_CLI} create-plan --root . --label "..."   # then create-node; /plan has the details
    node ${PLAN_CLI} --help

When you work on a plan's step, read it in \`list-steps\` first — people's comments,
status changes and the files they want you to focus on or avoid are there. Sleipnir sets it in progress when you edit its
files and testing when you run tests, and records what it changes. When it's done,
mark it \`completed\` with a one-line note; use \`set-status\` for anything else only
to name your step when steps share files, or to correct one. To draft a new plan,
follow \`/plan\`.`

const CANVAS_CONTEXT = `2D designs live in Sketch documents in \`.components/.boards/\`; Sleipnir turns them
into code. "Design this" means \`/sketch\` (an editable design; \`/frame\` is the same) or
\`/component\` (a component Sleipnir writes the code for), built with \`node ${CANVAS_CLI}\`.
Never hand-edit the board JSON or the code Sleipnir generates from it.`

const OPTIMIZE_CONTEXT = `Before changing a project's structure or chasing a slow feature, measure:
\`node ${ANALYZE_CLI} report --root . [--feature "<words>"]\` maps every import in a few
thousand tokens — read it instead of the source tree. \`/optimize\` has the full method.`

const MODEL_CONTEXT = `3D scenes are Environments in \`.components/.boards/\`, built with \`node ${MODEL_CLI}\`
(\`help\` lists the commands; \`describe\` reads a scene back in a few hundred tokens). "Model
this" means \`/sculpt\`. Never hand-edit the board JSON.`

// Appended to each skill's own instructions, after a rule.
const withReference = (command, reference) => `${command}\n\n---\n\n${reference}`

export const SKILLS = [
  {
    id: 'plan',
    description: "Draft an ordered, architecture-aware plan into Sleipnir's Planning graph.",
    argumentHint: '<what to plan>',
    context: PLAN_CONTEXT,
    command: withReference(PLAN_COMMAND, PLAN_REFERENCE),
  },
  {
    id: 'sketch',
    description: 'Design something in a Sketch document as editable frames.',
    argumentHint: '<what to design>',
    context: CANVAS_CONTEXT,
    command: withReference(FRAME_COMMAND, CANVAS_REFERENCE),
  },
  {
    id: 'frame',
    description: 'The same as /sketch: design something as editable frames.',
    argumentHint: '<what to design>',
    // Shares /sketch's context — AGENTS.md carries it once.
    context: '',
    command: withReference(FRAME_COMMAND, CANVAS_REFERENCE),
  },
  {
    id: 'component',
    description: 'Design a component on the Canvas board; Sleipnir writes its code.',
    argumentHint: '<what to build>',
    // Shares /frame's context — AGENTS.md carries it once.
    context: '',
    command: withReference(COMPONENT_COMMAND, CANVAS_REFERENCE),
  },
  {
    id: 'sculpt',
    description: 'Build or change a 3D scene: parts, sketches on planes, moves. Checks its work with describe.',
    argumentHint: '<what to sculpt>',
    context: MODEL_CONTEXT,
    command: withReference(MODEL_COMMAND, MODEL_REFERENCE),
  },
  {
    id: 'optimize',
    description: "Measure the project's architecture or one feature, and plan the fixes.",
    argumentHint: '[feature or goal]',
    context: OPTIMIZE_CONTEXT,
    command: withReference(OPTIMIZE_COMMAND, OPTIMIZE_REFERENCE),
  },
]

export function skillById(id) {
  const skill = SKILLS.find((s) => s.id === id)
  if (!skill) throw new Error(`Unknown skill: ${id}`)
  return skill
}
