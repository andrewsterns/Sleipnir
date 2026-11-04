<!-- sleipnir:plan — generated from .planning/notes.json. Write freely under the title and between a step's /step-meta and /step markers; everything else is regenerated. -->
# Agent focus, skills and steering

See where agents work and how they use their skills, set statuses from what they do, and help them at the moments that matter — without spending their tokens.
<!-- /plan-meta -->

<!-- steps -->

## 1. A corner box where the agent is working
<!-- step:plan/agent-focus-skills-and-steering-1793628654923/a-corner-box-where-the-agent-is-working-1793628654990 -->
**Status:** Done — Corner-bracket box (FocusBox.tsx): white where the agent looks, blue where it works, blinking where it is now; testing is blue with a quick box, no orange

Replace the trail's glows and the orange testing tone with one mark: four corner brackets (⌜⌝⌞⌟) drawn as an SVG box around the node the agent is on, blinking while it's there — white while it reads, searches or thinks, blue while it edits or runs tests (a quicker blink for tests) — fading over a few seconds once it moves on. A step being tested keeps its blue ring with the box blinking around it, so the graph stays blue and white. SVG paths rather than font glyphs: they scale with the node, stay crisp at any zoom, and cost four short paths per box.

**Files**
- `src/00_planning/graph/FocusBox.tsx` — view (react)

**Edits**
- `src/00_planning/graph/GraphCanvas.tsx`
- `src/00_planning/graph/agentTrail.ts`
- `src/00_planning/graph/nodeTone.ts`
- `src/00_planning/PlanningView.tsx`
- `src/00_themes/tactical.css`
- `src/00_themes/light.css`
<!-- /step-meta:plan/agent-focus-skills-and-steering-1793628654923/a-corner-box-where-the-agent-is-working-1793628654990 -->

<!-- /step:plan/agent-focus-skills-and-steering-1793628654923/a-corner-box-where-the-agent-is-working-1793628654990 -->

## 2. The trail sees skills and instructions
<!-- step:plan/agent-focus-skills-and-steering-1793628654923/the-trail-sees-skills-and-instructions-1793628655081 -->
**Status:** Done — Trail records skills (slash commands by name only, the Skill tool, the vendored CLIs), instruction reads, prompts and session starts; still silent

Record which skill and which instructions an agent is acting on, still at no token cost: a UserPromptSubmit hook notes a slash command's name (/plan, /optimize, a user's own — never the prompt's text), PreToolUse notes Claude Code's Skill tool, commands that run the vendored CLIs (plan.mjs, canvas.mjs, analyze.mjs) count toward their skill, and reads of AGENTS.md, CLAUDE.md or a skill file become 'instruction' lines. The in-app agent's slash commands land the same way.

**Edits**
- `tools/agentSkills/vendor/trail.mjs`
- `tools/agentSkills/vendor/trail.test.ts`
- `tools/agentSkills/scaffold.mjs`
- `electron/agentTrail.cjs`
- `src/00_planning/graph/types.ts`
<!-- /step-meta:plan/agent-focus-skills-and-steering-1793628654923/the-trail-sees-skills-and-instructions-1793628655081 -->

<!-- /step:plan/agent-focus-skills-and-steering-1793628654923/the-trail-sees-skills-and-instructions-1793628655081 -->

## 3. Statuses from the trail
<!-- step:plan/agent-focus-skills-and-steering-1793628654923/statuses-from-the-trail-1793628931956 -->
**Status:** Done — Edits set a step in progress, test runs set testing, passing tests then moving on or stopping set done (reports by auto); agents now only mark completed with a note

Set step statuses from what agents already do, so they don't spend turns reporting: in progress at the first edit to a step's planned or listed files, testing when a test command runs, done when tests pass after the step's last edit (a commit settles it, as now). Agents report only what can't be inferred — which step, when a file belongs to two, and a one-line note; their report or your toggle always wins over an inference.

**Edits**
- `src/00_planning/graph/agentTrail.ts`
- `tools/sleipnir-backend.mjs`
- `tools/agentSkills/registry.mjs`
<!-- /step-meta:plan/agent-focus-skills-and-steering-1793628654923/statuses-from-the-trail-1793628931956 -->

<!-- /step:plan/agent-focus-skills-and-steering-1793628654923/statuses-from-the-trail-1793628931956 -->

## 4. Every skill each agent has
<!-- step:plan/agent-focus-skills-and-steering-1793628654923/every-skill-each-agent-has-1793628655167 -->
**Status:** Done — tools/skillScan.mjs: built-ins plus Claude, Codex and Gemini skills and commands, merged by name, with agents, CLIs driven, writes and token cost; instruction files per agent

One scan of the skills the agents in this project can run: Sleipnir's built-ins (registry.mjs) and the user's own in Claude Code (.claude/commands, .claude/skills/*/SKILL.md), Codex (.codex/prompts) and Gemini (.gemini/commands). For each: name, description, file, which agents have it, the CLIs and tools it drives, the folders it writes, and its size in tokens. Frontmatter plus a search for known commands — cheap, cached, read like the other planning data.

**Files**
- `tools/skillScan.mjs` — node (javascript)
- `tools/skillScan.test.ts` — node (typescript)

**Edits**
- `tools/sleipnir-backend.mjs`
- `electron/main.cjs`
- `electron/preload.cjs`
- `src/00_planning/api/PlatformAPI.ts`
- `src/00_planning/api/webApi.ts`
- `src/00_planning/api/sleipnirApi.ts`
- `vite.config.ts`
<!-- /step-meta:plan/agent-focus-skills-and-steering-1793628654923/every-skill-each-agent-has-1793628655167 -->

<!-- /step:plan/agent-focus-skills-and-steering-1793628654923/every-skill-each-agent-has-1793628655167 -->

## 5. SKILLS next to Architecture
<!-- step:plan/agent-focus-skills-and-steering-1793628654923/skills-next-to-architecture-1793628655245 -->
**Status:** Done — SKILLS mode beside Architecture: agents, instruction files, skills, CLIs and what they touch; used skills white, unused faint; corner box follows the trail

A SKILLS mode in the tab's toggle (ARCHITECTURE | SKILLS | HEALTH | PLAN ONLY), drawn by the same graph: the agents, the instruction files they load, their skills, the CLIs and tools each skill drives, and what those touch (.planning, boards, the analyzer, code). The trail runs here too — the corner box lands on the skill in use and the instruction being read, links thicken with the paths agents actually take, and skills nobody uses fade. Watching it shows how an agent gets from your request to the code.

**Files**
- `src/00_planning/graph/skillGraph.ts` — node (typescript)
- `src/00_planning/graph/skillGraph.test.ts` — node (typescript)

**Edits**
- `src/00_planning/graph/composePlanView.ts`
- `src/00_planning/PlanningView.tsx`
- `src/00_planning/PlanningView.ViewModel.tsx`
<!-- /step-meta:plan/agent-focus-skills-and-steering-1793628654923/skills-next-to-architecture-1793628655245 -->

<!-- /step:plan/agent-focus-skills-and-steering-1793628654923/skills-next-to-architecture-1793628655245 -->

## 6. Edit and add skills from the graph
<!-- step:plan/agent-focus-skills-and-steering-1793628654923/edit-and-add-skills-from-the-graph-1793628655330 -->
**Status:** Done — Skill card with editable instructions (own skills save to their file, built-ins to a .sleipnir/skills override written for every agent) and a + SKILL form writing each agent's format

Select a skill and its card shows what it does, which agents have it, its token cost and its text, editable in place; saving writes the skill's own file. New skill: name, description, instructions and which agents get it — Sleipnir writes each agent's format through the same emitters as the built-ins. Changing a built-in writes a project override (.sleipnir/skills/<id>.md) that the scaffolder merges, so updates never overwrite it. Replaces steps 5 and 6 of 'Planning as agent diagnostics'.

**Files**
- `src/00_planning/skills/SkillCard.tsx` — view (react)
- `src/00_planning/skills/SkillCard.ViewModel.tsx` — view-model (react)
- `src/00_planning/skills/NewSkillModal.tsx` — view (react)
- `src/00_planning/skills/NewSkillModal.ViewModel.tsx` — view-model (react)

**Edits**
- `tools/agentSkills/scaffold.mjs`
- `tools/agentSkills/emitters/index.mjs`
- `tools/agentSkills/registry.mjs`
- `tools/sleipnir-backend.mjs`
<!-- /step-meta:plan/agent-focus-skills-and-steering-1793628654923/edit-and-add-skills-from-the-graph-1793628655330 -->

<!-- /step:plan/agent-focus-skills-and-steering-1793628654923/edit-and-add-skills-from-the-graph-1793628655330 -->

## 7. Where the agent's effort went
<!-- step:plan/agent-focus-skills-and-steering-1793628654923/where-the-agent-s-effort-went-1793628655412 -->
**Status:** Done — Effort report from the trail (rereads, fix loops, search streaks, reads before first edit, effort per file): EFFORT toggle draws heat plus a panel; agents read it with analyze.mjs trail; shell reads now count as reads

A report computed from the trail, at no token cost: per step and per session — reads per edit, files read again and again, searches whose results went unused, files read but never touched, edit-test-edit loops, time per step, and attention outside the step's files. Drawn as effort heat on the architecture (where the agent's time went) with a short list beside it, and readable by agents through `analyze.mjs trail`, so /optimize can tune its own process as well as the code.

**Files**
- `src/00_planning/graph/trailInsights.ts` — node (typescript)
- `src/00_planning/graph/trailInsights.test.ts` — node (typescript)
- `src/00_planning/TrailInsightsPanel.tsx` — view (react)
- `src/00_planning/TrailInsightsPanel.ViewModel.tsx` — view-model (react)

**Edits**
- `src/00_planning/PlanningView.tsx`
- `src/00_planning/graph/GraphCanvas.tsx`
- `tools/agentSkills/vendor/analyze.mjs`
<!-- /step-meta:plan/agent-focus-skills-and-steering-1793628654923/where-the-agent-s-effort-went-1793628655412 -->

<!-- /step:plan/agent-focus-skills-and-steering-1793628654923/where-the-agent-s-effort-went-1793628655412 -->

## 8. Steer the agent at the moments that matter
<!-- step:plan/agent-focus-skills-and-steering-1793628654923/steer-the-agent-at-the-moments-that-matter-1793628655516 -->
**Status:** Done — FOCUS HERE / DON'T TOUCH on any file's card for the step in progress (read by agents in list-steps and plan.md); flags for avoided files, edit-fail loops, off-step edits and long read streaks in the caption and step card

Make helping cheap: mark a node 'focus' or 'avoid' for the step in progress, straight from the graph — written onto the step and handed to the agent in list-steps and plan.md, like comments. Sleipnir raises the moments worth a look, from the trail: work outside the step's files, the same file edited over and over while tests keep failing, a long stretch of reading with no edit. The flag shows on the step and in the caption; your comment back is the next thing the agent reads.

**Files**
- `src/00_planning/graph/steering.ts` — node (typescript)
- `src/00_planning/graph/steering.test.ts` — node (typescript)

**Edits**
- `tools/planDoc.mjs`
- `tools/agentSkills/vendor/plan.mjs`
- `tools/sleipnir-backend.mjs`
- `src/00_planning/ActivityPanel.tsx`
- `src/00_planning/PlanningView.tsx`
<!-- /step-meta:plan/agent-focus-skills-and-steering-1793628654923/steer-the-agent-at-the-moments-that-matter-1793628655516 -->

<!-- /step:plan/agent-focus-skills-and-steering-1793628654923/steer-the-agent-at-the-moments-that-matter-1793628655516 -->

## 9. Experiment: does the map help agents debug?
<!-- step:plan/agent-focus-skills-and-steering-1793628654923/experiment-does-the-map-help-agents-debug-1793628655598 -->
**Status:** Done — Benchmark built and run twice (17 runs, $6.89): on these small challenges the map didn't change success (Go CI fix 100% everywhere, menu 3 of 4 causes everywhere); /optimize cut detours to 0 but cost 40-70% more

A repeatable benchmark on the optimize lab's planted problems (context-menu-lag, react-shop, py-orders, go-inventory, rust-engine) plus seeded bugs with failing tests. Headless Claude Code at the same effort, three runs per condition: plain; Sleipnir's slim instructions with the analyzer map; and /optimize. Measured: whether the cause was found and fixed, turns, tokens, cost, and — from the trail — wrong files read before the right one. Results append to a history file, so every change to instructions, skills or the map shows whether agents got faster or slower over time.

**Files**
- `tools/optimizeLab/bench/runBench.mjs` — node (javascript)
- `tools/optimizeLab/bench/benchReport.mjs` — node (javascript)
<!-- /step-meta:plan/agent-focus-skills-and-steering-1793628654923/experiment-does-the-map-help-agents-debug-1793628655598 -->

<!-- /step:plan/agent-focus-skills-and-steering-1793628654923/experiment-does-the-map-help-agents-debug-1793628655598 -->
