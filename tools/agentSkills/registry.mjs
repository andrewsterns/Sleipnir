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

// Bumped whenever any emitted content changes. Stamped into the managed block
// markers and .sleipnir/scaffold.json so scaffold.mjs can tell "this project is
// on an older template" from "a human edited this" without diffing prose.
// v2: detect-project, ordered steps (--after), planned files (--file/--edits), plan.md.
// v3: /frame and /component, and the vendored canvas CLI.
export const SCAFFOLD_VERSION = 3

// Where the vendored CLI lands, relative to the project root. Relative on
// purpose: the emitted files are committed and cloned by people who have never
// installed Sleipnir, so an absolute path to this machine's install would break
// on every other machine. This is the bug that made the whole feature
// necessary — see tools/sleipnir-backend.mjs's PLAN_CLI_PATH.
export const PLAN_CLI = '.sleipnir/plan.mjs'

// The design CLI, vendored beside it (tools/agentSkills/vendor/canvas.mjs).
export const CANVAS_CLI = '.sleipnir/canvas.mjs'

// Emitters replace this with their own target's argument placeholder.
export const ARGS_TOKEN = '{{ARGS}}'

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

// Persistent context — rendered into AGENTS.md and pointed at from CLAUDE.md and
// GEMINI.md. Loaded in every session, so it earns its length by covering the
// things an agent gets wrong unprompted, and nothing else.
const PLAN_CONTEXT = `This project's plans live in \`.planning/\` and render as a live graph in Sleipnir.
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
see but can't scaffold (\`unsupported\`), and layout hints (\`conventions.srcDir\`). Plan
in that language and that layout.

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
- Language comes from the extension (\`.tsx\` react, \`.ts\` typescript, \`.rs\` rust,
  \`.py\` python, \`.go\` go, \`.js\` javascript, \`.html\`, \`.css\`), else the detected
  primary language.

A planned file is a **placeholder**: nothing is written to disk. When a human approves
the step in Sleipnir, Sleipnir generates the files and wires their imports.

\`--edits a,b\` lists EXISTING files the step will change, so they are highlighted in
the architecture view.

### plan.md

Every plan gets \`.planning/<plan>/plan.md\`, one section per step, regenerated as steps
are written. Anything written under the title, or between a step's \`/step-meta\` and
\`/step\` markers, is kept.

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
| \`stages.json\` | Per-node sprint stage tags (\`proposed\`, \`in-progress\`, …). |
| \`archive.json\` | Archived/hidden node ids. |
| \`<plan>/plan.md\` | A plan's readable document, generated from \`notes.json\`. |`

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

       node ${PLAN_CLI} create-plan --root . --label "<short plan name>" --total-steps <N>

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
const CANVAS_CONTEXT = `This project has Canvas boards in \`.components/.boards/\`: visual designs that
Sleipnir renders and turns into real code. \`/frame\` and \`/component\` mean "design
this on the board", not "write source files by hand".

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

const FRAME_COMMAND = `The user wants this designed on the Canvas board: ${ARGS_TOKEN}

1. Read the spec format: \`node ${CANVAS_CLI} spec-help\`.
2. Design ONE root frame for it — a page is one frame with nested sections. Size it
   like the real thing and lay it out with vertical/horizontal stacks, gap and padding.
3. Write the spec to a temporary JSON file (or pipe it) and build it:

       node ${CANVAS_CLI} build --root . --spec <file>

4. Report the board and frame it landed on. It stays an editable design; the user can
   refine it in Sleipnir and turn it into code there. Do not write source files.`

const COMPONENT_COMMAND = `The user wants this built as a component: ${ARGS_TOKEN}

1. Read the spec format: \`node ${CANVAS_CLI} spec-help\`.
2. Design it as ONE root frame — the component's own box, laid out with stacks, gap and
   padding — and pick a PascalCase component name.
3. Build it as a component (add \`--svg\` for an icon or illustration made only of shapes):

       node ${CANVAS_CLI} build --root . --spec <file> --component <Name>

4. Report it. Sleipnir turns it into a component and writes the React code into
   \`.components/<name>/<name>.tsx\` as soon as the board is open — do not write that file
   yourself.`

export const SKILLS = [
  {
    id: 'plan',
    description: "Draft an ordered, architecture-aware plan into Sleipnir's Planning graph.",
    argumentHint: '<what to plan>',
    context: PLAN_CONTEXT,
    command: PLAN_COMMAND,
  },
  {
    id: 'frame',
    description: "Design something on Sleipnir's Canvas board as editable frames.",
    argumentHint: '<what to design>',
    context: CANVAS_CONTEXT,
    command: FRAME_COMMAND,
  },
  {
    id: 'component',
    description: 'Design a component on the Canvas board; Sleipnir writes its code.',
    argumentHint: '<what to build>',
    // Shares /frame's context — AGENTS.md carries it once.
    context: '',
    command: COMPONENT_COMMAND,
  },
]

export function skillById(id) {
  const skill = SKILLS.find((s) => s.id === id)
  if (!skill) throw new Error(`Unknown skill: ${id}`)
  return skill
}
