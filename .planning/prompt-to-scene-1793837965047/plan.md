<!-- sleipnir:plan — generated from .planning/notes.json. Write freely under the title and between a step's /step-meta and /step markers; everything else is regenerated. -->
# Prompt to scene

From a prompt to an animated 3D scene, cheaply: agents drive deterministic model commands that share the app's code, read the scene back in a few hundred tokens, use a library of ready-made parts, and animate cameras, parts and Sketch states on a timeline; what you click is the agent's context, so plain words and hand edits change the same things. Rendering and /render are tabled for the Lightroom widget.
<!-- /plan-meta -->

<!-- steps -->

## 1. Model commands for agents, on the app’s own code
<!-- step:plan/prompt-to-scene-1793837965047/model-commands-for-agents-on-the-app-s-own-code-1793837965104 -->
**Status:** Done — modelCommands.ts: 17 verbs (env/sketch create, sketch on plane or face with rect/ellipse/polygon/path, place, extrude/revolve/sweep, starter, feature, smoothness, edit --pull, move --turn --about, resize, unlink, rename, delete, list) over the app's own functions; modelCli.ts bundled by esbuild into vendor/model.mjs (134 KB, Node only), scaffolded as .sleipnir/model.mjs; docFormat.ts split from store.ts; app's From a sketch shares placeSketchIn; 7 tests; laptop built by CLI shows live in the app

A command line an agent drives instead of writing scene JSON: env create, sketch --plane top, place --sketch Logo --on "Lid: end face", extrude / revolve / sweep, starter, smoothness, edit --face end --pull 0.5, unlink, delete. Each verb is a thin call into the same pure functions the app uses (document/objects, placements, scene3d/planeRefs, starterShapes, geometry/editBody), bundled into .sleipnir/model.mjs so an agent and the app can never disagree. Errors are the app's own reasons ('Placed from a sketch — edit it there'). One verb is one write, which Sleipnir shows live and takes as one undo step.

**Files**
- `src/modeling/commands/modelCommands.ts` — node (typescript)
- `src/modeling/commands/modelCommands.test.ts` — node (typescript)
- `tools/agentSkills/buildModelCli.mjs` — node (javascript)

**Edits**
- `tools/agentSkills/scaffold.mjs`
- `package.json`
- `src/canvas/io/store.ts`
<!-- /step-meta:plan/prompt-to-scene-1793837965047/model-commands-for-agents-on-the-app-s-own-code-1793837965104 -->

<!-- /step:plan/prompt-to-scene-1793837965047/model-commands-for-agents-on-the-app-s-own-code-1793837965104 -->

## 2. describe: the scene in a few hundred tokens
<!-- step:plan/prompt-to-scene-1793837965047/describe-the-scene-in-a-few-hundred-tokens-1793837965178 -->
**Status:** Done — describeScene.ts: parts with box, features' numbers, moved/turned, faces by command names (end, side 2, 'Extrude 2 end') with size on own plane, middle, facing (+Y / vector / curved); unused + linked sketches; BROKEN with why; ~250 tokens for the laptop; model.mjs describe [--part] [--json]. Fixed: faceFrame ignored a part's own placement (sketches on a turned part's face landed wrong); smoothness now scales below 1 m (8 cm mug as round as a 1 m drum); sweeps use one tolerance in view and body. 7 tests

The read-back that keeps an agent from modelling blind, and cheap enough to call after every change: model.mjs describe --env Desk prints each part with its features and numbers, each face by its lasting name ("Extrude 1's end face") with size and centre in meters, the sketches and the planes they stand on, what's linked and what's broken, and the triangle budget. --json for scripts; --part narrows it. Same words as LAYOUT.md.

**Files**
- `src/modeling/commands/describeScene.ts` — node (typescript)
- `src/modeling/commands/describeScene.test.ts` — node (typescript)

**Edits**
- `src/modeling/geometry/body.ts`
<!-- /step-meta:plan/prompt-to-scene-1793837965047/describe-the-scene-in-a-few-hundred-tokens-1793837965178 -->

<!-- /step:plan/prompt-to-scene-1793837965047/describe-the-scene-in-a-few-hundred-tokens-1793837965178 -->

## 3. The /model and /sketch skills
<!-- step:plan/prompt-to-scene-1793837965047/the-model-and-sketch-skills-1793837965263 -->
**Status:** Done — /model (~700 tokens: words, axes per plane, recipes, hinge/scale rules, build-describe-fix loop, honest limits) and /sketch (/frame kept as the same command); canvas.mjs builds only into Sketch documents and refuses an Environment with the place command; model.mjs place --width sizes a design for its surface; describe drops zero-area faces; scaffold v7 applied here; laptop with a designed screen built by commands, checked in the app

Two short skills beside /plan and /optimize. /model teaches the vocabulary (Sketch, Environment, Part, Feature, Plane, Place / Unlink), units (100 px = 1 m), which way each plane faces, the recipes (a sphere is a half circle revolved, a box a square extruded, a starter or library part first), and the loop: build, describe, check, fix. /sketch is /frame in the new words: Sketch documents of frames and components that emit code; the canvas CLI learns the two kinds (this takes over Sketches-and-Environments step 17). Skill text stays small and points at --help, so it costs little context.

**Edits**
- `tools/agentSkills/registry.mjs`
- `tools/agentSkills/vendor/canvas.mjs`
- `tools/agentSkills/agentSkills.test.ts`
- `AGENTS.md`
<!-- /step-meta:plan/prompt-to-scene-1793837965047/the-model-and-sketch-skills-1793837965263 -->

<!-- /step:plan/prompt-to-scene-1793837965047/the-model-and-sketch-skills-1793837965263 -->

## 4. Measure it: plain three.js vs Sleipnir
<!-- step:plan/prompt-to-scene-1793837965047/measure-it-plain-three-js-vs-sleipnir-1793988082589 -->
**Status:** Done — One run each, Sonnet 5.5, box-only laptop + 3 edits: both 4/4 exact. Plain three.js $0.13, 56 s, 19 turns; Sleipnir $0.23, 90 s, 21 turns. Build cost twice as much (one command per turn, reading the skill); the three edits tied. The thesis isn't shown yet on this scene; batch commands are the first fix

Before building more, prove the agent loop pays. One scene prompt (a laptop on a desk, then three follow-up edits: thicker lid, open it 20°, move it left) done twice by a fresh agent — once writing three.js in a plain repo, once through model.mjs + describe + the skills. Record tokens, turns, wall time and whether each follow-up edit landed exactly. The script runs both from a prompt file and writes a table; the result decides whether the rest of this plan goes ahead as is.

**Files**
- `tools/benchmarks/sceneBench.mjs` — node (javascript)
- `tools/benchmarks/scenePrompts.json` — node (react)
<!-- /step-meta:plan/prompt-to-scene-1793837965047/measure-it-plain-three-js-vs-sleipnir-1793988082589 -->

<!-- /step:plan/prompt-to-scene-1793837965047/measure-it-plain-three-js-vs-sleipnir-1793988082589 -->

## 5. Batch commands, and /model becomes /sculpt
<!-- step:plan/prompt-to-scene-1793837965047/batch-commands-and-model-becomes-sculpt-1794243701181 -->
**Status:** Done — model.mjs batch (all or nothing, ends in describe; 2 tests); /model renamed /sculpt, scaffold v8. Rerun: laptop scene Sleipnir $0.232 to $0.158, 90 s to 50 s, 4/4 exact, vs plain $0.111, 45 s with one 15 mm leg error carried through all stages; curved scene both 4/4 exact, $0.155 vs $0.108, 45 s vs 39 s

The benchmark's extra cost was one command per turn. model.mjs batch runs a whole build as one script, all or nothing, ending in a describe; the skill teaches it. /model collides with Claude Code's own /model, so the skill becomes /sculpt. Rerun the comparison, adding a harder scene with curved parts.

**Edits**
- `src/modeling/commands/modelCommands.ts`
- `src/modeling/commands/modelCli.ts`
- `tools/agentSkills/registry.mjs`
- `tools/benchmarks/sceneBench.mjs`
<!-- /step-meta:plan/prompt-to-scene-1793837965047/batch-commands-and-model-becomes-sculpt-1794243701181 -->

<!-- /step:plan/prompt-to-scene-1793837965047/batch-commands-and-model-becomes-sculpt-1794243701181 -->

## 6. Picks are the agent’s context, and an Ask box
<!-- step:plan/prompt-to-scene-1793837965047/picks-are-the-agent-s-context-and-an-ask-box-1793837965386 -->
**Status:** Proposed

**Comments**
- someone: Folded into the plan 'Sleipnir as its own studio' (plan/sleipnir-as-its-own-studio-1794246015230) by decision on 2026-11-09. Follow that plan; skip this step.

What you click is what 'this' means. The current pick — layers, parts, or edit mode's points, edges and faces — is described in a line ("Extrude 1's end face on Lid, 8 mm deep") and written where agents look (.sleipnir/selection.json, model.mjs selection), so a terminal agent edits exactly that. In the app, the right panel gets an Ask field under the selection: plain words go to the in-app agent with the pick attached, and come back as the same model commands a hand edit makes — each one undo step, so a vibe edit and a manual edit are never two systems.

**Files**
- `src/modeling/commands/pickContext.ts` — node (typescript)
- `src/modeling/commands/pickContext.test.ts` — node (typescript)
- `src/canvas/panels/AskSection.tsx` — view (react)

**Edits**
- `src/canvas/panels/CanvasInspector.tsx`
- `src/canvas/CanvasView.tsx`
- `src/canvas/CanvasView.ViewModel.tsx`
- `src/app/AgentChat/AgentChat.ViewModel.tsx`
<!-- /step-meta:plan/prompt-to-scene-1793837965047/picks-are-the-agent-s-context-and-an-ask-box-1793837965386 -->

<!-- /step:plan/prompt-to-scene-1793837965047/picks-are-the-agent-s-context-and-an-ask-box-1793837965386 -->

## 7. A library of ready-made parts
<!-- step:plan/prompt-to-scene-1793837965047/a-library-of-ready-made-parts-1793837965485 -->
**Status:** Proposed

**Comments**
- someone: Folded into the plan 'Sleipnir as its own studio' (plan/sleipnir-as-its-own-studio-1794246015230) by decision on 2026-11-09. Follow that plan; skip this step.

The biggest token saving: an agent asks for a laptop instead of building one face by face. Parametric assemblies made of ordinary sketches and features (so they edit like anything built by hand): laptop (base, lid on a hinge, a screen face named 'screen' to place a Sketch on), phone, monitor, desk, room. In the toolbox's Starter shapes as Library ▸, and model.mjs starter laptop --size 14in. Depends on parts having a placement of their own (grab / rotate / scale).

**Files**
- `src/modeling/scene3d/partsLibrary.ts` — node (typescript)
- `src/modeling/scene3d/partsLibrary.test.ts` — node (typescript)

**Edits**
- `src/modeling/scene3d/starterShapes.ts`
- `src/canvas/board/toolbox.ts`
- `src/canvas/board/CanvasToolbar.tsx`
<!-- /step-meta:plan/prompt-to-scene-1793837965047/a-library-of-ready-made-parts-1793837965485 -->

<!-- /step:plan/prompt-to-scene-1793837965047/a-library-of-ready-made-parts-1793837965485 -->

## 8. Cameras in an environment
<!-- step:plan/prompt-to-scene-1793837965047/cameras-in-an-environment-1793837965577 -->
**Status:** Proposed

**Comments**
- someone: Folded into the plan 'Sleipnir as its own studio' (plan/sleipnir-as-its-own-studio-1794246015230) by decision on 2026-11-09. Follow that plan; skip this step.

Named cameras saved in the environment — where it stands, what it looks at, lens — listed in the left panel under Cameras, set from the current view (Add camera here), and looked through in the 3D view. What a render shoots from, and what the timeline moves.

**Files**
- `src/document/cameras.ts` — node (typescript)
- `src/document/cameras.test.ts` — node (typescript)

**Edits**
- `src/document/types.ts`
- `src/canvas/panels/CanvasLayersPanel.tsx`
- `src/modeling/viewport/Viewport3D.tsx`
- `src/modeling/viewport/cameraViews.ts`
<!-- /step-meta:plan/prompt-to-scene-1793837965047/cameras-in-an-environment-1793837965577 -->

<!-- /step:plan/prompt-to-scene-1793837965047/cameras-in-an-environment-1793837965577 -->

## 9. A timeline with keyframes
<!-- step:plan/prompt-to-scene-1793837965047/a-timeline-with-keyframes-1793837965668 -->
**Status:** Proposed

**Comments**
- someone: Folded into the plan 'Sleipnir as its own studio' (plan/sleipnir-as-its-own-studio-1794246015230) by decision on 2026-11-09. Follow that plan; skip this step.

Time for an environment: a bar under the 3D view with play, scrub and a length in seconds, and keyframes on what can move — a part's placement, a camera, a feature's numbers (a lid opening is its rotation over a second), and a placed Sketch's state. Values between keys ease; the document stores only the keys. Agents set them with model.mjs key --part Lid --at 1.5s --rotate x=-110.

**Files**
- `src/document/timeline.ts` — node (typescript)
- `src/document/timeline.test.ts` — node (typescript)
- `src/canvas/timeline/TimelineView.tsx` — view (react)
- `src/canvas/timeline/TimelineView.ViewModel.tsx` — view-model (react)

**Edits**
- `src/canvas/CanvasView.tsx`
- `src/modeling/viewport/Viewport3D.tsx`
- `src/document/types.ts`
<!-- /step-meta:plan/prompt-to-scene-1793837965047/a-timeline-with-keyframes-1793837965668 -->

<!-- /step:plan/prompt-to-scene-1793837965047/a-timeline-with-keyframes-1793837965668 -->

## 10. A placed Sketch shows its real design, and plays its states
<!-- step:plan/prompt-to-scene-1793837965047/a-placed-sketch-shows-its-real-design-and-plays-its-states-1793837973403 -->
**Status:** Proposed

**Comments**
- someone: Folded into the plan 'Sleipnir as its own studio' (plan/sleipnir-as-its-own-studio-1794246015230) by decision on 2026-11-09. Follow that plan; skip this step.

So a website looks like a website on the laptop's screen: a Sketch placed on a face is drawn as the image of its frame — text, images, fills, as the 2D board draws it — not flat fill colours. Its component variants and prototype states become keyframeable, so 'click Sign in at 2 s, the dashboard slides in' is a timeline of states. The Sketch's code is what Sleipnir already emits: the website really works outside the video.

**Files**
- `src/modeling/scene3d/sketchTexture.ts` — node (typescript)
- `src/modeling/scene3d/sketchTexture.test.ts` — node (typescript)

**Edits**
- `src/modeling/viewport/Viewport3D.tsx`
- `src/document/placements.ts`
<!-- /step-meta:plan/prompt-to-scene-1793837965047/a-placed-sketch-shows-its-real-design-and-plays-its-states-1793837973403 -->

<!-- /step:plan/prompt-to-scene-1793837965047/a-placed-sketch-shows-its-real-design-and-plays-its-states-1793837973403 -->

## 11. Export to glTF
<!-- step:plan/prompt-to-scene-1793837965047/export-to-gltf-1793988082722 -->
**Status:** Proposed

**Comments**
- someone: Folded into the plan 'Sleipnir as its own studio' (plan/sleipnir-as-its-own-studio-1794246015230) by decision on 2026-11-09. Follow that plan; skip this step.

So parts leave Sleipnir for a game engine or another tool: model.mjs export --env Desk --out desk.glb and a File menu item write each part's body (the same mesh the 3D view draws, its placement and colour), named by part, with the timeline's keyframes as glTF animation once they exist. Pure: bodies in, a GLB buffer out.

**Files**
- `src/modeling/export/exportGltf.ts` — node (typescript)
- `src/modeling/export/exportGltf.test.ts` — node (typescript)

**Edits**
- `src/modeling/geometry/body.ts`
<!-- /step-meta:plan/prompt-to-scene-1793837965047/export-to-gltf-1793988082722 -->

<!-- /step:plan/prompt-to-scene-1793837965047/export-to-gltf-1793988082722 -->

## 12. Render stills and video
<!-- step:plan/prompt-to-scene-1793837965047/render-stills-and-video-1793837973483 -->
**Status:** Proposed

**Comments**
- someone: Tabled (user, 2026-11-04): rendering belongs to the future Lightroom widget — a place to bring sketches, images and parts to add materials and render in high quality. Do not build here; it moves to the 3D creation plan's Studio step.
- someone: Folded into the plan 'Sleipnir as its own studio' (plan/sleipnir-as-its-own-studio-1794246015230) by decision on 2026-11-09. Follow that plan; skip this step.

Out of the app: a still from any camera at any size, and an MP4 of the timeline at a frame rate, encoded in the app with the browser's own video encoder (WebCodecs) and an MP4 muxer, so nothing needs installing. A render panel (camera, size, length, quality) for people; model.mjs render --env Desk --camera Hero --out desk.mp4 for agents, which the running app carries out the way it does a frame request.

**Files**
- `src/modeling/render/renderScene.ts` — node (typescript)
- `src/modeling/render/videoExport.ts` — node (typescript)
- `src/modeling/render/videoExport.test.ts` — node (typescript)
- `src/canvas/panels/RenderPanel.tsx` — view (react)

**Edits**
- `src/modeling/viewport/Viewport3D.tsx`
- `src/canvas/CanvasView.tsx`
- `package.json`
<!-- /step-meta:plan/prompt-to-scene-1793837965047/render-stills-and-video-1793837973483 -->

<!-- /step:plan/prompt-to-scene-1793837965047/render-stills-and-video-1793837973483 -->

## 13. The /render skill, and skills that hand off to each other
<!-- step:plan/prompt-to-scene-1793837965047/the-render-skill-and-skills-that-hand-off-to-each-other-1793837973560 -->
**Status:** Proposed

**Comments**
- someone: Tabled with step 9: /render becomes a skill when the Lightroom widget lands. The skill hand-off part (a /plan whose steps name /sketch, /model, /optimize) can fold into step 3 if wanted.
- someone: Folded into the plan 'Sleipnir as its own studio' (plan/sleipnir-as-its-own-studio-1794246015230) by decision on 2026-11-09. Follow that plan; skip this step.

/render teaches cameras, keys and export in a few lines. And the skills chain: a /plan for 'a working website on a 3D laptop, as a video' drafts steps that each name the skill that does them — /sketch for the site, /model for the laptop and placement, /render for the camera move and export, /optimize to keep the triangle and token budget in check — so an agent picks the cheap deterministic path at every step.

**Edits**
- `tools/agentSkills/registry.mjs`
- `tools/agentSkills/agentSkills.test.ts`
<!-- /step-meta:plan/prompt-to-scene-1793837965047/the-render-skill-and-skills-that-hand-off-to-each-other-1793837973560 -->

<!-- /step:plan/prompt-to-scene-1793837965047/the-render-skill-and-skills-that-hand-off-to-each-other-1793837973560 -->

## 14. End to end: the laptop website video
<!-- step:plan/prompt-to-scene-1793837965047/end-to-end-the-laptop-website-video-1793837973645 -->
**Status:** Proposed

**Comments**
- someone: Until Lightroom exists the acceptance test ends at the animation playing in the 3D view (camera move, lid opening, the site's states) — no MP4 export.
- someone: Folded into the plan 'Sleipnir as its own studio' (plan/sleipnir-as-its-own-studio-1794246015230) by decision on 2026-11-09. Follow that plan; skip this step.

The acceptance test, run as a user would: 'make a /plan to build out a functioning website on a mock 3D laptop, have this be a video animation'. An agent plans, builds the Sketch, places it on a library laptop, opens the lid on the timeline, moves a camera and renders an MP4; then a person clicks the lid's edge and asks 'make it thinner', and edits a point by hand. Records tokens and tool calls per step, and fixes whatever made the agent guess.

**Edits**
- `src/canvas/LAYOUT.md`
<!-- /step-meta:plan/prompt-to-scene-1793837965047/end-to-end-the-laptop-website-video-1793837973645 -->

<!-- /step:plan/prompt-to-scene-1793837965047/end-to-end-the-laptop-website-video-1793837973645 -->
