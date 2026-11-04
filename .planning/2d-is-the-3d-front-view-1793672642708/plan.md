<!-- sleipnir:plan — generated from .planning/notes.json. Write freely under the title and between a step's /step-meta and /step markers; everything else is regenerated. -->
# 2D is the 3D front view

One set of camera controls in 2D and 3D (scroll pans up/down, Ctrl+scroll zooms, Space+drag pans, right-drag orbits in 3D, left click selects), and the 2D board becomes exactly what the 3D Front orthographic camera sees: one position for both, rotated planes drawn squashed, solids drawn as their projected faces. Top/Side sketches are edited straight-on in a plane-edit mode.
<!-- /plan-meta -->

<!-- steps -->

## 1. Same camera controls in 3D as in 2D
<!-- step:plan/2d-is-the-3d-front-view-1793672642708/same-camera-controls-in-3d-as-in-2d-1793672666798 -->
**Status:** Done — 3D now matches 2D: scroll pans, Ctrl/Cmd+scroll zooms at cursor, Space/middle-drag pan, right-drag orbits (Persp only), left click selects; checked in the dev app

**Comments**
- claude: Changed per request: a left drag also orbits in 3D (Persp); a left click still selects, Space+left still pans. 2D left-drag unchanged (it moves and marquees layers).

2D already does this (usePanZoom): wheel pans up/down, Shift+wheel or a trackpad pans sideways, Ctrl/Cmd+wheel zooms at the cursor, Space+left-drag and middle-drag pan, right-drag does nothing. Bring the 3D viewport in line: replace OrbitControls' defaults (left orbits, right pans, wheel dollies) with left = select only, right-drag = orbit (perspective view only, as now), Space+left-drag and middle-drag = pan, wheel = pan along the screen, Ctrl/Cmd+wheel = zoom toward the cursor. The pan/zoom math lives in a pure module so it's tested without a GPU.

**Files**
- `src/01_canvas/viewport/viewportControls.ts` — controller (typescript)

**Edits**
- `src/01_canvas/viewport/Viewport3D.tsx`
- `src/01_canvas/viewport/viewport.test.ts`
<!-- /step-meta:plan/2d-is-the-3d-front-view-1793672642708/same-camera-controls-in-3d-as-in-2d-1793672666798 -->

<!-- /step:plan/2d-is-the-3d-front-view-1793672642708/same-camera-controls-in-3d-as-in-2d-1793672666798 -->

## 2. One position for 2D and 3D
<!-- step:plan/2d-is-the-3d-front-view-1793672642708/one-position-for-2d-and-3d-1793672666940 -->
**Status:** Done — syncPlacements keeps rect.x/y and space.position in step on every edit, board open and outside reload; whichever side changed wins, the file's placement wins on load

Today a top-level layer's 2D position (rect.x/y) and its 3D placement (space.position) are separate once it's placed, so moving it in 3D doesn't move it in 2D and vice versa. Make the placement the source for placed layers: a 3D move updates rect.x/y to the front-view projection of the plane's origin, and a 2D move (drag, nudge, align, X/Y fields) writes space.position x/y, keeping z. Unplaced layers are unchanged (they already sit at defaultPlacement(rect)).

**Edits**
- `src/01_canvas/scene3d/placement.ts`
- `src/01_canvas/scene3d/placement.test.ts`
- `src/01_canvas/CanvasView.ViewModel.tsx`
- `src/01_canvas/CanvasView.tsx`
<!-- /step-meta:plan/2d-is-the-3d-front-view-1793672642708/one-position-for-2d-and-3d-1793672666940 -->

<!-- /step:plan/2d-is-the-3d-front-view-1793672642708/one-position-for-2d-and-3d-1793672666940 -->

## 3. The front-view projection
<!-- step:plan/2d-is-the-3d-front-view-1793672642708/the-front-view-projection-1793672667179 -->
**Status:** Done — frontMatrix(placement) in scene3d/frontView.ts; boardMatrixOf uses it for placed top-level layers, children compose through it

The 2D board is the 3D Front orthographic camera: board px = (X, -Y) × PX_PER_METER, depth dropped. For a flat layer that's an affine map from its plane to the board, the first two columns of its rotation × scale plus the projected origin, so it fits the existing Mat type and CSS matrix(). Add frontMatrix(placement) and use it in boardMatrixOf for placed top-level layers, so every ring, handle, hit test and guide already built on boardMatrixOf follows. Edge-on planes (|det| ≈ 0) are flagged so they can be drawn and picked as a line.

**Files**
- `src/01_canvas/scene3d/frontView.ts` — node (typescript)
- `src/01_canvas/scene3d/frontView.test.ts` — node (typescript)

**Edits**
- `src/01_canvas/model/doc.ts`
- `src/01_canvas/model/rotation.ts`
<!-- /step-meta:plan/2d-is-the-3d-front-view-1793672642708/the-front-view-projection-1793672667179 -->

<!-- /step:plan/2d-is-the-3d-front-view-1793672642708/the-front-view-projection-1793672667179 -->

## 4. Flat layers drawn as the front view sees them
<!-- step:plan/2d-is-the-3d-front-view-1793672642708/flat-layers-drawn-as-the-front-view-sees-them-1793672667353 -->
**Status:** Done — Placed layers draw through matrix(); rings/handles follow the projected quad; hit-test, marquee and measured layout follow the plane; edge-on drawn and picked as a line; resize works in-plane

A placed layer renders in 2D through its front matrix (CSS matrix(), board-only; emitted code is untouched), so a plane turned about Y squashes horizontally and one turned about X and Y becomes a rhombus. Children inherit through the DOM. The selection ring and handles draw the projected parallelogram rather than a rotated box (orientedFrom assumes no skew), resize/rotate handles map drags back through the inverse matrix, and edge-on layers show as a hairline that can still be clicked.

**Edits**
- `src/01_canvas/board/CanvasNodeView.tsx`
- `src/01_canvas/board/CanvasBoard.tsx`
- `src/01_canvas/model/rotation.ts`
- `src/01_canvas/model/doc.ts`
<!-- /step-meta:plan/2d-is-the-3d-front-view-1793672642708/flat-layers-drawn-as-the-front-view-sees-them-1793672667353 -->

<!-- /step:plan/2d-is-the-3d-front-view-1793672642708/flat-layers-drawn-as-the-front-view-sees-them-1793672667353 -->

## 5. Solids drawn as their projected faces
<!-- step:plan/2d-is-the-3d-front-view-1793672642708/solids-drawn-as-their-projected-faces-1793672667600 -->
**Status:** Done — Turned extrudes, revolves and swept tubes draw in 2D as projected, lit faces (scene3d/sceneMeshes + board/ProjectedSolid); matches the 3D Front view in the app; clicks on them select

An extruded, revolved or swept layer can't be drawn by an affine map, so 2D draws its mesh through the same front camera: triangles projected to the board, back faces culled, sorted far to near, each shaded from the 3D view's key light, so a rotated cube reads as a shaded diamond/hexagon exactly as the 3D Front view shows it. The mesh builders (layerMesh, sweptMesh, sweepsAlong, surfaceOf) move out of the lazy 3D chunk into scene3d so the board can use them without three.js. Hit-testing and the selection ring use the projected outline's bounds.

**Files**
- `src/01_canvas/scene3d/sceneMeshes.ts` — node (typescript)
- `src/01_canvas/board/ProjectedSolid.tsx` — view (react)

**Edits**
- `src/01_canvas/viewport/Viewport3D.ViewModel.tsx`
- `src/01_canvas/viewport/Viewport3D.tsx`
- `src/01_canvas/board/CanvasNodeView.tsx`
<!-- /step-meta:plan/2d-is-the-3d-front-view-1793672642708/solids-drawn-as-their-projected-faces-1793672667600 -->

<!-- /step:plan/2d-is-the-3d-front-view-1793672642708/solids-drawn-as-their-projected-faces-1793672667600 -->

## 6. Edit a placed layer straight-on
<!-- step:plan/2d-is-the-3d-front-view-1793672642708/edit-a-placed-layer-straight-on-1793672667822 -->
**Status:** Done — Double-click or Enter opens a placed layer face on (scene3d/planeEdit.ts view + merge), with cross-plane guides and a Done chip; Esc returns; checked in the app

With 2D as the front view, a sketch on the Top or Side plane is edge-on and can't be drawn on. Double-click (or Enter) on a placed layer enters plane-edit: the board shows just that layer's plane straight-on, other placed layers ghosted with the cross-plane guides (scene3d/sketchPlane.ts) so the views still line up, and Esc returns to the front view. This keeps today's Top/Side sketching workflow.

**Edits**
- `src/01_canvas/CanvasView.ViewModel.tsx`
- `src/01_canvas/board/CanvasBoard.tsx`
- `src/01_canvas/CanvasView.tsx`
- `src/01_canvas/scene3d/sketchPlane.ts`
<!-- /step-meta:plan/2d-is-the-3d-front-view-1793672642708/edit-a-placed-layer-straight-on-1793672667822 -->

<!-- /step:plan/2d-is-the-3d-front-view-1793672642708/edit-a-placed-layer-straight-on-1793672667822 -->

## 7. Pick a solid's faces, edges and points
<!-- step:plan/2d-is-the-3d-front-view-1793672642708/pick-a-solid-s-faces-edges-and-points-1793675329916 -->
**Status:** Proposed

**Comments**
- claude: Superseded by the 'Sketches and Objects' plan: steps 2 (named faces), 8 (what an edit changes), 9 (select modes) and 10 (G/R/S, push/pull) cover this properly.

Requested 2026-11-02: in 3D and in 2D, hover and click picks one face of a solid, e.g. a cube's top face turned toward the viewer, and shows it as its own editable shape: its edges and vertices drawn (projected in 2D), points selectable and draggable. Faces map back to what built them: an extrude's caps are the layer's outline (dragging a cap vertex moves that outline point, in the plane via the inverse front matrix), a side face is one outline segment swept by the depth (its edges move the two points, its far edge moves depth), a revolve's faces trace back to profile points. Needs frontFaces / the mesh builders to tag each triangle with its source face (cap/side + outline index), a face-pick in 2D alongside solidAt, and the same in the 3D viewport via raycast faceIndex. Should line up with the 3D creation plan's 'Point selection' and 'Edit mode: vertices, edges, faces' steps rather than duplicate them.

**Edits**
- `src/01_canvas/geometry/modifiers.ts`
- `src/01_canvas/scene3d/frontView.ts`
- `src/01_canvas/scene3d/sceneMeshes.ts`
- `src/01_canvas/board/ProjectedSolid.tsx`
- `src/01_canvas/board/CanvasBoard.tsx`
- `src/01_canvas/CanvasView.ViewModel.tsx`
- `src/01_canvas/viewport/Viewport3D.tsx`
<!-- /step-meta:plan/2d-is-the-3d-front-view-1793672642708/pick-a-solid-s-faces-edges-and-points-1793675329916 -->

<!-- /step:plan/2d-is-the-3d-front-view-1793672642708/pick-a-solid-s-faces-edges-and-points-1793675329916 -->

## 8. Retire 'the 2D board is always straight-on'
<!-- step:plan/2d-is-the-3d-front-view-1793672642708/retire-the-2d-board-is-always-straight-on-1793672668056 -->
**Status:** Done — Model, inspector, 3D view and guide comments now describe 2D as the Front view with plane edit; guides only draw while a plane is open

The model, inspector and 3D view all say the 2D board ignores placement. Update those statements and hints to the new rule (2D is the Front view; plane-edit shows a plane straight-on): CanvasNode.space's doc comment, PlaneSection's hint and Reset tooltip, Viewport3D's header comment, and the plane guides that now only draw in plane-edit.

**Edits**
- `src/01_canvas/model/types.ts`
- `src/01_canvas/panels/PlaneSection.tsx`
- `src/01_canvas/viewport/Viewport3D.tsx`
- `src/01_canvas/board/CanvasBoard.tsx`
<!-- /step-meta:plan/2d-is-the-3d-front-view-1793672642708/retire-the-2d-board-is-always-straight-on-1793672668056 -->

<!-- /step:plan/2d-is-the-3d-front-view-1793672642708/retire-the-2d-board-is-always-straight-on-1793672668056 -->

## 9. Verify in the running app
<!-- step:plan/2d-is-the-3d-front-view-1793672642708/verify-in-the-running-app-1793672668247 -->
**Status:** Done — In the dev app: turned cube shows the same shaded hexagon in 2D and 3D Front; Y-turned panel squashes alike; Top plane is a line; 2D drag moved the panel +0.5 m X / -0.29 m Y in 3D; plane edit opens and closes

Over CDP in the dev app: an extruded square rotated 45° about Y then 35° about X shows in 2D as the same shaded hexagon the 3D Front view renders (screenshot both at matching zoom); moving it with the gizmo moves it in 2D and dragging it in 2D moves it in 3D; scroll, Ctrl+scroll, Space+drag behave the same in both; right-drag orbits only in 3D Persp.

**Edits**
- `src/01_canvas/CanvasView.test.tsx`
<!-- /step-meta:plan/2d-is-the-3d-front-view-1793672642708/verify-in-the-running-app-1793672668247 -->

<!-- /step:plan/2d-is-the-3d-front-view-1793672642708/verify-in-the-running-app-1793672668247 -->
