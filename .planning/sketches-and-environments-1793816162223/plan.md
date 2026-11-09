<!-- sleipnir:plan — generated from .planning/notes.json. Write freely under the title and between a step's /step-meta and /step markers; everything else is regenerated. -->
# Sketches and Environments

Restructure the canvas around two document kinds, picked like plans from one left-panel picker: a Sketch (2D, Figma: frames, layers, components, emits code, no planes) and an Environment (3D, Onshape: planes, sketches placed on them, features, parts). The document decides 2D or 3D, so the toggle goes. Sketches are placed into environments as links (Unlink makes a local copy); the environment lists parts first; broken links and steps are flagged, never silently deleted. Carries the rest of the Sketches and Objects plan, per the 2026-11-04 critique.
<!-- /plan-meta -->

<!-- steps -->

## 1. One word per concept
<!-- step:plan/sketches-and-environments-1793816162223/one-word-per-concept-1793816213052 -->
**Status:** Done — LAYOUT.md opens with the vocabulary table (Sketch, Environment, Part, Feature, Plane, Place/Unlink, Sketch mode); Objects → Parts, Placed freely → Custom plane in the UI; picker and toggle wording move with steps 2–3

The vocabulary, decided before any UI moves, in src/canvas/LAYOUT.md and every label: Sketch is the 2D document (today's board; Figma's file); Environment is the 3D document (Onshape's Part Studio); a sketch inside an environment is still a sketch, either placed there from a Sketch document (linked) or drawn there (local); Part is a solid an environment builds (today's 'Object'); Feature is a step that builds it (Extrude 1); Plane is Front, Top, Side or custom; Place puts a sketch into an environment, Unlink makes it a local copy; Sketch mode is editing a sketch face on (Edit sketch / Finish sketch). Board, canvas-as-document, Object, Done, 'Placed freely' and the 2D/3D labels go. Canvas stays only as the app rail's name.

**Edits**
- `src/canvas/LAYOUT.md`
- `src/canvas/panels/CanvasLayersPanel.tsx`
- `src/canvas/panels/CreateBar.tsx`
- `src/canvas/board/CanvasBoard.tsx`
<!-- /step-meta:plan/sketches-and-environments-1793816162223/one-word-per-concept-1793816213052 -->

<!-- /step:plan/sketches-and-environments-1793816162223/one-word-per-concept-1793816213052 -->

## 2. Two document kinds: Sketch and Environment
<!-- step:plan/sketches-and-environments-1793816162223/two-document-kinds-sketch-and-environment-1793816213155 -->
**Status:** Done — CanvasDoc.kind (sketch|environment); legacy boards read from contents; createDoc/parseDoc/listDocs carry it; 4 tests

**Comments**
- someone: Splitting UI frames out of existing environments into linked sketches is deferred to step 4 (placements): this step only classifies documents, so nothing on a board moves yet.

A document says what it is: kind 'sketch' (frames, layers, components; no planes, no parts) or 'environment' (local sketches on planes, placements of sketch documents, parts). Stored side by side in .components/.boards as today. Today's boards migrate on read: one with no parts and no placed layers is a Sketch; one with parts becomes an Environment, and any frame a part's feature consumes that also emits a component stays in a Sketch and is placed into the environment as a link, so no UI component is ever copied. Idempotent, like the solids migration.

**Files**
- `src/document/documentKind.ts` — node (typescript)
- `src/document/documentKind.test.ts` — node (typescript)

**Edits**
- `src/document/types.ts`
- `src/document/doc.ts`
- `src/canvas/io/store.ts`
- `src/document/objects.ts`
<!-- /step-meta:plan/sketches-and-environments-1793816162223/two-document-kinds-sketch-and-environment-1793816213155 -->

<!-- /step:plan/sketches-and-environments-1793816162223/two-document-kinds-sketch-and-environment-1793816213155 -->

## 3. One picker for sketches and environments; the document decides the view
<!-- step:plan/sketches-and-environments-1793816162223/one-picker-for-sketches-and-environments-the-document-decides-the-view-1793816213264 -->
**Status:** Done — Picker groups Sketches/Environments with New sketch + New environment; kind icons on tabs; 2D/3D toggle gone (sketch → 2D, environment → 3D, sketch mode = its 2D); ⋯ menu deletes; Sketch has a flat layer list, no + Sketch or 3D tools; checked in the app

The left panel's picker lists both kinds, like plans: two groups with their icons, one search, and New sketch / New environment in its create row. Tabs carry the kind's icon. Opening a Sketch shows the 2D board; opening an Environment shows the 3D view. The 2D/3D toggle is removed, and with it the 'front view of the scene' board for environments — the 3D view's Front button is that view now. The delete-board trash moves into the picker row's menu.

**Edits**
- `src/canvas/CanvasView.tsx`
- `src/canvas/useBoardTabs.ts`
- `src/canvas/hooks/useCanvasBoards.ts`
- `src/app/WorkspaceTabStrip/TabPicker.tsx`
<!-- /step-meta:plan/sketches-and-environments-1793816162223/one-picker-for-sketches-and-environments-the-document-decides-the-view-1793816213264 -->

<!-- /step:plan/sketches-and-environments-1793816162223/one-picker-for-sketches-and-environments-the-document-decides-the-view-1793816213264 -->

## 4. Place a sketch into an environment, linked
<!-- step:plan/sketches-and-environments-1793816162223/place-a-sketch-into-an-environment-linked-1793816213387 -->
**Status:** Done — SketchSpec.link + document/placements.ts (copy with stable ids, refresh, unlink); + Sketch › From a sketch; links refresh on open and on outside changes; inspector Linked to · Open · Unlink; Sketch lists where it's used; checked in the app

A placement in an environment points at a Sketch document (and optionally one frame in it), with the plane it stands on, its spot there and its scale (1 px = 1 mm by default). Edits in the sketch flow through: the environment reloads the referenced sketch and its features rebuild. + Sketch gains 'From a sketch…'. The sketch's frames show 'Used in 2 environments' so they can be found again. Unlink turns a placement into a local copy (Figma's detach, Blender's append). Local sketches — drawn on a face inside the environment — stay local, since a face only exists there.

**Files**
- `src/document/placements.ts` — node (typescript)
- `src/document/placements.test.ts` — node (typescript)

**Edits**
- `src/modeling/scene3d/planeRefs.ts`
- `src/canvas/CanvasView.ViewModel.tsx`
- `src/canvas/hooks/useModelingTools.ts`
- `src/canvas/panels/CreateBar.tsx`
- `src/canvas/io/store.ts`
<!-- /step-meta:plan/sketches-and-environments-1793816162223/place-a-sketch-into-an-environment-linked-1793816213387 -->

<!-- /step:plan/sketches-and-environments-1793816162223/place-a-sketch-into-an-environment-linked-1793816213387 -->

## 5. The environment lists parts first
<!-- step:plan/sketches-and-environments-1793816162223/the-environment-lists-parts-first-1793816213532 -->
**Status:** Done — Environment panel: Parts → unused Sketches (plane as grey text, link glyph + 'from Card') → Planes (closed, eye + add); no '· empty'; quieter headings; sketch mode says it's filtered; Sketch keeps the plain tree

An environment's left panel, by what was built rather than where it sits: Parts (each with its features, each feature's sketch folded under it), then Sketches not yet used (flat, the plane as grey trailing text, a link glyph and 'from Sketch › Frame' on a placed one), then Planes (Front, Top, Side and custom, collapsed, with their eyes). No '· empty' rows. A Sketch document's left panel is Figma's layer tree only — no plane sections, no parts. Section headings get a lighter weight than rows. Sketch mode's filtered list says it's filtered.

**Edits**
- `src/canvas/panels/CanvasLayersPanel.tsx`
- `src/canvas/panels/planeGroups.ts`
- `src/canvas/panels/planeGroups.test.ts`
<!-- /step-meta:plan/sketches-and-environments-1793816162223/the-environment-lists-parts-first-1793816213532 -->

<!-- /step:plan/sketches-and-environments-1793816162223/the-environment-lists-parts-first-1793816213532 -->

## 6. Broken links and broken features, flagged not deleted
<!-- step:plan/sketches-and-environments-1793816162223/broken-links-and-broken-features-flagged-not-deleted-1793816213656 -->
**Status:** Done — pruneObjects gone: broken features/face sketches/dead links stay, marked with why (red, --danger token); feature menu Re-pick sketch/path + Delete; right panel Re-pick face or pick a plane; checked in the app

Deleting or reflowing what a feature or placement depends on no longer deletes the part silently (today's pruneObjects). The feature or placement stays, marked broken in the list (Onshape's red feature) with why ('Sketch 2 was deleted', 'the face it stood on is gone'), and the part is built without it. The right panel offers Re-pick sketch, Re-pick face, or Delete. Undo restores as always.

**Edits**
- `src/document/objects.ts`
- `src/modeling/geometry/body.ts`
- `src/modeling/scene3d/planeRefs.ts`
- `src/canvas/panels/CanvasLayersPanel.tsx`
- `src/canvas/panels/CanvasInspector.tsx`
<!-- /step-meta:plan/sketches-and-environments-1793816162223/broken-links-and-broken-features-flagged-not-deleted-1793816213656 -->

<!-- /step:plan/sketches-and-environments-1793816162223/broken-links-and-broken-features-flagged-not-deleted-1793816213656 -->

## 7. The right panel follows what is selected
<!-- step:plan/sketches-and-environments-1793816162223/the-right-panel-follows-what-is-selected-1793816213795 -->
**Status:** Done — Environment right panel: Sketch name · Part (rename, built by) · Plane (Edit in sketch / Unlink) · feature settings titled by feature · Size · shape · Fill/Stroke; no layout/spacing/clip/effects/target/component tools; linked layers read-only; Sketch docs keep Figma's panel

No Figma layout, margin, clip or 'Make SVG component' on a part or an environment's sketch. A Sketch document's layers keep Figma's design panel. In an environment: a sketch shows its plane, offset, spot and (when placed) its source with Edit in sketch and Unlink; a part shows its name and placement; a feature shows its settings (until the feature inspector step adds preview and OK / Cancel).

**Edits**
- `src/canvas/panels/CanvasInspector.tsx`
- `src/canvas/panels/PlaneSection.tsx`
- `src/canvas/panels/SolidSection.tsx`
<!-- /step-meta:plan/sketches-and-environments-1793816162223/the-right-panel-follows-what-is-selected-1793816213795 -->

<!-- /step:plan/sketches-and-environments-1793816162223/the-right-panel-follows-what-is-selected-1793816213795 -->

## 8. Toolbox and controls follow the document
<!-- step:plan/sketches-and-environments-1793816162223/toolbox-and-controls-follow-the-document-1793816213939 -->
**Status:** Done — Environment toolbox: Select · Sketch (plane/face/from a sketch) · shaping · starters · Move/Rotate/Scale; sketch mode: drawing + shaping; Blender G/R/S in 3D, Figma keys in 2D; one Fit (top bar) for both views; % hidden in 3D; ? sheet per document

In a Sketch: Figma's tools only. In an Environment: Sketch first (opens + Sketch's choices: a plane, a face, from a sketch), then the shaping tools, starter shapes and Move / Rotate / Scale; in sketch mode the 2D drawing tools take over. One Fit, the top bar's; the 3D view's own bar keeps Persp / Front / Top / Side only; the % zoom hides in 3D. Key maps follow the document: Figma's in a sketch and in sketch mode, Blender's in an environment, so R is never two things at once.

**Edits**
- `src/canvas/board/toolbox.ts`
- `src/canvas/board/CanvasToolbar.tsx`
- `src/canvas/CanvasView.tsx`
- `src/modeling/viewport/Viewport3D.tsx`
- `src/canvas/hooks/useCanvasShortcuts.ts`
<!-- /step-meta:plan/sketches-and-environments-1793816162223/toolbox-and-controls-follow-the-document-1793816213939 -->

<!-- /step:plan/sketches-and-environments-1793816162223/toolbox-and-controls-follow-the-document-1793816213939 -->

## 9. Smoothness for curved solids
<!-- step:plan/sketches-and-environments-1793816162223/smoothness-for-curved-solids-1793816214053 -->
**Status:** Done — Feature.smoothness (Low/Medium/High → flattening tolerance + revolve steps), used by both the 3D mesh and the picked body; Smoothness segment beside the triangle count; edits keep smoothness/direction/hidden; Polygon starter points at its sides

How many polygons a curved solid is made of, set per feature in the right panel: a Smoothness control (low / medium / high, or a number) drives how finely circles and curves are flattened (geometry/shape.ts DEFAULT_TOLERANCE) and a revolve's or sweep's steps, with the triangle count shown beside it. Polygon sides are already editable on a polygon's own layer; the starter Polygon says so. Ties in with the 3D creation plan's polygon-budget step.

**Edits**
- `src/modeling/geometry/shape.ts`
- `src/modeling/geometry/body.ts`
- `src/modeling/scene3d/sceneMeshes.ts`
- `src/document/objects.ts`
- `src/canvas/panels/SolidSection.tsx`
<!-- /step-meta:plan/sketches-and-environments-1793816162223/smoothness-for-curved-solids-1793816214053 -->

<!-- /step:plan/sketches-and-environments-1793816162223/smoothness-for-curved-solids-1793816214053 -->

## 10. Sketch mode inside an environment
<!-- step:plan/sketches-and-environments-1793816162223/sketch-mode-inside-an-environment-1793816214193 -->
**Status:** Done — Sketch mode draws over the live 3D scene: a transparent board on top, an orthographic camera facing the plane that follows the board's pan/zoom (sketchCameraPose, tested); the open sketch hidden in 3D; ghost dropped; Finish sketch returns to the 3D view

From the Sketches and Objects plan: opening a sketch in an environment turns the 3D camera to face its plane, locks it orthographic, and lays the live 2D board over the scene (transparent, its pan and zoom driving the camera), so Figma's tools draw while the parts and the ghosted bodies show behind. Finish sketch swings the camera back. Replaces today's switch to a separate 2D board for sketch mode.

**Files**
- `src/modeling/viewport/SketchInScene.tsx` — view (react)

**Edits**
- `src/modeling/viewport/Viewport3D.tsx`
- `src/canvas/CanvasView.tsx`
- `src/canvas/hooks/usePanZoom.ts`
- `src/modeling/viewport/cameraViews.ts`
<!-- /step-meta:plan/sketches-and-environments-1793816162223/sketch-mode-inside-an-environment-1793816214193 -->

<!-- /step:plan/sketches-and-environments-1793816162223/sketch-mode-inside-an-environment-1793816214193 -->

## 11. What editing a face, edge or point changes
<!-- step:plan/sketches-and-environments-1793816162223/what-editing-a-face-edge-or-point-changes-1793816214345 -->
**Status:** Done — geometry/editBody.ts: face/edge/corner + scene move → depth (end cap), sketch offset (start cap), outline segment (side, rim) or one point (corner, side-side edge), matched by where the pick lies; placed sketches and revolves/sweeps say why; body.sceneToLayer inverse; 6 tests. No UI yet — selection modes and G/R/S wire it

From the Sketches and Objects plan: pure rules from a named face, edge or vertex and a move to a change in the sketch or feature that made it — a cap corner moves its sketch point (through the plane), a side face pushes its outline segment, an end cap pulled along its normal changes depth, an edge moves its two points. A placed (linked) sketch is edited in its Sketch document; the rule says so rather than editing a copy.

**Files**
- `src/modeling/geometry/editBody.ts` — node (typescript)
- `src/modeling/geometry/editBody.test.ts` — node (typescript)

**Edits**
- `src/document/objects.ts`
<!-- /step-meta:plan/sketches-and-environments-1793816162223/what-editing-a-face-edge-or-point-changes-1793816214345 -->

<!-- /step:plan/sketches-and-environments-1793816162223/what-editing-a-face-edge-or-point-changes-1793816214345 -->

## 12. Display modes: shaded, edges, wireframe, x-ray
<!-- step:plan/sketches-and-environments-1793816162223/display-modes-shaded-edges-wireframe-x-ray-1793831786457 -->
**Status:** Done — 3D view bar: Shaded / Edges / Wire / X-ray (remembered per machine); Edges draws every facet's outline, Wire the triangles in the part's colour, X-ray see-through with light edges; checked in the app

How the 3D view draws parts, chosen in its top bar beside Persp / Front / Top / Side (a view control: it changes how you look, not what's there). Shaded (today), Shaded + edges (each polygon's outline over the solid, so smoothness is visible), Wireframe (polygon lines only, in the part's fill colour) and X-ray (see-through, so points on the far side can be picked). Remembered per machine, like the camera. Lands before selection modes so edges and points can be seen before they're picked.

**Edits**
- `src/modeling/viewport/Viewport3D.tsx`
- `src/modeling/viewport/Viewport3D.ViewModel.tsx`
<!-- /step-meta:plan/sketches-and-environments-1793816162223/display-modes-shaded-edges-wireframe-x-ray-1793831786457 -->

<!-- /step:plan/sketches-and-environments-1793816162223/display-modes-shaded-edges-wireframe-x-ray-1793831786457 -->

## 13. Selection modes and hotkeys
<!-- step:plan/sketches-and-environments-1793816162223/selection-modes-and-hotkeys-1793816214502 -->
**Status:** Done — Edit mode in 3D: Tab, 1/2/3 points/edges/faces (also a bar beside Shaded…), click picks the nearest element on the surface, Shift adds, A/Alt+A, B box; faint dots/edges for the mode, picked in blue, hover in white; selectionModes.ts pure + 5 tests; checked in the app

From the Sketches and Objects plan: Blender's select modes in an environment — Tab object/edit, 1 / 2 / 3 points, edges, faces, Shift adds, A all, Alt+A none, box select — with hover highlights and dots for picked points, using the bodies' named triangles. A ? overlay lists the keys of the document you're in.

**Files**
- `src/modeling/viewport/selectionModes.ts` — controller (typescript)
- `src/modeling/viewport/selectionModes.test.ts` — node (typescript)

**Edits**
- `src/modeling/viewport/Viewport3D.tsx`
- `src/modeling/viewport/Viewport3D.ViewModel.tsx`
- `src/canvas/CanvasView.ViewModel.tsx`
<!-- /step-meta:plan/sketches-and-environments-1793816162223/selection-modes-and-hotkeys-1793816214502 -->

<!-- /step:plan/sketches-and-environments-1793816162223/selection-modes-and-hotkeys-1793816214502 -->

## 14. One home per control in 3D
<!-- step:plan/sketches-and-environments-1793816162223/one-home-per-control-in-3d-1793837925093 -->
**Status:** Done — Views from the axis gizmo (6 axis ends + middle = perspective; a drag leaves a drafting view); Persp/Front/Top/Side, display and select-mode bars gone from the 3D corner; select modes + Edit points in the toolbox; right panel: feature settings + Remove (no kind picker), Smoothness after Fill/Stroke, View → Display with nothing selected; checked in the app

Removes doubles the user found. The axis gizmo is how views change: clicking X, Y or Z turns the camera to look straight down it (drafting, no perspective), and its centre or an orbit drag returns to perspective — so the Persp / Front / Top / Side buttons go. The toolbox owns shaping: Flat / Extrude / Revolve / Sweep leave the right panel, which keeps only the feature's settings (depth, axis, angle, steps) and Remove feature. Edit points moves into the toolbox too: in 2D and sketch mode an Edit points tool (Enter) for the selected shape; in 3D the Points / Edges / Faces modes sit in the toolbox's Select slot instead of the view bar. Smoothness joins Fill and Stroke in one Appearance group. With nothing selected the right panel shows the environment's own view settings, as Figma's shows the page's: Shaded / Edges / Wire / X-ray live there, not in the view bar. LAYOUT.md's areas table is updated to match.

**Edits**
- `src/modeling/viewport/Viewport3D.tsx`
- `src/modeling/viewport/Viewport3D.ViewModel.tsx`
- `src/canvas/board/CanvasToolbar.tsx`
- `src/canvas/board/toolbox.ts`
- `src/canvas/panels/CanvasInspector.tsx`
- `src/canvas/panels/SolidSection.tsx`
- `src/canvas/CanvasView.tsx`
- `src/canvas/LAYOUT.md`
<!-- /step-meta:plan/sketches-and-environments-1793816162223/one-home-per-control-in-3d-1793837925093 -->

<!-- /step:plan/sketches-and-environments-1793816162223/one-home-per-control-in-3d-1793837925093 -->

## 15. Grab, rotate, scale and push/pull
<!-- step:plan/sketches-and-environments-1793816162223/grab-rotate-scale-and-push-pull-1793816214631 -->
**Status:** Done — G/R/S modal (X/Y/Z locks, typed amounts, Ctrl snap, Enter/click keep, Esc/right-click put back, one undo step) in modalTransform.ts + 9 tests; parts move as a whole by CanvasObject.placement (bodies, picking, bounds, sketch mode follow; sketch keeps its plane); faces/edges/points go through editBody, a lone face pushes/pulls along its normal; picks survive the edit; handles make the same moves; checked in the app

From the Sketches and Objects plan: G / R / S with X / Y / Z axis locks and typed amounts, Enter to confirm, Esc to cancel; on a part it moves the part; on faces, edges and points it goes through the editing rules, so pulling a box's top face deepens its extrude.

**Files**
- `src/modeling/viewport/modalTransform.ts` — controller (typescript)
- `src/modeling/viewport/modalTransform.test.ts` — node (typescript)

**Edits**
- `src/modeling/viewport/Viewport3D.tsx`
- `src/modeling/viewport/TransformGizmo.tsx`
- `src/canvas/CanvasView.ViewModel.tsx`
<!-- /step-meta:plan/sketches-and-environments-1793816162223/grab-rotate-scale-and-push-pull-1793816214631 -->

<!-- /step:plan/sketches-and-environments-1793816162223/grab-rotate-scale-and-push-pull-1793816214631 -->

## 16. The feature inspector
<!-- step:plan/sketches-and-environments-1793816162223/the-feature-inspector-1793816214773 -->
**Status:** Done — FeatureSection: Onshape-style dialog (depth + One way/Reverse/Both sides, axis/angle/steps, path, Add/Subtract/Intersect after the first), live preview, OK/Enter keeps as one undo, Cancel/Esc puts back, other picks keep; feature rows pick the dialog and drag to reorder (moveFeature); part row menu deletes (removeObject); Part shows 'Moved as a whole' + Reset; SolidSection's old panel removed; checked in the app

From the Sketches and Objects plan: a feature's settings as Onshape's feature dialog — depth, direction, both sides, axis, angle, smoothness, and how it combines (new part, add, subtract, intersect once booleans exist) — with a live preview and OK / Cancel. Dragging features in the parts list reorders them and rebuilds. Rename a part; delete a part from its row's menu.

**Files**
- `src/canvas/panels/FeatureSection.tsx` — view (react)

**Edits**
- `src/canvas/panels/CanvasInspector.tsx`
- `src/canvas/panels/SolidSection.tsx`
- `src/canvas/panels/CanvasLayersPanel.tsx`
- `src/document/objects.ts`
<!-- /step-meta:plan/sketches-and-environments-1793816162223/the-feature-inspector-1793816214773 -->

<!-- /step:plan/sketches-and-environments-1793816162223/the-feature-inspector-1793816214773 -->

## 17. Retire the board's front view of the scene
<!-- step:plan/sketches-and-environments-1793816162223/retire-the-board-s-front-view-of-the-scene-1793816214907 -->
**Status:** Done — Board draws every layer as itself: projectedSolidsOf/drawsAsSolid/solidAt, frontFaces/frontShade/frontTransform, ProjectedSolid.tsx, PlacedNodeView and the measurer's placed-plane branch removed (~330 lines, 3 tests); plane-to-board math, plane edit and the ghost kept; 497→496 files, 1666→1653 imports

With environments always in 3D, the 2D board no longer needs to draw parts projected through the front camera (scene3d/sceneMeshes projectedSolidsOf, board/ProjectedSolid.tsx, PlacedNodeView's front matrix). Keep what sketch mode needs (the ghost, plane-to-board math); remove the rest and its tests, and the 2D toolbox's shaping slots. Measured with /optimize before and after.

**Edits**
- `src/modeling/scene3d/sceneMeshes.ts`
- `src/canvas/board/ProjectedSolid.tsx`
- `src/canvas/board/CanvasBoard.tsx`
- `src/canvas/board/CanvasNodeView.tsx`
- `src/document/frontView.ts`
<!-- /step-meta:plan/sketches-and-environments-1793816162223/retire-the-board-s-front-view-of-the-scene-1793816214907 -->

<!-- /step:plan/sketches-and-environments-1793816162223/retire-the-board-s-front-view-of-the-scene-1793816214907 -->

## 18. Agents and files speak sketches and environments
<!-- step:plan/sketches-and-environments-1793816162223/agents-and-files-speak-sketches-and-environments-1793816215041 -->
**Status:** Proposed

**Comments**
- someone: Replaced by the 'Prompt to scene' plan (its model commands, describe, and /model + /sketch skills steps). Skip this step when that plan lands.
- someone: Skipped: the Prompt to scene plan (plan/prompt-to-scene-1793837965047) covers this with its model commands, describe read-back and /model + /sketch skills.

From the Sketches and Objects plan: the canvas CLI agents use (tools/agentSkills/vendor/canvas.mjs, copied as .sleipnir/canvas.mjs) and the /frame and /component skill text learn the two kinds, placements, planes, parts and features, so an AI can say 'in Environment 1, place Sketch Logo on the Top face of Box and extrude it 2 cm'. Emitted component code is unchanged: it comes from Sketch documents.

**Edits**
- `tools/agentSkills/vendor/canvas.mjs`
- `tools/agentSkills/registry.mjs`
- `src/canvas/io/store.ts`
<!-- /step-meta:plan/sketches-and-environments-1793816162223/agents-and-files-speak-sketches-and-environments-1793816215041 -->

<!-- /step:plan/sketches-and-environments-1793816162223/agents-and-files-speak-sketches-and-environments-1793816215041 -->

## 19. Verify in the running app
<!-- step:plan/sketches-and-environments-1793816162223/verify-in-the-running-app-1793816215163 -->
**Status:** Done — Walked the whole list in the app: new sketch → placed linked on Top → extruded; source edit flowed through (400 wide), Unlink stopped it; deleted sketch left the part flagged, undo restored; Box + Cylinder (44/124/312 tris); face G Y 0.2 deepened 1→1.2; pre-kinds board opened as an environment with its frame kept as a sketch. Re-scored 22→31/40; 5 papercuts found (duplicate Untitled names, outside files need reload, starters off-screen, unrounded fields, dark frame fill)

Over CDP with a scratch project: New sketch, draw a logo frame; New environment, + Sketch › From a sketch… onto the Top plane, Extrude it; edit the logo in its sketch and see the part follow; Unlink and see it stop; delete a sketch a feature uses and see the feature flagged, not gone; Box from the starter shapes, smoothness up and down on a cylinder; Tab, 3, pick a face, G Z 20; an old board with parts opens as an environment with its UI frames still in a sketch. Rerun /impeccable critique on the canvas and compare with 22/40.

**Edits**
- `src/canvas/CanvasView.test.tsx`
<!-- /step-meta:plan/sketches-and-environments-1793816162223/verify-in-the-running-app-1793816215163 -->

<!-- /step:plan/sketches-and-environments-1793816162223/verify-in-the-running-app-1793816215163 -->
