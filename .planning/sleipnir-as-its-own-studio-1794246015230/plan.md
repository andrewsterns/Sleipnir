<!-- sleipnir:plan — generated from .planning/notes.json. Write freely under the title and between a step's /step-meta and /step markers; everything else is regenerated. -->
# Sleipnir as its own studio

Make Sleipnir the place it is built in, with typing that drives the screen; real CAD features; a Studio for lighting, materials and video; 3D components that print code; ending in one prompt that plans, models, renders and ships a teaset.
<!-- /plan-meta -->

<!-- steps -->

## 1. Terminals survive a reload
<!-- step:plan/sleipnir-as-its-own-studio-1794246015230/terminals-survive-a-reload-1794246015280 -->
**Status:** Done — Shells live in the main process with a 2 MB replay buffer; a reloaded page lists and reattaches them (no duplicates, Claude redraws), and only closing a tab ends one; xterm scrollback 10,000 lines; checked with a running ping and a real Claude session across reloads

**Comments**
- someone: electron/terminalScrollback.cjs was added beyond the planned files: the buffer has to live in the main process (.cjs), so it can't be in terminalSessions.ts.

Sessions keep running in the main process, each with a scrollback buffer; a reloaded page reattaches to them and replays what it missed. Today a reload leaves Claude running with nothing on screen and opens a fresh shell, which is what stops Sleipnir editing itself.

**Files**
- `src/app/Terminal/terminalSessions.ts` — node (typescript)
- `src/app/Terminal/terminalSessions.test.ts` — node (typescript)

**Edits**
- `electron/terminal.cjs`
- `electron/main.cjs`
- `electron/preload.cjs`
- `src/app/Terminal/Terminal.ViewModel.tsx`
- `src/app/Terminal/iTerminal.tsx`
- `src/app/TerminalDock/TerminalDock.tsx`
<!-- /step-meta:plan/sleipnir-as-its-own-studio-1794246015230/terminals-survive-a-reload-1794246015280 -->

<!-- /step:plan/sleipnir-as-its-own-studio-1794246015230/terminals-survive-a-reload-1794246015280 -->

## 2. The app comes back where you were
<!-- step:plan/sleipnir-as-its-own-studio-1794246015230/the-app-comes-back-where-you-were-1794246015338 -->
**Status:** Done — sessionState.ts: space, split pane and dock restored per window; Workspace open files and active tab come back (deleted ones close quietly); Canvas tabs and open document were already remembered; checked with a reload in the app

The open space, dock, split pane and open document are remembered across a reload, so a code change from the agent no longer drops you back on Planning.

**Edits**
- `src/App.tsx`
- `src/canvas/hooks/useCanvasBoards.ts`
<!-- /step-meta:plan/sleipnir-as-its-own-studio-1794246015230/the-app-comes-back-where-you-were-1794246015338 -->

<!-- /step:plan/sleipnir-as-its-own-studio-1794246015230/the-app-comes-back-where-you-were-1794246015338 -->

## 3. Develop Sleipnir from inside Sleipnir
<!-- step:plan/sleipnir-as-its-own-studio-1794246015230/develop-sleipnir-from-inside-sleipnir-1794246015401 -->
**Status:** Done — Status bar's Restart to apply appears when electron/ or tools code changes; saves, restarts, restores the window and shells, and resumes each terminal's own Claude conversation (checked: Claude remembered a word across a restart); electron:dev keeps Vite through restarts and cleans up on quit

**Comments**
- someone: Beyond the planned files: tools/devLauncher.mjs (npm run electron:dev used to stop Vite the moment Electron exited), src/app/StatusBar/DevRestartButton.tsx, and the trail hook now records which conversation each terminal holds.
- someone: Correction to the completion note: restarting under the launcher kept Vite as intended, but quitting left Vite running. Fixed by making the kill synchronous (tools/devLauncher.mjs); that fix has not been re-run, because a leftover server was holding port 5183. Check on the next quit that port 5183 is free.

A one-click restart for changes to Sleipnir's own main process: it saves your work, relaunches the app, reopens the terminals and resumes each Claude session with claude --continue. The status bar says when electron/ has changed and a restart is due. Renderer changes keep hot-reloading.

**Files**
- `electron/devRestart.cjs` — node (javascript)

**Edits**
- `electron/main.cjs`
- `electron/preload.cjs`
- `src/app/StatusBar/StatusBar.tsx`
<!-- /step-meta:plan/sleipnir-as-its-own-studio-1794246015230/develop-sleipnir-from-inside-sleipnir-1794246015401 -->

<!-- /step:plan/sleipnir-as-its-own-studio-1794246015230/develop-sleipnir-from-inside-sleipnir-1794246015401 -->

## 4. Commands by space, one per tool
<!-- step:plan/sleipnir-as-its-own-studio-1794246015230/commands-by-space-one-per-tool-1794246015473 -->
**Status:** Proposed

**Comments**
- someone: Decided: the whole-scene command is /canvas:build, not /canvas:sculpt. The word Sculpt stays free for the future brush tools. This step renames today's /sculpt; the CLI file stays .sleipnir/model.mjs.

Skills become /canvas:extrude, /canvas:chamfer, /canvas:sculpt, /studio:light, /planning:plan, /workspace:…, one small command per tool, emitted as nested command folders. Old flat names are cleaned up on update. Codex has no nested commands as far as we know, so its files get a flat prefix (canvas-extrude); Gemini to be checked. Each command stays short and points at model.mjs help.

**Files**
- `tools/agentSkills/toolCommands.mjs` — node (javascript)

**Edits**
- `tools/agentSkills/registry.mjs`
- `tools/agentSkills/emitters/index.mjs`
- `tools/agentSkills/scaffold.mjs`
- `tools/agentSkills/agentSkills.test.ts`
- `src/app/AgentChat/AgentChat.tsx`
- `electron/agent/systemPrompt.cjs`
<!-- /step-meta:plan/sleipnir-as-its-own-studio-1794246015230/commands-by-space-one-per-tool-1794246015473 -->

<!-- /step:plan/sleipnir-as-its-own-studio-1794246015230/commands-by-space-one-per-tool-1794246015473 -->

## 5. One map of commands, spaces and buttons
<!-- step:plan/sleipnir-as-its-own-studio-1794246015230/one-map-of-commands-spaces-and-buttons-1794246015542 -->
**Status:** Proposed

A single table says which space each command belongs to and which on-screen control it is, read by the scaffolder, the terminal and the UI, so a new tool only has to be added once. Also changes tools/agentSkills/toolCommands.mjs, from an earlier step.

**Files**
- `src/app/commandMap.ts` — node (typescript)
- `src/app/commandMap.test.ts` — node (typescript)
<!-- /step-meta:plan/sleipnir-as-its-own-studio-1794246015230/one-map-of-commands-spaces-and-buttons-1794246015542 -->

<!-- /step:plan/sleipnir-as-its-own-studio-1794246015230/one-map-of-commands-spaces-and-buttons-1794246015542 -->

## 6. Typing in the terminal jumps to the space
<!-- step:plan/sleipnir-as-its-own-studio-1794246015230/typing-in-the-terminal-jumps-to-the-space-1794246015610 -->
**Status:** Proposed

The terminal tracks the line being typed; once a command prefix is recognised (/canvas:, /planning:, /workspace:, /studio:) the screen jumps there while the terminal keeps focus. On by default, with a toggle in Settings. It only acts at a Claude prompt, and pressing Enter confirms the exact command through the existing prompt hook.

**Files**
- `src/app/Terminal/commandLine.ts` — node (typescript)
- `src/app/Terminal/commandLine.test.ts` — node (typescript)

**Edits**
- `src/app/Terminal/Terminal.ViewModel.tsx`
- `src/App.tsx`
- `src/app/SettingsView/SettingsView.tsx`
- `tools/agentSkills/vendor/trail.mjs`
<!-- /step-meta:plan/sleipnir-as-its-own-studio-1794246015230/typing-in-the-terminal-jumps-to-the-space-1794246015610 -->

<!-- /step:plan/sleipnir-as-its-own-studio-1794246015230/typing-in-the-terminal-jumps-to-the-space-1794246015610 -->

## 7. Corner boxes on the tools you type
<!-- step:plan/sleipnir-as-its-own-studio-1794246015230/corner-boxes-on-the-tools-you-type-1794246015682 -->
**Status:** Proposed

Typing /canvas:extrude marks the Extrude button with the same corner box the Planning graph uses for a step in testing. One shared component, reused from FocusBox, and every tool in the map gets a marker. Also changes src/app/commandMap.ts, from an earlier step.

**Files**
- `src/app/UIKit/CommandMark/CommandMark.tsx` — view (react)

**Edits**
- `src/planning/graph/FocusBox.tsx`
- `src/canvas/board/CanvasToolbar.tsx`
- `src/canvas/board/toolbox.ts`
- `src/app/NavRail/NavRail.tsx`
<!-- /step-meta:plan/sleipnir-as-its-own-studio-1794246015230/corner-boxes-on-the-tools-you-type-1794246015682 -->

<!-- /step:plan/sleipnir-as-its-own-studio-1794246015230/corner-boxes-on-the-tools-you-type-1794246015682 -->

## 8. Watch the agent across spaces
<!-- step:plan/sleipnir-as-its-own-studio-1794246015230/watch-the-agent-across-spaces-1794246015749 -->
**Status:** Proposed

While a command runs you are free to move around: a corner box on the rail shows which space the agent is working in, read from the agent trail, and an optional Follow mode moves with it.

**Edits**
- `src/App.tsx`
- `src/app/NavRail/NavRail.tsx`
- `src/planning/graph/agentTrail.ts`
<!-- /step-meta:plan/sleipnir-as-its-own-studio-1794246015230/watch-the-agent-across-spaces-1794246015749 -->

<!-- /step:plan/sleipnir-as-its-own-studio-1794246015230/watch-the-agent-across-spaces-1794246015749 -->

## 9. OpenCascade, loaded only when needed
<!-- step:plan/sleipnir-as-its-own-studio-1794246015230/opencascade-loaded-only-when-needed-1794246015815 -->
**Status:** Proposed

**Comments**
- someone: Decided: how model.mjs gets the kernel is settled by the step "The agent CLI finds the kernel" (one per-user copy, never per project). This step only needs the app side.

The CAD kernel, as WebAssembly, behind one small interface and kept out of the app's first load. Also settles how model.mjs gets it, since the CLI is currently one 150 KB file: most likely loaded from the Sleipnir install or fetched once, not copied into every project.

**Files**
- `src/modeling/kernel/occKernel.ts` — node (typescript)
- `src/modeling/kernel/occKernel.test.ts` — node (typescript)

**Edits**
- `package.json`
- `src/app/firstLoadBudget.test.ts`
- `tools/agentSkills/buildModelCli.mjs`
<!-- /step-meta:plan/sleipnir-as-its-own-studio-1794246015230/opencascade-loaded-only-when-needed-1794246015815 -->

<!-- /step:plan/sleipnir-as-its-own-studio-1794246015230/opencascade-loaded-only-when-needed-1794246015815 -->

## 10. Prove the kernel on one part first
<!-- step:plan/sleipnir-as-its-own-studio-1794246015230/prove-the-kernel-on-one-part-first-1794246338732 -->
**Status:** Proposed

A checkpoint before anything depends on it: one box with a fillet built through OpenCascade, end to end, behind a switch. Measures load time, build time and memory, and confirms a face keeps its name when the sketch changes. Settles the design: the kernel loads when an Environment opens (with a "Preparing 3D" state), parts stay instant to read once it has loaded, and parts with no kernel features keep today's mesh path. If the numbers are bad, we stop here and reconsider Manifold.

**Files**
- `src/modeling/kernel/kernelProof.test.ts` — node (typescript)

**Edits**
- `src/modeling/geometry/body.ts`
- `src/canvas/hooks/useCanvasBoards.ts`
<!-- /step-meta:plan/sleipnir-as-its-own-studio-1794246015230/prove-the-kernel-on-one-part-first-1794246338732 -->

<!-- /step:plan/sleipnir-as-its-own-studio-1794246015230/prove-the-kernel-on-one-part-first-1794246338732 -->

## 11. The agent CLI finds the kernel
<!-- step:plan/sleipnir-as-its-own-studio-1794246015230/the-agent-cli-finds-the-kernel-1794246338854 -->
**Status:** Proposed

OpenCascade is too big to copy into every project. It lives once per user in ~/.sleipnir/kernel/<version>/, copied from the Sleipnir install when a project opens, or downloaded once and checked against a hash. The basic commands and describe still work without it; a command that needs it says what to do. Keeps .sleipnir/model.mjs small.

**Files**
- `src/modeling/commands/kernelLocator.ts` — node (typescript)
- `src/modeling/commands/kernelLocator.test.ts` — node (typescript)

**Edits**
- `src/modeling/commands/modelCli.ts`
- `tools/agentSkills/scaffold.mjs`
- `tools/agentSkills/buildModelCli.mjs`
<!-- /step-meta:plan/sleipnir-as-its-own-studio-1794246015230/the-agent-cli-finds-the-kernel-1794246338854 -->

<!-- /step:plan/sleipnir-as-its-own-studio-1794246015230/the-agent-cli-finds-the-kernel-1794246338854 -->

## 12. Parts built by the kernel, faces keeping their names
<!-- step:plan/sleipnir-as-its-own-studio-1794246015230/parts-built-by-the-kernel-faces-keeping-their-names-1794246015884 -->
**Status:** Proposed

**Comments**
- someone: Decided, from "Prove the kernel on one part first": load when an Environment opens, stay synchronous once loaded, and keep the mesh path for parts with no kernel features. Do not start until that checkpoint passes. Moved points are handled in the next step.

A part's features run through OpenCascade and come back as the same mesh, faces, edges and vertices, with faces still named by feature and role so picks, sketches on faces and commands keep working. The riskiest step: body building is synchronous today, and corner offsets (moved points) are mesh-level, so this decides how each carries over.

**Files**
- `src/modeling/kernel/kernelBody.ts` — node (typescript)
- `src/modeling/kernel/kernelBody.test.ts` — node (typescript)

**Edits**
- `src/modeling/geometry/body.ts`
- `src/modeling/geometry/cornerTweaks.ts`
- `src/modeling/scene3d/sceneMeshes.ts`
- `src/modeling/viewport/Viewport3D.tsx`
<!-- /step-meta:plan/sleipnir-as-its-own-studio-1794246015230/parts-built-by-the-kernel-faces-keeping-their-names-1794246015884 -->

<!-- /step:plan/sleipnir-as-its-own-studio-1794246015230/parts-built-by-the-kernel-faces-keeping-their-names-1794246015884 -->

## 13. Moved points and CAD features work together
<!-- step:plan/sleipnir-as-its-own-studio-1794246015230/moved-points-and-cad-features-work-together-1794246338975 -->
**Status:** Proposed

Moved corners stay a last step on the mesh, so editing points stays instant. Adding a fillet, shell or cut to a part with moved corners offers Reset or Bake: Bake sews the moved mesh into a solid the kernel can work on. Also fixes a known flaw: corners are stored by outline point number, so adding or removing a point can move the wrong one. They get stable ids, and any that lose their point are dropped with a notice.

**Edits**
- `src/modeling/geometry/cornerTweaks.ts`
- `src/document/objects.ts`
- `src/modeling/geometry/editBody.ts`
- `src/canvas/panels/FeatureSection.tsx`
<!-- /step-meta:plan/sleipnir-as-its-own-studio-1794246015230/moved-points-and-cad-features-work-together-1794246338975 -->

<!-- /step:plan/sleipnir-as-its-own-studio-1794246015230/moved-points-and-cad-features-work-together-1794246338975 -->

## 14. Real cuts: subtract and intersect
<!-- step:plan/sleipnir-as-its-own-studio-1794246015230/real-cuts-subtract-and-intersect-1794246015945 -->
**Status:** Proposed

The Subtract and Intersect choices in the feature dialog stop being shown as Add, and E pulled inward can cut a pocket instead of only moving the face. Also changes src/modeling/kernel/kernelBody.ts, from an earlier step.

**Edits**
- `src/modeling/geometry/editBody.ts`
- `src/canvas/panels/FeatureSection.tsx`
<!-- /step-meta:plan/sleipnir-as-its-own-studio-1794246015230/real-cuts-subtract-and-intersect-1794246015945 -->

<!-- /step:plan/sleipnir-as-its-own-studio-1794246015230/real-cuts-subtract-and-intersect-1794246015945 -->

## 15. Fillet and chamfer
<!-- step:plan/sleipnir-as-its-own-studio-1794246015230/fillet-and-chamfer-1794246016005 -->
**Status:** Proposed

Pick edges and round or bevel them: new features with a radius or distance, a toolbox entry, feature-dialog settings and /canvas:fillet and /canvas:chamfer. Edges are remembered by name, flagged broken if they disappear. Also changes src/modeling/kernel/kernelBody.ts, from an earlier step.

**Edits**
- `src/document/objects.ts`
- `src/canvas/board/toolbox.ts`
- `src/canvas/panels/FeatureSection.tsx`
<!-- /step-meta:plan/sleipnir-as-its-own-studio-1794246015230/fillet-and-chamfer-1794246016005 -->

<!-- /step:plan/sleipnir-as-its-own-studio-1794246015230/fillet-and-chamfer-1794246016005 -->

## 16. Shell
<!-- step:plan/sleipnir-as-its-own-studio-1794246015230/shell-1794246016066 -->
**Status:** Proposed

Hollow a part to a wall thickness, with picked faces left open: a cup from a solid. A feature, a toolbox entry and /canvas:shell. Also changes src/modeling/kernel/kernelBody.ts, from an earlier step.

**Edits**
- `src/document/objects.ts`
- `src/canvas/board/toolbox.ts`
- `src/canvas/panels/FeatureSection.tsx`
<!-- /step-meta:plan/sleipnir-as-its-own-studio-1794246015230/shell-1794246016066 -->

<!-- /step:plan/sleipnir-as-its-own-studio-1794246015230/shell-1794246016066 -->

## 17. Loft
<!-- step:plan/sleipnir-as-its-own-studio-1794246015230/loft-1794246016128 -->
**Status:** Proposed

A skin through two or more sketches, in order, with a choice of ruled or smooth. The Loft button stops saying it isn't built. Also changes src/modeling/kernel/kernelBody.ts, from an earlier step.

**Edits**
- `src/document/objects.ts`
- `src/canvas/board/toolbox.ts`
- `src/canvas/panels/FeatureSection.tsx`
<!-- /step-meta:plan/sleipnir-as-its-own-studio-1794246015230/loft-1794246016128 -->

<!-- /step:plan/sleipnir-as-its-own-studio-1794246015230/loft-1794246016128 -->

## 18. 3D curves
<!-- step:plan/sleipnir-as-its-own-studio-1794246015230/3d-curves-1794246016195 -->
**Status:** Proposed

A new kind of layer: a path with points placed anywhere in the scene, drawn with a pen in 3D and edited with the same G and X / Y / Z moves. The base for spouts, pipes and handles.

**Files**
- `src/modeling/viewport/curveTool.ts` — node (typescript)
- `src/modeling/viewport/curveTool.test.ts` — node (typescript)

**Edits**
- `src/document/types.ts`
- `src/modeling/viewport/Viewport3D.tsx`
- `src/canvas/board/CanvasToolbar.tsx`
<!-- /step-meta:plan/sleipnir-as-its-own-studio-1794246015230/3d-curves-1794246016195 -->

<!-- /step:plan/sleipnir-as-its-own-studio-1794246015230/3d-curves-1794246016195 -->

## 19. Sweep along curves and part edges
<!-- step:plan/sleipnir-as-its-own-studio-1794246015230/sweep-along-curves-and-part-edges-1794246016270 -->
**Status:** Proposed

A sweep follows a 3D curve or picked edges of a part, not just a curve on the same flat sketch. Also changes src/modeling/kernel/kernelBody.ts, from an earlier step.

**Edits**
- `src/document/objects.ts`
- `src/canvas/panels/FeatureSection.tsx`
<!-- /step-meta:plan/sleipnir-as-its-own-studio-1794246015230/sweep-along-curves-and-part-edges-1794246016270 -->

<!-- /step:plan/sleipnir-as-its-own-studio-1794246015230/sweep-along-curves-and-part-edges-1794246016270 -->

## 20. Sweep with twist, taper and guide rails
<!-- step:plan/sleipnir-as-its-own-studio-1794246015230/sweep-with-twist-taper-and-guide-rails-1794246016335 -->
**Status:** Proposed

The profile can rotate or change size along the path, and a second curve can steer it, so a spout can narrow and bend the way it should. Also changes src/modeling/kernel/kernelBody.ts, from an earlier step.

**Edits**
- `src/document/objects.ts`
- `src/canvas/panels/FeatureSection.tsx`
<!-- /step-meta:plan/sleipnir-as-its-own-studio-1794246015230/sweep-with-twist-taper-and-guide-rails-1794246016335 -->

<!-- /step:plan/sleipnir-as-its-own-studio-1794246015230/sweep-with-twist-taper-and-guide-rails-1794246016335 -->

## 21. Mirror and pattern
<!-- step:plan/sleipnir-as-its-own-studio-1794246015230/mirror-and-pattern-1794246016412 -->
**Status:** Proposed

Mirror a part or feature across a plane, and repeat it along a line or around an axis, staying linked to the original: table legs, a set of cups. Also changes src/modeling/kernel/kernelBody.ts, from an earlier step.

**Edits**
- `src/document/objects.ts`
- `src/canvas/board/toolbox.ts`
- `src/canvas/panels/FeatureSection.tsx`
<!-- /step-meta:plan/sleipnir-as-its-own-studio-1794246015230/mirror-and-pattern-1794246016412 -->

<!-- /step:plan/sleipnir-as-its-own-studio-1794246015230/mirror-and-pattern-1794246016412 -->

## 22. Import GLB and STEP
<!-- step:plan/sleipnir-as-its-own-studio-1794246015230/import-glb-and-step-1794246016483 -->
**Status:** Proposed

Bring models made elsewhere in as parts. STEP arrives as real CAD with faces to pick; GLB arrives as a mesh you can place and light but not reshape, and the panel says so.

**Files**
- `src/modeling/import/importModel.ts` — node (typescript)
- `src/modeling/import/importModel.test.ts` — node (typescript)

**Edits**
- `src/document/objects.ts`
- `src/canvas/CanvasView.tsx`
- `src/canvas/panels/CanvasLayersPanel.tsx`
<!-- /step-meta:plan/sleipnir-as-its-own-studio-1794246015230/import-glb-and-step-1794246016483 -->

<!-- /step:plan/sleipnir-as-its-own-studio-1794246015230/import-glb-and-step-1794246016483 -->

## 23. Commands for every new feature
<!-- step:plan/sleipnir-as-its-own-studio-1794246015230/commands-for-every-new-feature-1794246016555 -->
**Status:** Proposed

model.mjs and describe learn fillet, chamfer, shell, loft, cuts, curves, sweep options, mirror, pattern and import, each with its /canvas: command, so agents can do everything the toolbox can. Also changes tools/agentSkills/toolCommands.mjs, from an earlier step.

**Edits**
- `src/modeling/commands/modelCommands.ts`
- `src/modeling/commands/describeScene.ts`
- `tools/agentSkills/registry.mjs`
<!-- /step-meta:plan/sleipnir-as-its-own-studio-1794246015230/commands-for-every-new-feature-1794246016555 -->

<!-- /step:plan/sleipnir-as-its-own-studio-1794246015230/commands-for-every-new-feature-1794246016555 -->

## 24. The in-app agent can sculpt
<!-- step:plan/sleipnir-as-its-own-studio-1794246015230/the-in-app-agent-can-sculpt-1794246339098 -->
**Status:** Proposed

Sleipnir's own chat only knows how to design 2D today. It gets a tool that runs the same model commands and describe, and its command list and instructions learn the /canvas: and /studio: names, so the in-app chat and a terminal agent can do the same things.

**Files**
- `electron/agent/tools/model.cjs` — node (javascript)

**Edits**
- `electron/agent/tools/registry.cjs`
- `electron/agent/systemPrompt.cjs`
- `electron/agentTrail.cjs`
- `src/app/AgentChat/AgentChat.tsx`
<!-- /step-meta:plan/sleipnir-as-its-own-studio-1794246015230/the-in-app-agent-can-sculpt-1794246339098 -->

<!-- /step:plan/sleipnir-as-its-own-studio-1794246015230/the-in-app-agent-can-sculpt-1794246339098 -->

## 25. A shorter right panel
<!-- step:plan/sleipnir-as-its-own-studio-1794246015230/a-shorter-right-panel-1794246016625 -->
**Status:** Proposed

Plane, position and rotation fold away, so a selected part shows its name, feature settings and look first, with far less scrolling.

**Edits**
- `src/canvas/panels/CanvasInspector.tsx`
- `src/canvas/panels/PlaneSection.tsx`
- `src/canvas/LAYOUT.md`
<!-- /step-meta:plan/sleipnir-as-its-own-studio-1794246015230/a-shorter-right-panel-1794246016625 -->

<!-- /step:plan/sleipnir-as-its-own-studio-1794246015230/a-shorter-right-panel-1794246016625 -->

## 26. A tidier 3D canvas
<!-- step:plan/sleipnir-as-its-own-studio-1794246015230/a-tidier-3d-canvas-1794246016691 -->
**Status:** Proposed

A quieter grid, a tighter Fit, clearer hover and selection, and a size readout on the canvas while dragging.

**Edits**
- `src/modeling/viewport/Viewport3D.tsx`
- `src/modeling/viewport/cameraViews.ts`
<!-- /step-meta:plan/sleipnir-as-its-own-studio-1794246015230/a-tidier-3d-canvas-1794246016691 -->

<!-- /step:plan/sleipnir-as-its-own-studio-1794246015230/a-tidier-3d-canvas-1794246016691 -->

## 27. See the part while sketching
<!-- step:plan/sleipnir-as-its-own-studio-1794246015230/see-the-part-while-sketching-1794246016754 -->
**Status:** Proposed

Sketch mode draws the part's edges as snap guides on the sketch plane, so new shapes line up with what is already there.

**Edits**
- `src/modeling/scene3d/sketchGhost.ts`
- `src/modeling/viewport/SketchInScene.tsx`
- `src/canvas/board/CanvasBoard.tsx`
<!-- /step-meta:plan/sleipnir-as-its-own-studio-1794246015230/see-the-part-while-sketching-1794246016754 -->

<!-- /step:plan/sleipnir-as-its-own-studio-1794246015230/see-the-part-while-sketching-1794246016754 -->

## 28. Loose ends in 3D editing
<!-- step:plan/sleipnir-as-its-own-studio-1794246015230/loose-ends-in-3d-editing-1794246339232 -->
**Status:** Proposed

The limits noted along the way: box select stops catching points hidden behind a part; a sketch frame's fill no longer hides the scene in sketch mode; the camera eases into and out of sketch mode; a single frame of a Sketch can be placed from the menu; components inside placed Sketches work; + Sketch stops being duplicated between the left panel and the toolbox; and dragging features to reorder gets its check in the running app.

**Edits**
- `src/modeling/viewport/selectionModes.ts`
- `src/modeling/viewport/Viewport3D.tsx`
- `src/modeling/viewport/SketchInScene.tsx`
- `src/canvas/panels/sketchMenu.ts`
- `src/canvas/panels/CanvasLayersPanel.tsx`
- `src/document/placements.ts`
- `src/canvas/CanvasView.tsx`
<!-- /step-meta:plan/sleipnir-as-its-own-studio-1794246015230/loose-ends-in-3d-editing-1794246339232 -->

<!-- /step:plan/sleipnir-as-its-own-studio-1794246015230/loose-ends-in-3d-editing-1794246339232 -->

## 29. Sketch dimensions and constraints
<!-- step:plan/sleipnir-as-its-own-studio-1794246015230/sketch-dimensions-and-constraints-1794246016819 -->
**Status:** Proposed

**Comments**
- someone: Decided: do this one last, after "End to end: the teaset". Nothing else depends on it. The plan CLI cannot reorder steps, so it stays here in the graph until moved; drag it in Sleipnir, or skip it when you get here.

Typed lengths and angles, plus equal, parallel, perpendicular, coincident and tangent, kept true by a solver as you drag, as in Onshape. Shapes stay editable by hand; a sketch that can't be solved says which constraint is the problem.

**Files**
- `src/modeling/sketch/constraintSolver.ts` — node (typescript)
- `src/modeling/sketch/constraintSolver.test.ts` — node (typescript)
- `src/canvas/panels/ConstraintsSection.tsx` — view (react)

**Edits**
- `src/document/types.ts`
- `src/canvas/board/CanvasBoard.tsx`
- `src/canvas/panels/CanvasInspector.tsx`
<!-- /step-meta:plan/sleipnir-as-its-own-studio-1794246015230/sketch-dimensions-and-constraints-1794246016819 -->

<!-- /step:plan/sleipnir-as-its-own-studio-1794246015230/sketch-dimensions-and-constraints-1794246016819 -->

## 30. Colours and first-time help
<!-- step:plan/sleipnir-as-its-own-studio-1794246015230/colours-and-first-time-help-1794246339409 -->
**Status:** Proposed

The rest of the design critique: status colours and the undefined --accent move onto the theme so they work in light and dark, the context menu's hardcoded red goes, and Sketch, Part, Plane and Environment get a one-line explanation the first time you meet them (the weakest score at 2 of 4). Ends with a full /impeccable critique run, to replace the 31 of 40 that was only a self-assessment.

**Edits**
- `src/app/AgentChat/AgentChat.tsx`
- `src/app/AgentChat/ConnectModels.tsx`
- `src/app/AgentChat/ModelPicker.tsx`
- `src/app/AgentChat/ToolActivityRow.tsx`
- `src/app/CommandPalette/CommandPalette.tsx`
- `src/app/DesignSystem/CodeEditorView.tsx`
- `src/app/DesignSystem/DeletePathModal.tsx`
- `src/app/DesignSystem/LeftRailingView.tsx`
- `src/app/DesignSystem/RenamePathModal.tsx`
- `src/app/License/UpgradePrompt.tsx`
- `src/app/ProblemsDock/ProblemsDock.tsx`
- `src/app/Run/RunControl.tsx`
- `src/app/Run/runLabels.ts`
- `src/app/RunDock/RunDock.tsx`
- `src/app/SettingsView/LicenseSection.tsx`
- `src/app/SettingsView/SettingsView.tsx`
- `src/app/SettingsView/UpdatesSection.tsx`
- `src/app/TitleBar/TitleBar.tsx`
- `src/app/UIKit/ContextMenu/ContextMenu.tsx`
- `src/app/Workspace/NewWorkspacePlanModal.tsx`
- `src/app/Workspace/WorkspaceView.tsx`
- `src/canvas/CanvasView.tsx`
- `src/canvas/board/CanvasBoard.tsx`
- `src/canvas/board/CanvasNodeView.tsx`
- `src/canvas/board/ComponentLabel.tsx`
- `src/canvas/board/FrameLabel.tsx`
- `src/canvas/board/TextEditOverlay.tsx`
- `src/canvas/panels/CanvasInspector.tsx`
- `src/canvas/panels/CanvasLayersPanel.tsx`
- `src/canvas/panels/DocsPane.tsx`
- `src/canvas/panels/PaintSections.tsx`
- `src/planning/ActivityPanel.tsx`
- `src/planning/AddNodeModal.tsx`
- `src/planning/ApproveStepModal.tsx`
- `src/planning/DeleteNodeModal.tsx`
- `src/planning/DeletePlanModal.tsx`
- `src/planning/DismissWelcomeModal.tsx`
- `src/planning/MissingPlanningFiles.tsx`
- `src/planning/PlanningView.tsx`
- `src/planning/skills/NewSkillModal.tsx`
- `src/planning/skills/SkillCard.tsx`
- `src/source-control/CommitGraphView.tsx`
- `src/source-control/ConstellationView.tsx`
- `src/source-control/DiffView.tsx`
- `src/source-control/DiscardFileModal.tsx`
- `src/source-control/SourceControlView.tsx`
- `src/source-control/StashDropModal.tsx`
- `src/source-control/commitGraphLayout.ts`
- `src/validation/ValidationView.tsx`
- `src/themes/tactical.css`
- `src/themes/light.css`
<!-- /step-meta:plan/sleipnir-as-its-own-studio-1794246015230/colours-and-first-time-help-1794246339409 -->

<!-- /step:plan/sleipnir-as-its-own-studio-1794246015230/colours-and-first-time-help-1794246339409 -->

## 31. Tests move to the Problems dock
<!-- step:plan/sleipnir-as-its-own-studio-1794246015230/tests-move-to-the-problems-dock-1794246016886 -->
**Status:** Proposed

The test runner leaves its rail slot and runs from the bottom dock, its failures listed with the other problems. Nothing is lost, and the rail slot is free for Studio.

**Files**
- `src/app/ProblemsDock/TestsPanel.tsx` — view (react)

**Edits**
- `src/app/ProblemsDock/ProblemsDock.tsx`
- `src/validation/ValidationView.tsx`
- `src/validation/ValidationView.ViewModel.tsx`
- `src/App.tsx`
- `src/app/lazyViews.ts`
- `src/app/shellLayout.test.tsx`
<!-- /step-meta:plan/sleipnir-as-its-own-studio-1794246015230/tests-move-to-the-problems-dock-1794246016886 -->

<!-- /step:plan/sleipnir-as-its-own-studio-1794246015230/tests-move-to-the-problems-dock-1794246016886 -->

## 32. The Studio space
<!-- step:plan/sleipnir-as-its-own-studio-1794246015230/the-studio-space-1794246016956 -->
**Status:** Proposed

Studio takes Validation's place on the rail: a live view of the shot, a list of what is in it on the left, settings on the right, the timeline along the bottom. Lazy-loaded like the other heavy spaces.

**Files**
- `src/studio/StudioView.tsx` — view (react)
- `src/studio/StudioView.ViewModel.tsx` — view-model (react)
- `src/studio/iStudioView.tsx` — interface (react)

**Edits**
- `src/App.tsx`
- `src/app/lazyViews.ts`
<!-- /step-meta:plan/sleipnir-as-its-own-studio-1794246015230/the-studio-space-1794246016956 -->

<!-- /step:plan/sleipnir-as-its-own-studio-1794246015230/the-studio-space-1794246016956 -->

## 33. Shots: a third kind of document
<!-- step:plan/sleipnir-as-its-own-studio-1794246015230/shots-a-third-kind-of-document-1794246017026 -->
**Status:** Proposed

A Shot links Environments and Sketches and holds its own lights, cameras and timeline, so one model can have many shots. Links stay live, flagged broken like everything else if the source is deleted. Joins the picker alongside Sketches and Environments.

**Files**
- `src/document/shots.ts` — node (typescript)
- `src/document/shots.test.ts` — node (typescript)

**Edits**
- `src/document/types.ts`
- `src/document/documentKind.ts`
- `src/canvas/io/store.ts`
- `src/canvas/io/docFormat.ts`
<!-- /step-meta:plan/sleipnir-as-its-own-studio-1794246015230/shots-a-third-kind-of-document-1794246017026 -->

<!-- /step:plan/sleipnir-as-its-own-studio-1794246015230/shots-a-third-kind-of-document-1794246017026 -->

## 34. Materials on parts
<!-- step:plan/sleipnir-as-its-own-studio-1794246015230/materials-on-parts-1794246017094 -->
**Status:** Proposed

A part keeps its material wherever it goes: colour, metalness, roughness, glass, emissive and image textures, chosen from presets or set by hand, and shown in the 3D view as well as in Studio. Needs UVs on the kernel's meshes.

**Files**
- `src/document/materials.ts` — node (typescript)
- `src/document/materials.test.ts` — node (typescript)
- `src/studio/MaterialPanel.tsx` — view (react)

**Edits**
- `src/document/objects.ts`
- `src/modeling/scene3d/sceneMeshes.ts`
- `src/modeling/viewport/Viewport3D.tsx`
<!-- /step-meta:plan/sleipnir-as-its-own-studio-1794246015230/materials-on-parts-1794246017094 -->

<!-- /step:plan/sleipnir-as-its-own-studio-1794246015230/materials-on-parts-1794246017094 -->

## 35. Lighting
<!-- step:plan/sleipnir-as-its-own-studio-1794246015230/lighting-1794246017158 -->
**Status:** Proposed

Area, point, spot and sun lights, placed and aimed in the scene, plus image-based environments and studio presets such as three-point and softbox. Also changes src/studio/StudioView.tsx, from an earlier step.

**Files**
- `src/studio/lighting.ts` — node (typescript)
- `src/studio/lighting.test.ts` — node (typescript)
- `src/studio/LightingPanel.tsx` — view (react)
<!-- /step-meta:plan/sleipnir-as-its-own-studio-1794246015230/lighting-1794246017158 -->

<!-- /step:plan/sleipnir-as-its-own-studio-1794246015230/lighting-1794246017158 -->

## 36. Cameras
<!-- step:plan/sleipnir-as-its-own-studio-1794246015230/cameras-1794246017220 -->
**Status:** Proposed

Named cameras in a shot, with lens, aspect and focus: set from the current view, framed by hand, and looked through to compose. (From Prompt to scene.) Also changes src/studio/StudioView.tsx, from an earlier step.

**Files**
- `src/studio/cameras.ts` — node (typescript)
- `src/studio/cameras.test.ts` — node (typescript)

**Edits**
- `src/modeling/viewport/cameraViews.ts`
<!-- /step-meta:plan/sleipnir-as-its-own-studio-1794246015230/cameras-1794246017220 -->

<!-- /step:plan/sleipnir-as-its-own-studio-1794246015230/cameras-1794246017220 -->

## 37. A timeline with keyframes
<!-- step:plan/sleipnir-as-its-own-studio-1794246015230/a-timeline-with-keyframes-1794246017284 -->
**Status:** Proposed

Keyframes on part placements, cameras, lights and materials, with easing. Turns need a pivot of their own so a lid swings about its hinge between keys, rather than drifting as it would with straight interpolation. (From Prompt to scene.) Also changes src/studio/StudioView.tsx, from an earlier step.

**Files**
- `src/studio/timeline.ts` — node (typescript)
- `src/studio/timeline.test.ts` — node (typescript)
- `src/studio/TimelinePanel.tsx` — view (react)

**Edits**
- `src/document/sceneTypes.ts`
- `src/document/placement.ts`
<!-- /step-meta:plan/sleipnir-as-its-own-studio-1794246015230/a-timeline-with-keyframes-1794246017284 -->

<!-- /step:plan/sleipnir-as-its-own-studio-1794246015230/a-timeline-with-keyframes-1794246017284 -->

## 38. 2D designs in shots and on surfaces
<!-- step:plan/sleipnir-as-its-own-studio-1794246015230/2d-designs-in-shots-and-on-surfaces-1794246017346 -->
**Status:** Proposed

A placed Sketch shows its real design instead of rough flat shapes, including text and layout, and can play its states over time. Sketches can also be shots on their own, so 2D work gets videos too. (From Prompt to scene.)

**Files**
- `src/studio/sketchTexture.ts` — node (typescript)
- `src/studio/sketchTexture.test.ts` — node (typescript)

**Edits**
- `src/modeling/viewport/Viewport3D.tsx`
- `src/document/placements.ts`
<!-- /step-meta:plan/sleipnir-as-its-own-studio-1794246015230/2d-designs-in-shots-and-on-surfaces-1794246017346 -->

<!-- /step:plan/sleipnir-as-its-own-studio-1794246015230/2d-designs-in-shots-and-on-surfaces-1794246017346 -->

## 39. Path-traced stills
<!-- step:plan/sleipnir-as-its-own-studio-1794246015230/path-traced-stills-1794246017408 -->
**Status:** Proposed

Live preview while you work, then a GPU path tracer for final images with true reflections and soft light, progressively refining with a stop button. Also changes src/studio/StudioView.tsx, from an earlier step.

**Files**
- `src/studio/pathTrace.ts` — node (typescript)

**Edits**
- `package.json`
- `src/app/firstLoadBudget.test.ts`
<!-- /step-meta:plan/sleipnir-as-its-own-studio-1794246015230/path-traced-stills-1794246017408 -->

<!-- /step:plan/sleipnir-as-its-own-studio-1794246015230/path-traced-stills-1794246017408 -->

## 40. Video export
<!-- step:plan/sleipnir-as-its-own-studio-1794246015230/video-export-1794246017475 -->
**Status:** Proposed

Render the timeline to MP4, at real-time or path-traced quality, with resolution, frame rate and a progress bar that can be cancelled. Also changes src/studio/StudioView.tsx, from an earlier step.

**Files**
- `src/studio/videoExport.ts` — node (typescript)
- `src/studio/videoExport.test.ts` — node (typescript)

**Edits**
- `electron/main.cjs`
- `electron/preload.cjs`
<!-- /step-meta:plan/sleipnir-as-its-own-studio-1794246015230/video-export-1794246017475 -->

<!-- /step:plan/sleipnir-as-its-own-studio-1794246015230/video-export-1794246017475 -->

## 41. Upgrade an object to a 3D component
<!-- step:plan/sleipnir-as-its-own-studio-1794246015230/upgrade-an-object-to-a-3d-component-1794246017536 -->
**Status:** Proposed

The same action a frame has today: upgrade a part or group of parts to a 3D component, with a name, the same label on the canvas and a place in the components list.

**Edits**
- `src/document/types.ts`
- `src/canvas/hooks/useComponentEditing.ts`
- `src/canvas/panels/CanvasInspector.tsx`
- `src/canvas/panels/CanvasLayersPanel.tsx`
- `src/canvas/board/ComponentLabel.tsx`
<!-- /step-meta:plan/sleipnir-as-its-own-studio-1794246015230/upgrade-an-object-to-a-3d-component-1794246017536 -->

<!-- /step:plan/sleipnir-as-its-own-studio-1794246015230/upgrade-an-object-to-a-3d-component-1794246017536 -->

## 42. Export to GLB
<!-- step:plan/sleipnir-as-its-own-studio-1794246015230/export-to-glb-1794246017601 -->
**Status:** Proposed

Bodies to a binary glTF with names, materials and placements, with timeline keys as animation once they exist. Also available from the File menu and model.mjs. (From Prompt to scene.)

**Files**
- `src/modeling/export/exportGltf.ts` — node (typescript)
- `src/modeling/export/exportGltf.test.ts` — node (typescript)

**Edits**
- `src/modeling/commands/modelCommands.ts`
<!-- /step-meta:plan/sleipnir-as-its-own-studio-1794246015230/export-to-glb-1794246017601 -->

<!-- /step:plan/sleipnir-as-its-own-studio-1794246015230/export-to-glb-1794246017601 -->

## 43. A 3D component prints its code
<!-- step:plan/sleipnir-as-its-own-studio-1794246015230/a-3d-component-prints-its-code-1794246017663 -->
**Status:** Proposed

Upgrading writes a .glb and a small React Three Fiber component into .components/<name>/, with named parts you can target in code, and re-prints them when the object changes, exactly as 2D components do.

**Files**
- `src/canvas/emit/react3d.ts` — node (typescript)
- `src/canvas/emit/react3d.test.ts` — node (typescript)

**Edits**
- `src/canvas/emit/targets.ts`
- `src/canvas/hooks/useCanvasBoards.ts`
- `src/canvas/io/stagedFiles.ts`
<!-- /step-meta:plan/sleipnir-as-its-own-studio-1794246015230/a-3d-component-prints-its-code-1794246017663 -->

<!-- /step:plan/sleipnir-as-its-own-studio-1794246015230/a-3d-component-prints-its-code-1794246017663 -->

## 44. Everything meets in the Workspace
<!-- step:plan/sleipnir-as-its-own-studio-1794246015230/everything-meets-in-the-workspace-1794246017731 -->
**Status:** Proposed

Components, 3D components and Studio renders show in the file tree with their status; opening one jumps to its object on the Canvas and back; renders land in a known folder. A pass over every space so nothing made in one is invisible in another. Also changes src/studio/StudioView.ViewModel.tsx, from an earlier step.

**Edits**
- `src/app/Workspace/WorkspaceView.tsx`
- `src/canvas/CanvasView.ViewModel.tsx`
<!-- /step-meta:plan/sleipnir-as-its-own-studio-1794246015230/everything-meets-in-the-workspace-1794246017731 -->

<!-- /step:plan/sleipnir-as-its-own-studio-1794246015230/everything-meets-in-the-workspace-1794246017731 -->

## 45. Picks are the agent's context, and an Ask box
<!-- step:plan/sleipnir-as-its-own-studio-1794246015230/picks-are-the-agent-s-context-and-an-ask-box-1794246017795 -->
**Status:** Proposed

Click points, edges or parts and describe the change in plain words; the picks go to the agent as named faces and edges, and the edit lands the same way a manual one does. (From Prompt to scene.)

**Files**
- `src/modeling/viewport/askBox.tsx` — view (react)

**Edits**
- `src/modeling/viewport/Viewport3D.tsx`
- `src/modeling/commands/describeScene.ts`
- `src/app/AgentChat/AgentChat.tsx`
<!-- /step-meta:plan/sleipnir-as-its-own-studio-1794246015230/picks-are-the-agent-s-context-and-an-ask-box-1794246017795 -->

<!-- /step:plan/sleipnir-as-its-own-studio-1794246015230/picks-are-the-agent-s-context-and-an-ask-box-1794246017795 -->

## 46. A library of ready-made parts
<!-- step:plan/sleipnir-as-its-own-studio-1794246015230/a-library-of-ready-made-parts-1794246017857 -->
**Status:** Proposed

Laptop, phone, monitor, desk, room and more as editable starting points, placeable by hand or by command. (From Prompt to scene.)

**Files**
- `src/modeling/library/partsLibrary.ts` — node (typescript)
- `src/modeling/library/partsLibrary.test.ts` — node (typescript)

**Edits**
- `src/canvas/board/toolbox.ts`
- `src/modeling/commands/modelCommands.ts`
<!-- /step-meta:plan/sleipnir-as-its-own-studio-1794246015230/a-library-of-ready-made-parts-1794246017857 -->

<!-- /step:plan/sleipnir-as-its-own-studio-1794246015230/a-library-of-ready-made-parts-1794246017857 -->

## 47. Studio commands, and skills that hand off
<!-- step:plan/sleipnir-as-its-own-studio-1794246015230/studio-commands-and-skills-that-hand-off-1794246017922 -->
**Status:** Proposed

model.mjs learns shots, materials, lights, cameras, keyframes and renders, with /studio: commands such as /studio:light and /studio:render. Skills can name each other mid-prompt and pass work along, so one prompt runs from plan to model to shot to code. (From Prompt to scene.) Also changes tools/agentSkills/toolCommands.mjs, from an earlier step.

**Files**
- `src/modeling/commands/studioCommands.ts` — node (typescript)
- `src/modeling/commands/studioCommands.test.ts` — node (typescript)

**Edits**
- `src/modeling/commands/modelCommands.ts`
- `tools/agentSkills/registry.mjs`
<!-- /step-meta:plan/sleipnir-as-its-own-studio-1794246015230/studio-commands-and-skills-that-hand-off-1794246017922 -->

<!-- /step:plan/sleipnir-as-its-own-studio-1794246015230/studio-commands-and-skills-that-hand-off-1794246017922 -->

## 48. End to end: the teaset
<!-- step:plan/sleipnir-as-its-own-studio-1794246015230/end-to-end-the-teaset-1794246017985 -->
**Status:** Proposed

The acceptance test, typed in Sleipnir's own terminal: "/planning:plan out a rendered teaset using /studio:lighting and then make it". The screen jumps as you type, the plan waits for approval and asks questions, the models are built, lit and rendered, and the workspace ends up with its code. The laptop website video from Prompt to scene is the second run.
<!-- /step-meta:plan/sleipnir-as-its-own-studio-1794246015230/end-to-end-the-teaset-1794246017985 -->

<!-- /step:plan/sleipnir-as-its-own-studio-1794246015230/end-to-end-the-teaset-1794246017985 -->
