<!-- sleipnir:plan — generated from .planning/notes.json. Write freely under the title and between a step's /step-meta and /step markers; everything else is regenerated. -->
# Watching agents think

Watch agents instead of asking them to report: slimmer instructions, comments they read, a silent trail of every tool call, and that trail drawn on the graph.
<!-- /plan-meta -->

<!-- steps -->

## 1. Slim the always-loaded instructions
<!-- step:plan/watching-agents-think-1793384229139/slim-the-always-loaded-instructions-1793384229196 -->
**Status:** Done — AGENTS.md ~3,100 to ~500 tokens; the reference text now loads with its skill (/plan, /frame, /component, /optimize)

AGENTS.md costs about 3,100 tokens in every session. Keep only what every session needs there (the plan CLI's commands, reporting progress, where to read what people said) and move the rest where it loads only when used: planned-file rules into /plan, Canvas into /frame and /component, analyzer detail into /optimize, the rest into the CLI's --help. Target: about 500 tokens.

**Edits**
- `tools/agentSkills/registry.mjs`
- `tools/agentSkills/vendor/plan.mjs`
<!-- /step-meta:plan/watching-agents-think-1793384229139/slim-the-always-loaded-instructions-1793384229196 -->

<!-- /step:plan/watching-agents-think-1793384229139/slim-the-always-loaded-instructions-1793384229196 -->

## 2. What people say on a node, agents read
<!-- step:plan/watching-agents-think-1793384229139/what-people-say-on-a-node-agents-read-1793384229271 -->
**Status:** Done — Card comments and status changes by you land in activity.json, plan.md and list-steps; CLI comment command for agents

A status set or a comment written on a step's card reaches the agent exactly as its own reports do: it's in the plan's activity log, in plan.md under the step, and in list-steps — which agents are told to read before they work a step. A comment box on the step card; a comment command in the CLI for agents to answer.

**Edits**
- `tools/planDoc.mjs`
- `tools/sleipnir-backend.mjs`
- `src/00_planning/ActivityPanel.tsx`
<!-- /step-meta:plan/watching-agents-think-1793384229139/what-people-say-on-a-node-agents-read-1793384229271 -->

<!-- /step:plan/watching-agents-think-1793384229139/what-people-say-on-a-node-agents-read-1793384229271 -->

## 3. The agent trail: watch, not report
<!-- step:plan/watching-agents-think-1793384229139/the-agent-trail-watch-not-report-1793384229347 -->
**Status:** Done — Silent Claude Code hook (.sleipnir/trail.mjs, registered in .claude/settings.local.json) and the in-app agent write .planning/trail.jsonl; file watching sends other agents' edits

Record what agents do without spending their tokens: a silent Claude Code hook logs every tool call (reads, edits, commands) to .planning/trail.jsonl, the in-app agent logs its own tool calls there, and file-system watching covers any other agent's edits. Git-ignored, capped, per session.

**Files**
- `tools/agentSkills/vendor/trail.mjs` — node (javascript)

**Edits**
- `tools/agentSkills/scaffold.mjs`
- `electron/chat.cjs`
- `electron/planningWatcher.cjs`
<!-- /step-meta:plan/watching-agents-think-1793384229139/the-agent-trail-watch-not-report-1793384229347 -->

<!-- /step:plan/watching-agents-think-1793384229139/the-agent-trail-watch-not-report-1793384229347 -->

## 4. The trail on the graph
<!-- step:plan/watching-agents-think-1793384229139/the-trail-on-the-graph-1793384229471 -->
**Status:** Done — Reads glow, edits pulse blue, tests flash orange on what was changed, a dashed line follows the last stops, and a caption says what the agent is doing

The agent's path through the network, live: files it reads glow briefly, files it edits pulse blue, files its tests run flash orange, and a fading line follows the order it went — the visible shape of the agent's thinking.

**Files**
- `src/00_planning/graph/agentTrail.ts` — node (typescript)
- `src/00_planning/useAgentTrail.ts` — node (typescript)

**Edits**
- `src/00_planning/graph/GraphCanvas.tsx`
- `src/00_planning/PlanningView.ViewModel.tsx`
<!-- /step-meta:plan/watching-agents-think-1793384229139/the-trail-on-the-graph-1793384229471 -->

<!-- /step:plan/watching-agents-think-1793384229139/the-trail-on-the-graph-1793384229471 -->

## 5. Measure: tokens with and without watching
<!-- step:plan/watching-agents-think-1793384229139/measure-tokens-with-and-without-watching-1793384229550 -->
**Status:** Done — Slim instructions: $0.28 to $0.21 on the test task; trail hook on vs off: same context per turn, within run-to-run noise

**Comments**
- you: Compare against the earlier current-medium baseline too
- claude: Done: compared with the earlier current-medium run too (old instructions $0.281 vs slim $0.213-0.216).

Re-run the same headless Claude Code task with the slim instructions and the trail hook on and off, at the same effort, and report what each costs — the target is no added tokens for watching.
<!-- /step-meta:plan/watching-agents-think-1793384229139/measure-tokens-with-and-without-watching-1793384229550 -->

<!-- /step:plan/watching-agents-think-1793384229139/measure-tokens-with-and-without-watching-1793384229550 -->
