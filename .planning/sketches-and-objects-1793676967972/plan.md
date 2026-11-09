<!-- sleipnir:plan — generated from .planning/notes.json. Write freely under the title and between a step's /step-meta and /step markers; everything else is regenerated. -->
# Sketches and Objects

Make the canvas a sketch-and-part modeler in Onshape/SolidWorks terms with Figma tools: a board holds Sketches (Figma frames on a plane or on a face) and Objects (parts built by a feature list: extrude, revolve, sweep, loft, booleans). Faces, edges and points get stable names that trace back to the sketch points and features that made them, so they can be picked (Blender-style modes and hotkeys) and edited by changing their source. +Sketch / +Object replace the board's create action; 2D keeps Figma's tools, 3D gets Onshape's, in Figma words.
<!-- /plan-meta -->

<!-- steps -->

## 1. Sketches and Objects in the board
<!-- step:plan/sketches-and-objects-1793676967972/sketches-and-objects-in-the-board-1793677057757 -->
**Status:** Done — model/objects.ts: Objects with feature lists, PlaneRef and FaceName types; layer solids migrate on read; readers use solidOf; deleting a sketch prunes its features

**Comments**
- claude: Done differently in two places: no schema bump (LANGUAGES.md already reserves v2 for the outputs migration), the move is detection-based and idempotent instead; and sketch.plane is typed (PlaneRef) but layers keep space until step 3 switches them. Known gap until step 5/11: duplicating or pasting a layer doesn't copy the feature built on it.

The model change everything else builds on. A Sketch is a top-level frame (all of Figma: frames, auto layout, components, text, vectors) with sketch: { plane: PlaneRef }, where it sits in 3D. An Object is a part: { id, name, features: Feature[], placement }, and a Feature is extrude | revolve | sweep | loft | boolean, each naming the sketch (and which of its closed shapes, its 'regions') it consumes, plus depth/axis/op (new body, add, subtract, intersect). Today's per-layer space + solid fields migrate on load: a layer with a solid becomes a sketch plus an object with one feature; a placed layer without one becomes a sketch on a custom plane. Old boards keep opening; CANVAS_SCHEMA_VERSION bumps.

**Files**
- `src/01_canvas/model/objects.ts` — node (typescript)
- `src/01_canvas/model/objects.test.ts` — node (typescript)

**Edits**
- `src/01_canvas/model/types.ts`
- `src/01_canvas/model/store.ts`
- `src/01_canvas/scene3d/sceneTypes.ts`
- `src/01_canvas/scene3d/placement.ts`
<!-- /step-meta:plan/sketches-and-objects-1793676967972/sketches-and-objects-in-the-board-1793677057757 -->

<!-- /step:plan/sketches-and-objects-1793676967972/sketches-and-objects-in-the-board-1793677057757 -->

## 2. Bodies with named faces, edges and points
<!-- step:plan/sketches-and-objects-1793676967972/bodies-with-named-faces-edges-and-points-1793677057862 -->
**Status:** Done — geometry/body.ts: objects evaluate to scene-space bodies with CAD-style named faces (box 6 / cylinder 3), edges (12 / 2) and corners (8 / 0); every builder tags its triangles

**Comments**
- claude: Booleans aren't done: subtract and intersect build as added bodies and say so in body.notes; real CSG needs a library (manifold-3d or three-bvh-csg) — worth deciding before step 11's Combine. Lofts likewise noted, not built. The views still draw through sceneMeshes; they switch to bodies in steps 9 (3D picking) and 12 (2D).

Evaluate an Object's feature list into a body whose every face, edge and vertex has a stable name saying where it came from, the way Onshape keeps 'Extrude 1 > end cap' alive across edits: { feature, role: start-cap | end-cap | side, sketch node id, outline segment or point index }. Triangles keep the face they belong to, so a click (a 3D raycast's faceIndex, or a 2D projected triangle) resolves to a face, its edges and its corners. Built on geometry/modifiers' extrude, revolve and sweep, plus booleans between bodies. This is what makes 'pick the top face' and 'drag that corner' answerable at all.

**Files**
- `src/01_canvas/geometry/body.ts` — node (typescript)
- `src/01_canvas/geometry/body.test.ts` — node (typescript)

**Edits**
- `src/01_canvas/geometry/modifiers.ts`
- `src/01_canvas/geometry/mesh.ts`
- `src/01_canvas/scene3d/sceneMeshes.ts`
<!-- /step-meta:plan/sketches-and-objects-1793676967972/bodies-with-named-faces-edges-and-points-1793677057862 -->

<!-- /step:plan/sketches-and-objects-1793676967972/bodies-with-named-faces-edges-and-points-1793677057862 -->

## 3. Planes a sketch can sit on
<!-- step:plan/sketches-and-objects-1793676967972/planes-a-sketch-can-sit-on-1793677057969 -->
**Status:** Done — scene3d/planeRefs.ts: sketches stand on Front/Top/Right, offset planes or an object's face and follow it; 2D drags slide them along their plane; inspector picks the plane

**Comments**
- claude: Built as: node.sketch = { plane, at } is the source and space is resolved from it after every edit and on load (resolvePlanes), so every existing reader keeps working. Gizmo or typed position/rotation frees a sketch (plane: custom). Attaching to a face works in the model and tests; its picking UI comes with step 4's 'pick a face'. Not checked in the app this time: the isolated test window closed on its own before I could drive it.

PlaneRef resolution: the three default planes (Front, Top, Right, named as Onshape names them), an offset or angled plane from one of them, or a face of an object (by its stable name from the previous step). A sketch on a face moves when the face moves: extrude a box, sketch a circle on its top, extrude that, then change the box's depth and the second feature rides along. Replaces free-floating space for sketches; the front view and plane edit (scene3d/frontView.ts, planeEdit.ts) read the resolved placement.

**Files**
- `src/01_canvas/scene3d/planeRefs.ts` — node (typescript)
- `src/01_canvas/scene3d/planeRefs.test.ts` — node (typescript)

**Edits**
- `src/01_canvas/scene3d/placement.ts`
- `src/01_canvas/scene3d/planeEdit.ts`
- `src/01_canvas/scene3d/frontView.ts`
<!-- /step-meta:plan/sketches-and-objects-1793676967972/planes-a-sketch-can-sit-on-1793677057969 -->

<!-- /step:plan/sketches-and-objects-1793676967972/planes-a-sketch-can-sit-on-1793677057969 -->

## 4. What goes where: left panel, toolbox, right panel
<!-- step:plan/sketches-and-objects-1793676967972/what-goes-where-left-panel-toolbox-right-panel-1793726031278 -->
**Status:** Done — src/01_canvas/LAYOUT.md: left panel lists and adds, toolbox shapes (grouped, one registry), right panel edits, view controls apart; Figma/Onshape name map

One rule for the canvas, 2D and 3D alike, written down so every later step follows it. Left panel: what's in the scene, sketches and objects with their layers and features, and adding a new sketch to the list (+ Sketch); it never shapes anything. Toolbox: every tool that draws or shapes, grouped by what it acts on: select and edit-mode picks (points, edges, faces), 2D drawing (frame, shapes, pen, text), 3D shaping (extrude, revolve, sweep, loft, combine, plane), starter shapes (box, cylinder, sphere, cone, torus, polygon), transform (move, rotate, scale), and later sculpt brushes. Right panel: the settings of whatever is selected, a layer's fill and layout, a feature's depth and axis, a point's position; it never creates. Each tool lives in exactly one place. The doc also maps Figma's and Onshape's names for each.

**Files**
- `src/01_canvas/LAYOUT.md` — node (react)
<!-- /step-meta:plan/sketches-and-objects-1793676967972/what-goes-where-left-panel-toolbox-right-panel-1793726031278 -->

<!-- /step:plan/sketches-and-objects-1793676967972/what-goes-where-left-panel-toolbox-right-panel-1793726031278 -->

## 5. +Sketch and +Object in the left panel
<!-- step:plan/sketches-and-objects-1793676967972/sketch-and-object-in-the-left-panel-1793677058067 -->
**Status:** Done — + Sketch under the board picker: Front / Top / Right open a new sketch face on; On a face… picks an object's face in 3D (clicks pass through flat layers); checked in the app

**Comments**
- claude: Changed by 'What goes where' (requested 2026-11-03): the left panel only lists and adds sketches. This step builds + Sketch (Front / Top / Right / a face); the + Object starter shapes and Extrude/Revolve/Sweep/Loft move to the toolbox ('The toolbox in 3D'). Objects appear in the left panel when a tool makes one.

Under the board picker (it stays the panel's one search and board switcher, per the left-rail rule), two create buttons become the main way to add things. + Sketch asks where: Front, Top, Right, or 'pick a face' (in 3D), then opens it in sketch mode. + Object offers icons: from a sketch (Extrude, Revolve, Sweep, Loft, using the selected sketch or asking for one) or a starter shape (Box, Cylinder, Sphere, Plane), each made as a sketch plus a feature so it edits the same way. 'New board' stays in the picker's create row.

**Files**
- `src/01_canvas/panels/CreateBar.tsx` — view (react)

**Edits**
- `src/01_canvas/CanvasView.tsx`
- `src/01_canvas/CanvasView.ViewModel.tsx`
<!-- /step-meta:plan/sketches-and-objects-1793676967972/sketch-and-object-in-the-left-panel-1793677058067 -->

<!-- /step:plan/sketches-and-objects-1793676967972/sketch-and-object-in-the-left-panel-1793677058067 -->

## 6. The toolbox in 3D: shaping tools and starter shapes
<!-- step:plan/sketches-and-objects-1793676967972/the-toolbox-in-3d-shaping-tools-and-starter-shapes-1793726031365 -->
**Status:** Done — One toolbox in 2D and 3D: Extrude/Revolve/Sweep/Loft act on the selection (disabled ones say why); Box, Cylinder, Sphere, Cone, Torus, Polygon as sketch + feature; Move/Rotate/Scale moved in from the 3D bar; checked in the app

**Comments**
- claude: Built in the new layout: registry at src/canvas/board/toolbox.ts; starter shapes at src/modeling/scene3d/starterShapes.ts (not document/, since Top-plane shapes need the plane resolver). Starter shapes land clear of the scene, standing on the ground. Loft is listed but disabled ('Lofts aren't built yet'); the E hotkey waits for the hotkeys step.

Brought forward so each step can be seen in the app. The board's toolbox gets its 3D groups beside the 2D ones (one toolbox, the groups shown for the view you're in): Extrude, Revolve, Sweep and Loft act on the selected sketch (or ask for one) and create or extend an Object; starter shapes, Box, Cylinder, Sphere, Cone, Torus and Polygon (n sides), each made as a sketch plus a feature (a sphere is a revolved half circle, a polygon an extruded n-gon) so they edit like anything else. Tools are defined once in a registry both views read, with their key, icon and which view they belong to. Settings for what a tool made appear in the right panel (the inspector's Solid section until the feature inspector lands).

**Files**
- `src/01_canvas/board/toolbox.ts` — node (typescript)
- `src/01_canvas/model/starterShapes.ts` — node (typescript)
- `src/01_canvas/model/starterShapes.test.ts` — node (typescript)

**Edits**
- `src/01_canvas/board/CanvasToolbar.tsx`
- `src/01_canvas/viewport/Viewport3D.tsx`
- `src/01_canvas/CanvasView.tsx`
- `src/01_canvas/CanvasView.ViewModel.tsx`
<!-- /step-meta:plan/sketches-and-objects-1793676967972/the-toolbox-in-3d-shaping-tools-and-starter-shapes-1793726031365 -->

<!-- /step:plan/sketches-and-objects-1793676967972/the-toolbox-in-3d-shaping-tools-and-starter-shapes-1793726031365 -->

## 7. Layers: Sketches, and Objects with their feature list
<!-- step:plan/sketches-and-objects-1793676967972/layers-sketches-and-objects-with-their-feature-list-1793677058165 -->
**Status:** Done — Left panel: Front/Top/Side sections plus Objects, each object opening to its features with the sketch each uses (used sketches leave their plane section); object eye hides the part, feature eye suppresses the step; double-click opens a sketch; checked in the app

**Comments**
- claude: Started early (requested 2026-11-03): the layers panel now groups top-level layers into Front / Top / Side sections (always shown; offsets file under their base plane), plus 'On faces' and 'Placed freely' when used. Each section has + (new sketch there) and an eye for all of it (panels/planeGroups.ts). Still to do here: the Objects list with its feature tree.
- claude: Not done here: dragging features to reorder (it needs rebuild ordering, worth doing with the feature inspector step), renaming an object, and a delete-object menu item.

The layers panel splits in two, like Onshape's feature list over its parts list, in Figma's look. Sketches: each sketch frame with its layer tree, as today. Objects: each part, expanding to its features in order (Sketch 1 > Extrude 1 > Sketch 2 > Revolve 1); clicking a feature selects it, double-clicking a sketch opens sketch mode, dragging reorders (rebuilding after), an eye hides. A sketch a feature consumes shows under that feature, as in Onshape.

**Files**
- `src/01_canvas/panels/FeatureTree.tsx` — view (react)

**Edits**
- `src/01_canvas/panels/CanvasLayersPanel.tsx`
- `src/01_canvas/CanvasView.tsx`
<!-- /step-meta:plan/sketches-and-objects-1793676967972/layers-sketches-and-objects-with-their-feature-list-1793677058165 -->

<!-- /step:plan/sketches-and-objects-1793676967972/layers-sketches-and-objects-with-their-feature-list-1793677058165 -->

## 8. Sketch mode: Figma on the sketch's plane
<!-- step:plan/sketches-and-objects-1793676967972/sketch-mode-figma-on-the-sketch-s-plane-1793677058267 -->
**Status:** Done — Sketch mode: bodies flattened onto the open sketch's plane as a faint silhouette plus edges (scene3d/sketchGhost.ts); the open sketch draws flat; sketch bar shows name, plane, Finish sketch; guides use real anchors; checked in the app

**Comments**
- claude: Not done here: snapping drawn points to the backdrop's edges and corners (they're shown, not snapped to yet), and 'features rebuild on Finish' needed nothing new since features already rebuild on every edit. Kept the internal name planeEdit; only the UI says sketch mode.

Plane edit (scene3d/planeEdit.ts) becomes sketch mode in Onshape's sense: open a sketch (double-click it, its tree row, or + Sketch) and the board shows that plane face on with every Figma tool, the bodies it sits on ghosted and projected onto the plane so you can draw against their edges, plus the cross-plane guides. Finish sketch (or Esc) closes it and the features using it rebuild. Plane edit's chip becomes the Onshape-style sketch bar: the sketch's name, its plane, Finish.

**Edits**
- `src/01_canvas/scene3d/planeEdit.ts`
- `src/01_canvas/CanvasView.ViewModel.tsx`
- `src/01_canvas/board/CanvasBoard.tsx`
- `src/01_canvas/scene3d/sketchPlane.ts`
<!-- /step-meta:plan/sketches-and-objects-1793676967972/sketch-mode-figma-on-the-sketch-s-plane-1793677058267 -->

<!-- /step:plan/sketches-and-objects-1793676967972/sketch-mode-figma-on-the-sketch-s-plane-1793677058267 -->

## 9. Sketch mode in 3D: the board laid over the scene
<!-- step:plan/sketches-and-objects-1793676967972/sketch-mode-in-3d-the-board-laid-over-the-scene-1793677058374 -->
**Status:** Proposed

**Comments**
- claude: Carried into the 'Sketches and Environments' plan (2026-11-04, after the canvas critique): build it there, where sketches and environments are separate documents.

The seamless half: opening a sketch in the 3D view turns the camera to face its plane and locks it orthographic, and the live 2D board (DOM, transparent background) is drawn on top, its pan and zoom driving the 3D camera, so you draw with Figma's tools while the solids show behind. Finishing swings the camera back. This is the 'add 2D sketches into a 3D environment' moment, without two editors.

**Files**
- `src/01_canvas/viewport/SketchInScene.tsx` — view (react)

**Edits**
- `src/01_canvas/viewport/Viewport3D.tsx`
- `src/01_canvas/CanvasView.tsx`
- `src/01_canvas/hooks/usePanZoom.ts`
- `src/01_canvas/viewport/cameraViews.ts`
<!-- /step-meta:plan/sketches-and-objects-1793676967972/sketch-mode-in-3d-the-board-laid-over-the-scene-1793677058374 -->

<!-- /step:plan/sketches-and-objects-1793676967972/sketch-mode-in-3d-the-board-laid-over-the-scene-1793677058374 -->

## 10. What editing a face, edge or point changes
<!-- step:plan/sketches-and-objects-1793676967972/what-editing-a-face-edge-or-point-changes-1793677066141 -->
**Status:** Proposed

**Comments**
- claude: Carried into the 'Sketches and Environments' plan (2026-11-04, after the canvas critique): build it there, where sketches and environments are separate documents.

The rules, as pure functions, from a named element and a move to a change in the sketch or feature that made it: a cap's corner moves that sketch point (on the plane, through the inverse plane matrix); dragging a side face pushes or pulls its outline segment; an end cap pulled along its normal changes the extrude's depth (push/pull, as in Onshape or SketchUp); a revolve's faces move profile points; an edge moves its two points. Anything with no source (a boolean seam) says so rather than guessing. The 3D creation plan's 'Editable meshes' step is the escape hatch for free-form mesh editing beyond this.

**Files**
- `src/01_canvas/geometry/editBody.ts` — node (typescript)
- `src/01_canvas/geometry/editBody.test.ts` — node (typescript)
<!-- /step-meta:plan/sketches-and-objects-1793676967972/what-editing-a-face-edge-or-point-changes-1793677066141 -->

<!-- /step:plan/sketches-and-objects-1793676967972/what-editing-a-face-edge-or-point-changes-1793677066141 -->

## 11. Selection modes and hotkeys
<!-- step:plan/sketches-and-objects-1793676967972/selection-modes-and-hotkeys-1793677066279 -->
**Status:** Proposed

**Comments**
- claude: Carried into the 'Sketches and Environments' plan (2026-11-04, after the canvas critique): build it there, where sketches and environments are separate documents.

Blender's select modes on any object, in 3D and in the 2D front view: Tab toggles object and edit mode, 1 / 2 / 3 pick points, edges or faces, click selects, Shift adds, A all, Alt+A none, box-drag selects in edit mode. Hover highlights the face or edge under the cursor; selected points draw as dots, edges as lines, faces tinted. Figma's keys stay while a sketch is open (V, F, R, O, P, T); Blender's apply in 3D and on objects; a ? overlay lists both. Picking uses the named triangles from 'Bodies with named faces, edges and points'.

**Files**
- `src/01_canvas/viewport/selectionModes.ts` — controller (typescript)
- `src/01_canvas/viewport/selectionModes.test.ts` — node (typescript)

**Edits**
- `src/01_canvas/viewport/Viewport3D.tsx`
- `src/01_canvas/viewport/Viewport3D.ViewModel.tsx`
- `src/01_canvas/board/ProjectedSolid.tsx`
- `src/01_canvas/CanvasView.ViewModel.tsx`
- `src/01_canvas/board/CanvasToolbar.tsx`
<!-- /step-meta:plan/sketches-and-objects-1793676967972/selection-modes-and-hotkeys-1793677066279 -->

<!-- /step:plan/sketches-and-objects-1793676967972/selection-modes-and-hotkeys-1793677066279 -->

## 12. Grab, rotate, scale and push/pull
<!-- step:plan/sketches-and-objects-1793676967972/grab-rotate-scale-and-push-pull-1793677066405 -->
**Status:** Proposed

**Comments**
- claude: Carried into the 'Sketches and Environments' plan (2026-11-04, after the canvas critique): build it there, where sketches and environments are separate documents.

Blender's modal transforms on whatever is selected: G grab, R rotate, S scale, then X / Y / Z to lock an axis (twice for local), type a number for an exact amount, Enter or click to confirm, Esc or right-click to cancel. On an object they move its placement; on faces, edges and points they go through 'What editing a face, edge or point changes', so dragging a cube's top face up deepens the extrude and its corners stay on the sketch. The gizmo (viewport/TransformGizmo.tsx) does the same by mouse.

**Files**
- `src/01_canvas/viewport/modalTransform.ts` — controller (typescript)
- `src/01_canvas/viewport/modalTransform.test.ts` — node (typescript)

**Edits**
- `src/01_canvas/viewport/Viewport3D.tsx`
- `src/01_canvas/viewport/TransformGizmo.tsx`
- `src/01_canvas/CanvasView.ViewModel.tsx`
<!-- /step-meta:plan/sketches-and-objects-1793676967972/grab-rotate-scale-and-push-pull-1793677066405 -->

<!-- /step:plan/sketches-and-objects-1793676967972/grab-rotate-scale-and-push-pull-1793677066405 -->

## 13. 3D tools and the feature inspector
<!-- step:plan/sketches-and-objects-1793676967972/3d-tools-and-the-feature-inspector-1793677066558 -->
**Status:** Proposed

**Comments**
- claude: The toolbox half (Toolbar3D, the tool buttons) moved forward to 'The toolbox in 3D: shaping tools and starter shapes'. This step keeps the right-panel half: the feature inspector with live preview and OK/Cancel, and Combine once booleans exist.
- claude: Carried into the 'Sketches and Environments' plan (2026-11-04, after the canvas critique): build it there, where sketches and environments are separate documents.

3D's toolbar is Onshape's feature set in Figma's style and words: Select, Sketch, Extrude, Revolve, Sweep, Loft, Combine (union / subtract / intersect), Plane, Move. Choosing one with a sketch or face selected starts that feature with a live preview; the inspector shows its fields (depth, direction, both sides, add or subtract into which object, axis, angle) as Onshape's feature dialog does, with OK and Cancel. SolidSection's per-layer solid controls fold into it.

**Files**
- `src/01_canvas/viewport/Toolbar3D.tsx` — view (react)
- `src/01_canvas/panels/FeatureSection.tsx` — view (react)

**Edits**
- `src/01_canvas/viewport/Viewport3D.tsx`
- `src/01_canvas/panels/CanvasInspector.tsx`
- `src/01_canvas/panels/SolidSection.tsx`
- `src/01_canvas/board/CanvasToolbar.tsx`
<!-- /step-meta:plan/sketches-and-objects-1793676967972/3d-tools-and-the-feature-inspector-1793677066558 -->

<!-- /step:plan/sketches-and-objects-1793676967972/3d-tools-and-the-feature-inspector-1793677066558 -->

## 14. The front view draws objects from their bodies
<!-- step:plan/sketches-and-objects-1793676967972/the-front-view-draws-objects-from-their-bodies-1793677066672 -->
**Status:** Proposed

**Comments**
- claude: Carried into the 'Sketches and Environments' plan (2026-11-04, after the canvas critique): build it there, where sketches and environments are separate documents.

The 2D board stops drawing solids per layer (scene3d/sceneMeshes.ts projectedSolidsOf) and draws every Object's evaluated body through the front camera with its named faces, so picking, hover and edit-mode dots work in 2D too. Sketches draw as frames on their planes as now (squashed, sheared or edge-on); a sketch a feature has consumed draws as a thin outline. Retires drawsAsSolid.

**Edits**
- `src/01_canvas/scene3d/sceneMeshes.ts`
- `src/01_canvas/board/ProjectedSolid.tsx`
- `src/01_canvas/board/CanvasBoard.tsx`
- `src/01_canvas/scene3d/frontView.ts`
<!-- /step-meta:plan/sketches-and-objects-1793676967972/the-front-view-draws-objects-from-their-bodies-1793677066672 -->

<!-- /step:plan/sketches-and-objects-1793676967972/the-front-view-draws-objects-from-their-bodies-1793677066672 -->

## 15. Agents and files speak sketches and objects
<!-- step:plan/sketches-and-objects-1793676967972/agents-and-files-speak-sketches-and-objects-1793677066788 -->
**Status:** Proposed

**Comments**
- claude: Carried into the 'Sketches and Environments' plan (2026-11-04, after the canvas critique): build it there, where sketches and environments are separate documents.

The canvas CLI agents use (/frame and /component through tools/agentSkills/vendor/canvas.mjs, copied into projects as .sleipnir/canvas.mjs) and the board file learn sketches, planes, objects and features, so an AI can say 'sketch a circle on the top face of Box and extrude it 2 cm' and Sleipnir builds it. The /frame and /component skill text explains the two kinds. Emitted 2D component code is unchanged: a sketch is still a frame.

**Edits**
- `tools/agentSkills/vendor/canvas.mjs`
- `tools/agentSkills/registry.mjs`
- `src/01_canvas/model/store.ts`
<!-- /step-meta:plan/sketches-and-objects-1793676967972/agents-and-files-speak-sketches-and-objects-1793677066788 -->

<!-- /step:plan/sketches-and-objects-1793676967972/agents-and-files-speak-sketches-and-objects-1793677066788 -->

## 16. Verify in the running app
<!-- step:plan/sketches-and-objects-1793676967972/verify-in-the-running-app-1793677066924 -->
**Status:** Proposed

**Comments**
- claude: Carried into the 'Sketches and Environments' plan (2026-11-04, after the canvas critique): build it there, where sketches and environments are separate documents.

Over CDP in the dev app with a scratch project: + Object > Box; pick its top face (Tab, 3, click) in 3D and in 2D; G, Z, 20 raises it and the depth changes; + Sketch on that face, draw a circle with Figma's ellipse tool in sketch mode (2D and 3D), Finish, Extrude it; change the box's depth and the circle's extrude follows; select a corner (1) and drag it, and the sketch point moves; an old board with per-layer solids opens migrated.

**Edits**
- `src/01_canvas/CanvasView.test.tsx`
<!-- /step-meta:plan/sketches-and-objects-1793676967972/verify-in-the-running-app-1793677066924 -->

<!-- /step:plan/sketches-and-objects-1793676967972/verify-in-the-running-app-1793677066924 -->
