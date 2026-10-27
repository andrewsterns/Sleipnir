---
description: "Draft an ordered, architecture-aware plan into Sleipnir's Planning graph."
argument-hint: "<what to plan>"
---

The user wants a plan for: $ARGUMENTS

Draft it into Sleipnir's Planning graph: an ordered set of reviewable steps, each
declaring the files it will create or change, placed in the project's real architecture.

1. Learn the project before planning:

       node .sleipnir/plan.mjs detect-project --root .

   Then explore enough of the codebase to ground the plan in what is actually there —
   the folder layout, naming, and the existing files the work touches. A plan that
   names real files and follows the project's own structure is worth reviewing; a
   generic one is not.
2. Decide the steps, in order, before writing any of them, so you know the count.
   For each step decide which NEW files it creates (real project paths, in the
   detected language, sibling role files named `<name><Role>`) and which EXISTING
   files it edits.
3. Create the plan. It prints an id — use that id for every step:

       node .sleipnir/plan.mjs create-plan --root . --label "<short plan name>" --total-steps <N>

4. Create each step in order:

       node .sleipnir/plan.mjs create-node --root . --plan-id <id> \
           --label "<step name>" --description "<what this step does and why>" \
           --file <path>:<role> --edits <existing1,existing2>

   Repeat `--file` once per new file; omit `--file`/`--edits` when a step has none.
   Steps chain in creation order; use `--after <stepId>` to insert elsewhere or
   `--after none` for independent work.
5. Report the plan id, the steps in order with their files, and that the plan is
   waiting for review in Sleipnir's Planning graph (and in `.planning/<plan>/plan.md`).

Constraints:

- Do not write `.planning/*.json` or `plan.md` directly. Use the CLI.
- Do not create or edit real source files. Planned files are placeholders; Sleipnir
  writes them only after a human approves the step.
- Never plan a file under `.planning/`.
- Use one plan id for the whole plan, or the steps scatter across tabs.
