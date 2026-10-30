<!-- sleipnir:plan — generated from .planning/notes.json. Write freely under the title and between a step's /step-meta and /step markers; everything else is regenerated. -->
# Planning as agent diagnostics
<!-- /plan-meta -->

<!-- steps -->

## 1. One status, the agent’s: pending, in progress, completed
<!-- step:plan/planning-as-agent-diagnostics-1793301952427/one-status-the-agent-s-pending-in-progress-completed-1793301952515 -->
**Status:** Completed — Three statuses everywhere (graph, lists, card); old boards migrate on read; approving starts a step, saving its file completes it; a step in progress pulses

Planning carries two status systems today: a step’s approval (draft, approved, done) and a separate stage (proposed, in progress, in review, done), kept in step by useStatusReconciler. Replace both with the three states AI agents already track their own work in (Claude Code’s todo list, Codex and Gemini plans): pending, in progress, completed. Approval stays, but as an action (a human saying go, which marks the step in progress and lets Sleipnir write its planned files), not a fourth status. Glyphs: dashed ring, ring with a soft pulse, solid dot. Old boards migrate on read and idempotently: proposed and draft to pending, in progress, in review and approved to in progress, done to completed.

**Files**
- `src/00_planning/graph/stepStatus.ts` — node (typescript)

**Edits**
- `src/00_planning/graph/types.ts`
- `src/00_planning/graph/stages.ts`
- `src/00_planning/stagesStore.ts`
- `src/00_planning/useStatusReconciler.ts`
- `src/00_planning/PlanningView.tsx`
- `src/00_planning/graph/GraphCanvas.tsx`
- `tools/planDoc.mjs`
- `tools/sleipnir-backend.mjs`
<!-- /step-meta:plan/planning-as-agent-diagnostics-1793301952427/one-status-the-agent-s-pending-in-progress-completed-1793301952515 -->

<!-- /step:plan/planning-as-agent-diagnostics-1793301952427/one-status-the-agent-s-pending-in-progress-completed-1793301952515 -->

## 2. Agents report their progress on the plan
<!-- step:plan/planning-as-agent-diagnostics-1793301952427/agents-report-their-progress-on-the-plan-1793301952585 -->
**Status:** Completed — plan CLI set-status and list-steps, in-app update_plan_step (never needs approving), activity.json per plan, status lines in plan.md, /plan and /optimize skills updated

The plan reflects what the agent is actually doing, from the agent itself. The plan CLI gets set-status (a step id, pending, in progress or completed, and an optional one-line note of what it did), and the in-app agent an update_plan_step tool. The /plan and /optimize skills tell agents to keep the plan as their working todo list: one step in progress at a time, completed the moment it is done, with the note. The graph updates live through the planning watcher, so watching a plan is watching the agent work.

**Edits**
- `tools/agentSkills/vendor/plan.mjs`
- `tools/planDoc.mjs`
- `tools/agentSkills/registry.mjs`
- `electron/agent/tools/planning.cjs`
- `electron/agent/systemPrompt.cjs`
<!-- /step-meta:plan/planning-as-agent-diagnostics-1793301952427/agents-report-their-progress-on-the-plan-1793301952585 -->

<!-- /step:plan/planning-as-agent-diagnostics-1793301952427/agents-report-their-progress-on-the-plan-1793301952585 -->

## 3. Every AI change, recorded against its step
<!-- step:plan/planning-as-agent-diagnostics-1793301952427/every-ai-change-recorded-against-its-step-1793301952662 -->
**Status:** Completed — Each step records the files changed between starting and completing it; the card lists them with diffs and the graph links them to the step

A per-plan activity log in .planning/<plan>/activity.json: for each step, when it started and finished, which agent worked it, and every file it created, changed or deleted. The in-app agent writes its change sets there (changeSets.cjs already records them, with undo). For terminal agents Sleipnir attributes changes itself: a workspace snapshot when a step goes in progress, compared when it completes, so even an agent that never reports files is accounted for. A step’s card lists its changes with diffs, and the files light up on the architecture graph.

**Files**
- `src/00_planning/graph/activityLog.ts` — node (typescript)
- `src/00_planning/ActivityPanel.tsx` — view (react)
- `src/00_planning/ActivityPanel.ViewModel.tsx` — view-model (react)

**Edits**
- `electron/agent/changeSets.cjs`
- `tools/sleipnir-backend.mjs`
- `electron/planningWatcher.cjs`
<!-- /step-meta:plan/planning-as-agent-diagnostics-1793301952427/every-ai-change-recorded-against-its-step-1793301952662 -->

<!-- /step:plan/planning-as-agent-diagnostics-1793301952427/every-ai-change-recorded-against-its-step-1793301952662 -->

## 4. Live agent activity on the graph
<!-- step:plan/planning-as-agent-diagnostics-1793301952427/live-agent-activity-on-the-graph-1793301952796 -->
**Status:** Pending

Diagnostics in real time: while an agent works, its current step pulses, and the files it reads and writes flash on the architecture graph as it touches them, so you see where its attention is and whether it is wandering outside the plan. In-app agent tool calls (read_file, generate_code, run_command) stream as events; terminal agents are followed through file-system changes attributed to the step in progress. A slim strip under the graph names the agent, the step, the time on it, and the last few actions, with a link into the full log.

**Files**
- `src/00_planning/graph/agentPulse.ts` — node (typescript)
- `src/00_planning/AgentActivityStrip.tsx` — view (react)

**Edits**
- `src/00_planning/PlanningView.ViewModel.tsx`
- `src/00_planning/graph/GraphCanvas.tsx`
- `electron/agent/backend.cjs`
<!-- /step-meta:plan/planning-as-agent-diagnostics-1793301952427/live-agent-activity-on-the-graph-1793301952796 -->

<!-- /step:plan/planning-as-agent-diagnostics-1793301952427/live-agent-activity-on-the-graph-1793301952796 -->

## 5. Skills: the skill tree
<!-- step:plan/planning-as-agent-diagnostics-1793301952427/skills-the-skill-tree-1793301952885 -->
**Status:** Pending

A SKILLS view in Planning, drawn with the same graph: every skill an agent in this project can run, built in (/plan, /optimize, /frame, /component) or the user’s own, found where each agent keeps them (Claude Code’s .claude/commands and .claude/skills, Codex’s .codex/prompts, Gemini’s .gemini/commands). Each skill links to the tools and CLIs it drives (plan.mjs, canvas.mjs, analyze.mjs) and to what it writes (.planning, boards, code), so you can see what a skill can touch before an agent runs it. Filter by agent to see what Claude, Codex or Gemini each have.

**Files**
- `src/00_planning/skills/skillScan.ts` — node (typescript)
- `src/00_planning/skills/SkillsView.tsx` — view (react)
- `src/00_planning/skills/SkillsView.ViewModel.tsx` — view-model (react)

**Edits**
- `src/00_planning/graph/types.ts`
- `src/00_planning/PlanningView.tsx`
- `tools/sleipnir-backend.mjs`
<!-- /step-meta:plan/planning-as-agent-diagnostics-1793301952427/skills-the-skill-tree-1793301952885 -->

<!-- /step:plan/planning-as-agent-diagnostics-1793301952427/skills-the-skill-tree-1793301952885 -->

## 6. Edit and add skills, per agent
<!-- step:plan/planning-as-agent-diagnostics-1793301952427/edit-and-add-skills-per-agent-1793301952998 -->
**Status:** Pending

Open any skill’s file in the editor. New skill: a name, a description, the instructions, and which agents get it; Sleipnir writes each agent’s own format (Markdown with frontmatter for Claude and Codex, TOML for Gemini) through the same emitters that write the built-in ones. A built-in skill is changed through a project override in .sleipnir/skills/<id>.md that the scaffolder merges, so the change survives updates instead of being overwritten.

**Files**
- `src/00_planning/skills/NewSkillModal.tsx` — view (react)
- `src/00_planning/skills/NewSkillModal.ViewModel.tsx` — view-model (react)

**Edits**
- `tools/agentSkills/scaffold.mjs`
- `tools/agentSkills/emitters/index.mjs`
- `tools/agentSkills/registry.mjs`
<!-- /step-meta:plan/planning-as-agent-diagnostics-1793301952427/edit-and-add-skills-per-agent-1793301952998 -->

<!-- /step:plan/planning-as-agent-diagnostics-1793301952427/edit-and-add-skills-per-agent-1793301952998 -->

## 7. Planning organized around the agent
<!-- step:plan/planning-as-agent-diagnostics-1793301952427/planning-organized-around-the-agent-1793301953116 -->
**Status:** Pending

Planning becomes the place to watch and steer agents: PLANS (ongoing plans over the architecture, with live status and activity), SKILLS (the skill tree) and HEALTH (the architecture lens), one tab strip. The header shows any agent run in progress: which plan and step, how long, how many files touched. Manual node creation stays available but steps back: the human role here is reviewing, approving and redirecting, not filling in nodes by hand.

**Edits**
- `src/00_planning/PlanningView.tsx`
- `src/00_planning/PlanningView.ViewModel.tsx`
<!-- /step-meta:plan/planning-as-agent-diagnostics-1793301952427/planning-organized-around-the-agent-1793301953116 -->

<!-- /step:plan/planning-as-agent-diagnostics-1793301952427/planning-organized-around-the-agent-1793301953116 -->
