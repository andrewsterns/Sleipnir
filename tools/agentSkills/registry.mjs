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
export const SCAFFOLD_VERSION = 1

// Where the vendored CLI lands, relative to the project root. Relative on
// purpose: the emitted files are committed and cloned by people who have never
// installed Sleipnir, so an absolute path to this machine's install would break
// on every other machine. This is the bug that made the whole feature
// necessary — see tools/sleipnir-backend.mjs's PLAN_CLI_PATH.
export const PLAN_CLI = '.sleipnir/plan.mjs'

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

A step in \`notes.json\`'s \`nodes\`:

    {
      "id": "plan/<planSlug>/<stepSlug>-<epochMillis>",
      "label": "Step name",
      "kind": "proposed",
      "map": "claude",
      "type": "plan-step",
      "description": "What this step does",
      "status": "draft",
      "planId": "plan/my-plan-1700000000000"
    }

To nest a step, add to \`notes.json\`'s \`edges\`:
\`{ "source": "<parentNodeId>", "target": "<childNodeId>", "kind": "plan-step" }\`

A slug is the label lowercased with every run of non-alphanumeric characters
replaced by \`-\` and leading/trailing \`-\` trimmed. Step ids embed the plan's slug
with any leading \`plan/\` stripped, so they read \`plan/my-plan-.../step-...\`, never
\`plan/plan/...\`. Every id ends in \`Date.now()\`.

The rule worth repeating: a plan's \`nodeIds\` must list ids that actually exist in
\`notes.json\`. A plan whose \`nodeIds\` is \`[]\` renders as a named tab with nothing
in it.`

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

    node ${PLAN_CLI} create-plan --root . --label "My plan" [--total-steps N] [--temporary]
    node ${PLAN_CLI} create-node --root . --plan-id <id> \\
        --label "Step name" --description "What this step does" [--parent-id <nodeId>]

\`create-plan\` prints the new plan's id. Pass it as \`--plan-id\` to every \`create-node\`
so the steps land on that plan's own tab. Steps also always land in Sleipnir's shared
"Claude" review tab, grouped by plan id, so a human can review and approve each one
from either place.

Pass \`--total-steps\` when you know the count up front: Sleipnir then shows a real
N-of-M progress bar and a definitive completion moment, instead of inferring you are
done from a quiet period after your last write. Harmless to omit.

### Proposing a new file as part of a step

    node ${PLAN_CLI} propose-file --root . --plan-id <id> --label "Step name" \\
        --description "What this file does" --file-path <workspace-relative-path> \\
        --content-file <path-to-a-file-with-the-content|-> [--links <nodeId1,nodeId2>]

This does **not** write the file. Nothing touches real disk until a human reviews the
content in Sleipnir and explicitly saves it — the same trust boundary the in-app AI
chat's own code generation runs under.

\`--content-file\` takes a path to a file holding the proposed content (write it there
first; a CLI flag cannot cleanly carry multi-line source with quotes and backticks in
it), or \`-\` to read from stdin. \`--links\` takes node ids you already created and draws
visible "borrows" edges to them, so a batch of proposed files shows its real import
relationships in the graph before any of them exist on disk.

\`propose-file\` accepts only paths that do not exist yet. To change a file that already
exists, edit it directly — it is already under version control and already visible.

${FALLBACK_SHAPES}

### Files in \`.planning/\`

| File | Holds |
| --- | --- |
| \`plans.json\` | Named plan tabs. \`nodeIds\` only ever *references* ids in \`notes.json\`. |
| \`notes.json\` | The real node content — drafts, scaffolds, plan steps. |
| \`stages.json\` | Per-node sprint stage tags (\`todo\`, \`blocked\`, …). |
| \`archive.json\` | Archived/hidden node ids. |`

// The imperative form, rendered into each agent's slash-command file. Separate
// from PLAN_CONTEXT because the jobs differ: context is ambient and describes
// the system, a command is invoked once and says what to do now.
const PLAN_COMMAND = `The user wants a plan for: ${ARGS_TOKEN}

Draft it into Sleipnir's Planning graph, one reviewable node per step:

1. Explore enough of the codebase to ground the plan in what is actually there.
   A plan that names real files and real functions is worth reviewing; a generic
   one is not.
2. Decide the steps before writing any of them, so you know the count.
3. Create the plan. It prints an id — use that id for every step:

       node ${PLAN_CLI} create-plan --root . --label "<short plan name>" --total-steps <N>

4. Create each step in order:

       node ${PLAN_CLI} create-node --root . --plan-id <id> \\
           --label "<step name>" --description "<what this step does and why>"

   Use \`--parent-id <nodeId>\` to nest a step under an earlier one. When a step's
   deliverable is a brand-new file, use \`propose-file\` instead so the content
   rides along for review — see AGENTS.md for its flags.
5. Report the plan id, how many steps you created, and that each one is waiting
   for review in Sleipnir's Planning graph.

Constraints:

- Do not write \`.planning/*.json\` directly. Use the CLI.
- Do not create or edit real source files. A plan step is a proposal a human
  approves; \`propose-file\` stages content without touching disk.
- Use one plan id for the whole plan, or the steps scatter across tabs.`

export const SKILLS = [
  {
    id: 'plan',
    description: "Draft a plan into Sleipnir's Planning graph, one reviewable node per step.",
    argumentHint: '<what to plan>',
    context: PLAN_CONTEXT,
    command: PLAN_COMMAND,
  },
]

export function skillById(id) {
  const skill = SKILLS.find((s) => s.id === id)
  if (!skill) throw new Error(`Unknown skill: ${id}`)
  return skill
}
