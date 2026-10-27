# .planning/ — Sleipnir Planning data (do not hand-edit)

This folder is the live backing store for this project's Planning graph in
Sleipnir. Anything written here in the right shapes shows up as real nodes and
tabs automatically — no restart, no manual refresh — whatever wrote it.

Don't hand-edit these files. The id/slug/edge shapes are easy to get subtly
wrong: a plan's `nodeIds` only ever *references* node ids that live in
notes.json, so a plan written with a description and `nodeIds: []` renders as a
named tab containing nothing. Use the bundled CLI, which needs only Node:

  node .sleipnir/plan.mjs create-plan --root . --label "My plan" [--total-steps N]
  node .sleipnir/plan.mjs create-node --root . --plan-id <id> --label "Step" \
      --description "What this step does"

See AGENTS.md at the project root for the full workflow, propose-file, and the
exact data shapes.

Files:
  plans.json    Named plan tabs. nodeIds only ever *reference* ids in notes.json.
  notes.json    Real graph node content (drafts, scaffolds, AI plan steps).
  stages.json   Per-node sprint-stage tags ({ [nodeId]: 'proposed'|'in-progress'|'in-review'|'completed' }).
  archive.json  Archived/hidden node ids.
