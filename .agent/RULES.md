# Sleipnir: Agent Mandates

You are an agent operating in the **Sleipnir** environment — either a human's
AI assistant working on this repo, or Sleipnir's own built-in chat agent
(`electron/chat.cjs`) operating through its tools. Sleipnir is a canvas and
3D modeling workbench for building software, tied directly to AI and git.

## 1. Where things live
`src/` is organised by named feature folders — no numbered stages. See the
root `ARCHITECTURE.md` §2 for the full table:
- **planning/** — the Planning graph (plans, architecture and Health views).
- **document/** — the scene document both editors share (pure, no React).
- **canvas/** — 2D boards, panels, code emit, and the editor's hooks.
- **modeling/** — 3D (`scene3d/`, `geometry/`, `viewport/`); never imports canvas.
- **source-control/** — the git UI. **validation/** — the Validation view.
- **platform/** — the one API every feature calls (Electron or web transport).
- **app/** — the shell and its UIKit primitives.

## 2. Core directives
- **Plan-first:** larger work starts as a plan in the Planning graph (`/plan`,
  or `node .sleipnir/plan.mjs`), one reviewable step per change.
- **Named folders:** new areas (e.g. rendering, lighting) get a named folder;
  never a numbered prefix.
- **Heavy packages stay lazy:** three.js, CodeMirror and xterm load behind a
  dynamic `import()`; `src/app/firstLoadBudget.test.ts` enforces it.
- **MVVM pattern:** `Name.tsx` / `Name.ViewModel.tsx` / `iName.tsx`.
  ViewModels are React hooks colocated with their component.
- **Path containment:** Any filesystem operation must stay under its
  authorized root (`src/` or the repo root) — never construct a path that
  could escape it, matching `tools/sleipnir-backend.mjs`'s `resolveSafe()`
  guarantee.

## 3. Rules specific to Sleipnir's own AI agent (`electron/chat.cjs`)
These apply when *you are* (or are modifying) the in-app chat agent, not just
a human's coding assistant working on the repo:
- **`generate_code` never writes to disk.** It must always stage generated
  content for human review in an editor tab (`chat:codeGenerated` →
  `pendingOverride`) and stop there. Do not add a path that writes model
  output straight to the filesystem.
- **`create_plan_node`** only ever registers metadata (a graph node) — never
  file contents.
- **`run_command` never executes without an explicit human confirmation.**
  It proposes a command (`chat:commandProposed`), then blocks on the
  renderer's decision (`chat:commandDecision`) before running anything via
  `commandRunner.cjs`. Do not add a path that runs a proposed command before
  that confirmation resolves.
- Prefer the least surprising provider behavior: respect
  `SLEIPNIR_MODEL_PROVIDER` if set, otherwise Anthropic-if-keyed else Ollama.

## 4. Workflow for agents
1. **Measure:** `node .sleipnir/analyze.mjs report --root .` maps every import;
   read it before restructuring anything.
2. **Plan:** draft the steps into the Planning graph (`/plan`).
3. **Build:** one step at a time, marking each in progress and completed.
4. **Validate:** `npm run test:run` and `npx tsc -b`.

---
*This file is the foundational mandate for all AI agents in this workspace —
human-directed or Sleipnir's own. See the root `ARCHITECTURE.md` for the full
technical picture behind these rules.*
