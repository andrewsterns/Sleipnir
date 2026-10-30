<!-- sleipnir:plan — generated from .planning/notes.json. Write freely under the title and between a step's /step-meta and /step markers; everything else is regenerated. -->
# 3D creation: sketch planes to shaded scenes
<!-- /plan-meta -->

<!-- steps -->

## 1. 3D scene model: placements, solids and storage
<!-- step:plan/3d-creation-sketch-planes-to-shaded-scenes-1793281213388/3d-scene-model-placements-solids-and-storage-1793281213438 -->
**Status:** Done — Backfilled: checked in the code (scene3d types and placement, lazy R3F viewport with 2D/3D toggle, Front/Top/Side planes)

The data underneath everything else. Every layer can carry a 3D placement (position, rotation as a quaternion, scale), and a frame can be a sketch plane: XY (front), XZ (top), YZ (side), or any of those rotated about any axis, its 2D contents living on that plane. New layer kinds: a 3D component (a group of solids, lights and cameras placed in space, built on the board like any frame) and a solid (an outline plus its modifier stack, or an edited mesh). Units are meters with Y up, the glTF convention, so export needs no guessing. Heavy mesh data lives in binary assets (.components/assets/*.glb) referenced from the board, so board JSON stays small and diffable. Schema bump with an idempotent migration; undo covers every 3D edit.

**Files**
- `src/01_canvas/scene3d/placement.ts` — node (typescript)
- `src/01_canvas/scene3d/sceneTypes.ts` — interface (typescript)

**Edits**
- `src/01_canvas/model/types.ts`
- `src/01_canvas/model/store.ts`
- `src/01_canvas/model/undo.ts`
- `src/01_canvas/model/rotation.ts`
<!-- /step-meta:plan/3d-creation-sketch-planes-to-shaded-scenes-1793281213388/3d-scene-model-placements-solids-and-storage-1793281213438 -->

<!-- /step:plan/3d-creation-sketch-planes-to-shaded-scenes-1793281213388/3d-scene-model-placements-solids-and-storage-1793281213438 -->

## 2. The 3D viewport and the 2D/3D toggle
<!-- step:plan/3d-creation-sketch-planes-to-shaded-scenes-1793281213388/the-3d-viewport-and-the-2d-3d-toggle-1793281213504 -->
**Status:** Done — Backfilled: checked in the code (scene3d types and placement, lazy R3F viewport with 2D/3D toggle, Front/Top/Side planes)

A three.js viewport on the board (React Three Fiber, already a dependency, loaded on demand so it never touches the first load), WebGPU where available and WebGL otherwise. One toggle swaps the board between 2D and 3D: 2D is the orthographic straight-on view of the plane being edited, 3D orbits the same scene, so nothing is converted going back and forth. Front, Top, Side and Perspective views, a grid and axis gizmo, move/rotate/scale handles, frame-selection shared with the layers panel, and every 2D layer drawn as a flat mesh through the geometry kernel (shape.ts, mesh.ts) so a flat design looks identical in both views.

**Files**
- `src/01_canvas/viewport/Viewport3D.tsx` — view (react)
- `src/01_canvas/viewport/Viewport3D.ViewModel.tsx` — view-model (react)
- `src/01_canvas/viewport/cameraViews.ts` — node (typescript)
- `src/01_canvas/viewport/TransformGizmo.tsx` — view (react)

**Edits**
- `src/01_canvas/board/CanvasBoard.tsx`
- `src/01_canvas/board/CanvasToolbar.tsx`
- `src/01_canvas/CanvasView.ViewModel.tsx`
- `src/01_canvas/geometry/mesh.ts`
<!-- /step-meta:plan/3d-creation-sketch-planes-to-shaded-scenes-1793281213388/the-3d-viewport-and-the-2d-3d-toggle-1793281213504 -->

<!-- /step:plan/3d-creation-sketch-planes-to-shaded-scenes-1793281213388/the-3d-viewport-and-the-2d-3d-toggle-1793281213504 -->

## 3. Sketch planes: frames on XY, XZ, YZ or any angle
<!-- step:plan/3d-creation-sketch-planes-to-shaded-scenes-1793281213388/sketch-planes-frames-on-xy-xz-yz-or-any-angle-1793281213568 -->
**Status:** Done — Backfilled: checked in the code (scene3d types and placement, lazy R3F viewport with 2D/3D toggle, Front/Top/Side planes)

Put any frame on a plane from the inspector (Front, Top, Side, or a custom rotation and offset) and it stands in the 3D scene at that orientation. Editing a plane opens it straight-on in 2D, with the board tools unchanged: the SVG and frame tools become the sketch tools. Cross-plane guides make orthographic sketching work: points drawn on Front project as guide lines onto Top and Side (shared X, Y or Z), so the three views of one object line up like blueprint views. Reference images can be pinned to a plane at real size.

**Files**
- `src/01_canvas/scene3d/sketchPlane.ts` — node (typescript)
- `src/01_canvas/panels/PlaneSection.tsx` — view (react)
- `src/01_canvas/board/PlaneGuides.tsx` — view (react)

**Edits**
- `src/01_canvas/panels/CanvasInspector.tsx`
- `src/01_canvas/board/CanvasNodeView.tsx`
- `src/01_canvas/model/doc.ts`
<!-- /step-meta:plan/3d-creation-sketch-planes-to-shaded-scenes-1793281213388/sketch-planes-frames-on-xy-xz-yz-or-any-angle-1793281213568 -->

<!-- /step:plan/3d-creation-sketch-planes-to-shaded-scenes-1793281213388/sketch-planes-frames-on-xy-xz-yz-or-any-angle-1793281213568 -->

## 4. Point selection: transform just the points you pick
<!-- step:plan/3d-creation-sketch-planes-to-shaded-scenes-1793281213388/point-selection-transform-just-the-points-you-pick-1793281722236 -->
**Status:** Proposed

Select only some points of any shape and move, rotate or scale them on their own, about a pivot you can place (their center by default, or any point, anchor or layer). Works on every vector, and on frames and components through their outline: a frame or component edited by points becomes a path that keeps its fills, strokes and children. Box, lasso, shift and loop selection of points; rotation and scale handles around the selection; numeric rotate in the inspector. For components, an instance can be rotated or have points moved as its own override, without touching the main component or its other instances. The same selection model (points, then edges and faces) carries straight into 3D edit mode and the sculpt brushes.

**Files**
- `src/01_canvas/model/pointSelection.ts` — node (typescript)
- `src/01_canvas/board/PointTransformHandles.tsx` — view (react)

**Edits**
- `src/01_canvas/model/vectorEdit.ts`
- `src/01_canvas/model/variants.ts`
- `src/01_canvas/board/CanvasNodeView.tsx`
- `src/01_canvas/CanvasView.ViewModel.tsx`
<!-- /step-meta:plan/3d-creation-sketch-planes-to-shaded-scenes-1793281213388/point-selection-transform-just-the-points-you-pick-1793281722236 -->

<!-- /step:plan/3d-creation-sketch-planes-to-shaded-scenes-1793281213388/point-selection-transform-just-the-points-you-pick-1793281722236 -->

## 5. Solids from one sketch: extrude, revolve, sweep, loft
<!-- step:plan/3d-creation-sketch-planes-to-shaded-scenes-1793281213388/solids-from-one-sketch-extrude-revolve-sweep-loft-1793281213693 -->
**Status:** Proposed — Partly done: extrude, revolve and sweep work; loft, bevel and taper are not built

An outline on a plane becomes a solid through a modifier: extrude (depth, bevel size and segments, taper), revolve (axis, angle, steps: vases, wheels, bottles), sweep (along a guide path, reusing pathGuide: pipes, rails, ribbons) and loft (through two or more profiles on parallel planes: fuselages, bottles with varying section). How points map to polygons is explicit and shown: each sketch anchor is a vertex of the profile, curves are split at the flattening tolerance, and the polygon count is profile vertices x the segments the modifier adds (extrude depth segments, revolve steps, sweep samples). Loft needs matching point counts, so profiles are resampled to the same count with their anchors kept. A live polygon and triangle count sits in the inspector. The sketch stays the source: edit it and the solid rebuilds.

**Files**
- `src/01_canvas/geometry/modifiers.ts` — node (typescript)
- `src/01_canvas/geometry/loft.ts` — node (typescript)
- `src/01_canvas/panels/SolidSection.tsx` — view (react)

**Edits**
- `src/01_canvas/geometry/shape.ts`
- `src/01_canvas/geometry/mesh.ts`
- `src/01_canvas/model/pathGuide.ts`
- `src/01_canvas/panels/CanvasInspector.tsx`
<!-- /step-meta:plan/3d-creation-sketch-planes-to-shaded-scenes-1793281213388/solids-from-one-sketch-extrude-revolve-sweep-loft-1793281213693 -->

<!-- /step:plan/3d-creation-sketch-planes-to-shaded-scenes-1793281213388/solids-from-one-sketch-extrude-revolve-sweep-loft-1793281213693 -->

## 6. Solids from Top, Front and Side sketches, and booleans
<!-- step:plan/3d-creation-sketch-planes-to-shaded-scenes-1793281213388/solids-from-top-front-and-side-sketches-and-booleans-1793281213825 -->
**Status:** Proposed

Three orthographic silhouettes become one solid by carving: extrude the Front sketch through the depth, the Side across the width, the Top down the height, and intersect the three (the visual hull). Booleans (union, subtract, intersect) between any solids use three-bvh-csg. What views alone cannot tell is stated in the UI, not hidden: a hollow no silhouette shows (a bowl, a cup interior), and curvature between views (three circles carve a Steinmetz solid, not a sphere). The fixes are built in: add section sketches on more planes and loft through them, subtract a carved cavity, or refine in edit mode and sculpting.

**Files**
- `src/01_canvas/geometry/carve.ts` — node (typescript)
- `src/01_canvas/geometry/csg.ts` — node (typescript)

**Edits**
- `src/01_canvas/geometry/shape.ts`
- `package.json`
<!-- /step-meta:plan/3d-creation-sketch-planes-to-shaded-scenes-1793281213388/solids-from-top-front-and-side-sketches-and-booleans-1793281213825 -->

<!-- /step:plan/3d-creation-sketch-planes-to-shaded-scenes-1793281213388/solids-from-top-front-and-side-sketches-and-booleans-1793281213825 -->

## 7. Editable meshes
<!-- step:plan/3d-creation-sketch-planes-to-shaded-scenes-1793281213388/editable-meshes-1793281213939 -->
**Status:** Proposed

Apply a modifier stack to get a mesh you can edit by hand: a half-edge mesh with n-gon faces (quads stay quads, which subdivision and engines prefer), hard and smooth edges, vertex normals, UV layers and vertex colors. Kept in a .glb asset with its history recorded, so an applied solid can still be traced to the sketch it came from. Validation keeps meshes engine-ready: manifold checks, no degenerate faces, consistent winding.

**Files**
- `src/01_canvas/geometry/editMesh.ts` — node (typescript)
- `src/01_canvas/geometry/meshStore.ts` — node (typescript)

**Edits**
- `src/01_canvas/geometry/mesh.ts`
- `src/01_canvas/model/store.ts`
<!-- /step-meta:plan/3d-creation-sketch-planes-to-shaded-scenes-1793281213388/editable-meshes-1793281213939 -->

<!-- /step:plan/3d-creation-sketch-planes-to-shaded-scenes-1793281213388/editable-meshes-1793281213939 -->

## 8. Edit mode: vertices, edges, faces
<!-- step:plan/3d-creation-sketch-planes-to-shaded-scenes-1793281213388/edit-mode-vertices-edges-faces-1793281214066 -->
**Status:** Proposed

Polygon modelling on the editable mesh: select vertices, edges or faces (click, box, loop and ring selection), move, rotate and scale them with the gizmo, extrude and inset faces, bevel edges and vertices, loop cut, knife, merge, bridge edge loops, fill holes, and mirror with symmetry across an axis. Every operation is one undo step through the canvas undo stack, and works in the orthographic views as well as perspective.

**Files**
- `src/01_canvas/geometry/meshOps.ts` — node (typescript)
- `src/01_canvas/viewport/MeshEditMode.tsx` — view (react)
- `src/01_canvas/viewport/MeshEditMode.ViewModel.tsx` — view-model (react)

**Edits**
- `src/01_canvas/model/undo.ts`
- `src/01_canvas/board/CanvasToolbar.tsx`
<!-- /step-meta:plan/3d-creation-sketch-planes-to-shaded-scenes-1793281213388/edit-mode-vertices-edges-faces-1793281214066 -->

<!-- /step:plan/3d-creation-sketch-planes-to-shaded-scenes-1793281213388/edit-mode-vertices-edges-faces-1793281214066 -->

## 9. Subdivision, decimation and polygon budgets
<!-- step:plan/3d-creation-sketch-planes-to-shaded-scenes-1793281213388/subdivision-decimation-and-polygon-budgets-1793281214193 -->
**Status:** Proposed

Catmull-Clark subdivision as a modifier with per-edge crease weights, so a low-poly cage reads as a smooth form (the standard way to model cars, characters, product shots). Decimate and quad-remesh to bring a dense mesh to a game budget, with a budget readout per object and per scene (triangles, vertices, draw calls) against targets for web, mobile and desktop engines.

**Files**
- `src/01_canvas/geometry/subdivide.ts` — node (typescript)
- `src/01_canvas/geometry/decimate.ts` — node (typescript)
- `src/01_canvas/panels/BudgetSection.tsx` — view (react)

**Edits**
- `src/01_canvas/panels/CanvasInspector.tsx`
<!-- /step-meta:plan/3d-creation-sketch-planes-to-shaded-scenes-1793281213388/subdivision-decimation-and-polygon-budgets-1793281214193 -->

<!-- /step:plan/3d-creation-sketch-planes-to-shaded-scenes-1793281213388/subdivision-decimation-and-polygon-budgets-1793281214193 -->

## 10. Sculpting
<!-- step:plan/3d-creation-sketch-planes-to-shaded-scenes-1793281213388/sculpting-1793281214384 -->
**Status:** Proposed

For organic detail sketches and polygon edits can not reach: brushes on a dense mesh (draw, clay, grab, smooth, inflate, crease, flatten, pinch), with radius, strength, falloff, pen pressure and mirror symmetry. Dense meshes come from a voxel remesh of any solid or from multiresolution subdivision, so a sculpt can start from a sketched base. Detail bakes down to a normal map on the low-poly mesh for engines. Brushes run on the GPU where available and a BVH keeps strokes interactive on hundreds of thousands of faces.

**Files**
- `src/01_canvas/sculpt/brushes.ts` — node (typescript)
- `src/01_canvas/sculpt/remesh.ts` — node (typescript)
- `src/01_canvas/viewport/SculptMode.tsx` — view (react)
- `src/01_canvas/viewport/SculptMode.ViewModel.tsx` — view-model (react)

**Edits**
- `src/01_canvas/board/CanvasToolbar.tsx`
- `package.json`
<!-- /step-meta:plan/3d-creation-sketch-planes-to-shaded-scenes-1793281213388/sculpting-1793281214384 -->

<!-- /step:plan/3d-creation-sketch-planes-to-shaded-scenes-1793281213388/sculpting-1793281214384 -->

## 11. Quick sculpt brushes in the pen toolbox
<!-- step:plan/3d-creation-sketch-planes-to-shaded-scenes-1793281213388/quick-sculpt-brushes-in-the-pen-toolbox-1793281722304 -->
**Status:** Proposed

A few simple brushes beside the pen tool in the bottom toolbox, for shaping without leaving the board: push, pull, smooth, inflate and pinch, with one radius and strength (pen pressure when there is one). On a 2D vector they move the points under the brush with a soft falloff, adding points where the curve needs them, so a hand-drawn shape can be nudged organically. On a 3D solid they are the light versions of the full sculpt brushes, working on the surface directly. Same selection model as point editing, so a brush can be limited to selected points.

**Files**
- `src/01_canvas/sculpt/pathBrushes.ts` — node (typescript)
- `src/01_canvas/board/BrushCursor.tsx` — view (react)

**Edits**
- `src/01_canvas/board/CanvasToolbar.tsx`
- `src/01_canvas/model/vectorEdit.ts`
<!-- /step-meta:plan/3d-creation-sketch-planes-to-shaded-scenes-1793281213388/quick-sculpt-brushes-in-the-pen-toolbox-1793281722304 -->

<!-- /step:plan/3d-creation-sketch-planes-to-shaded-scenes-1793281213388/quick-sculpt-brushes-in-the-pen-toolbox-1793281722304 -->

## 12. UVs and textures
<!-- step:plan/3d-creation-sketch-planes-to-shaded-scenes-1793281213388/uvs-and-textures-1793281214498 -->
**Status:** Proposed

Every solid gets usable UVs: a sketch-plane projection by default (the plane it was drawn on is the natural mapping, so an image fill lands where it showed in 2D), plus automatic unwrapping with seams (xatlas compiled to WebAssembly) and a UV editor drawn on the 2D board. Image fills become textures; normal, roughness, metalness and ambient-occlusion maps attach to material slots; baking lights and sculpt detail into textures follows.

**Files**
- `src/01_canvas/geometry/uvs.ts` — node (typescript)
- `src/01_canvas/viewport/UvEditor.tsx` — view (react)

**Edits**
- `src/01_canvas/geometry/mesh.ts`
- `package.json`
<!-- /step-meta:plan/3d-creation-sketch-planes-to-shaded-scenes-1793281213388/uvs-and-textures-1793281214498 -->

<!-- /step:plan/3d-creation-sketch-planes-to-shaded-scenes-1793281213388/uvs-and-textures-1793281214498 -->

## 13. Materials and node shading
<!-- step:plan/3d-creation-sketch-planes-to-shaded-scenes-1793281213388/materials-and-node-shading-1793281214593 -->
**Status:** Proposed

Physically based materials that start from what a layer already has (solid fill to base color, image fill to texture, gradient to a generated texture, opacity to transmission) plus metalness, roughness, emissive, clearcoat, sheen and normal maps. A node shader editor drawn with the same graph engine as Planning: texture, noise, math, mix, fresnel and time nodes compiled to three.js node materials (TSL), which target WebGPU and WebGL from one graph. Materials are reusable assets in .components/materials and export as glTF materials (with the nodes baked where glTF has no equivalent).

**Files**
- `src/01_canvas/shading/material.ts` — node (typescript)
- `src/01_canvas/shading/shaderGraph.ts` — node (typescript)
- `src/01_canvas/shading/compileTsl.ts` — node (typescript)
- `src/01_canvas/panels/MaterialPanel.tsx` — view (react)
- `src/01_canvas/panels/MaterialPanel.ViewModel.tsx` — view-model (react)

**Edits**
- `src/00_planning/graph/GraphCanvas.tsx`
- `src/01_canvas/panels/PaintSections.tsx`
<!-- /step-meta:plan/3d-creation-sketch-planes-to-shaded-scenes-1793281213388/materials-and-node-shading-1793281214593 -->

<!-- /step:plan/3d-creation-sketch-planes-to-shaded-scenes-1793281213388/materials-and-node-shading-1793281214593 -->

## 14. The inspector in 3D: alignment, fill, stroke
<!-- step:plan/3d-creation-sketch-planes-to-shaded-scenes-1793281213388/the-inspector-in-3d-alignment-fill-stroke-1793281722422 -->
**Status:** Proposed

The same inspector sections work on 3D objects, meaning the same thing in space. Alignment: align and distribute along X, Y or Z, to the selection, a parent component or the ground, and snap to faces, edges and other objects. Fill is the surface: the fill list becomes the material stack (a solid fill to base color, an image to a texture, opacity to transmission), shaded by the scene lights. Stroke is the outline: a stroke draws the object edges or silhouette in 3D with its color and weight in pixels or world units, for stylized, toon and technical-drawing looks, and inside/center/outside keeps its meaning against the silhouette. Effects map too: drop shadow to cast shadows, blur to depth of field. One inspector, so moving between 2D and 3D asks nothing new.

**Files**
- `src/01_canvas/scene3d/align3d.ts` — node (typescript)
- `src/01_canvas/shading/strokeOutline.ts` — node (typescript)
- `src/01_canvas/shading/fillToMaterial.ts` — node (typescript)

**Edits**
- `src/01_canvas/model/align.ts`
- `src/01_canvas/panels/LayoutSection.tsx`
- `src/01_canvas/panels/PaintSections.tsx`
- `src/01_canvas/panels/CanvasInspector.tsx`
<!-- /step-meta:plan/3d-creation-sketch-planes-to-shaded-scenes-1793281213388/the-inspector-in-3d-alignment-fill-stroke-1793281722422 -->

<!-- /step:plan/3d-creation-sketch-planes-to-shaded-scenes-1793281213388/the-inspector-in-3d-alignment-fill-stroke-1793281722422 -->

## 15. Environments: lights, cameras, world
<!-- step:plan/3d-creation-sketch-planes-to-shaded-scenes-1793281213388/environments-lights-cameras-world-1793281214712 -->
**Status:** Proposed

What turns objects into a place: point, spot, directional and area lights with soft shadows, an HDRI environment and sky, fog, a ground plane, and cameras with focal length and depth of field that can be looked through and animated. Scatter and instancing reuse the 2D pattern tools (pathPattern) in 3D: trees along a path, rocks across a surface, as GPU instances. Levels of detail per object keep large scenes fast.

**Files**
- `src/01_canvas/scene3d/lights.ts` — node (typescript)
- `src/01_canvas/scene3d/environment.ts` — node (typescript)
- `src/01_canvas/scene3d/scatter.ts` — node (typescript)
- `src/01_canvas/panels/ScenePanel.tsx` — view (react)

**Edits**
- `src/01_canvas/model/pathPattern.ts`
<!-- /step-meta:plan/3d-creation-sketch-planes-to-shaded-scenes-1793281213388/environments-lights-cameras-world-1793281214712 -->

<!-- /step:plan/3d-creation-sketch-planes-to-shaded-scenes-1793281213388/environments-lights-cameras-world-1793281214712 -->

## 16. Armatures and skinning
<!-- step:plan/3d-creation-sketch-planes-to-shaded-scenes-1793281213388/armatures-and-skinning-1793281214852 -->
**Status:** Proposed

Bones for characters and mechanisms: an armature drawn bone by bone on sketch planes (so a side-view sketch can carry a spine and a front view the arms), with parenting, roll and constraints (IK chains, look-at, copy rotation). Skinning binds a mesh to bones with automatic weights from bone distance and heat diffusion, then a weight-paint brush refines them; pose mode tests deformation. Exports as glTF skins.

**Files**
- `src/01_canvas/rig/armature.ts` — node (typescript)
- `src/01_canvas/rig/skinWeights.ts` — node (typescript)
- `src/01_canvas/rig/ik.ts` — node (typescript)
- `src/01_canvas/viewport/PoseMode.tsx` — view (react)

**Edits**
- `src/01_canvas/model/types.ts`
- `src/01_canvas/board/CanvasToolbar.tsx`
<!-- /step-meta:plan/3d-creation-sketch-planes-to-shaded-scenes-1793281213388/armatures-and-skinning-1793281214852 -->

<!-- /step:plan/3d-creation-sketch-planes-to-shaded-scenes-1793281213388/armatures-and-skinning-1793281214852 -->

## 17. Animation
<!-- step:plan/3d-creation-sketch-planes-to-shaded-scenes-1793281213388/animation-1793281214972 -->
**Status:** Proposed

One timeline for 2D and 3D: keyframes on transforms, bone poses, material parameters, light and camera properties, and shape keys (morph targets) for facial and squash-and-stretch animation. Curve editor with easing and tangents, named clips (walk, idle, open-door) that play, loop and blend, and onion skinning in 2D views. Motion along a path reuses pathFlow. Clips export as glTF animations so engines play them by name.

**Files**
- `src/01_canvas/animation/clip.ts` — node (typescript)
- `src/01_canvas/animation/curves.ts` — node (typescript)
- `src/01_canvas/panels/TimelinePanel.tsx` — view (react)
- `src/01_canvas/panels/TimelinePanel.ViewModel.tsx` — view-model (react)

**Edits**
- `src/01_canvas/model/pathFlow.ts`
- `src/01_canvas/model/types.ts`
<!-- /step-meta:plan/3d-creation-sketch-planes-to-shaded-scenes-1793281213388/animation-1793281214972 -->

<!-- /step:plan/3d-creation-sketch-planes-to-shaded-scenes-1793281213388/animation-1793281214972 -->

## 18. Functional environments: physics and interaction
<!-- step:plan/3d-creation-sketch-planes-to-shaded-scenes-1793281213388/functional-environments-physics-and-interaction-1793281215081 -->
**Status:** Proposed

Scenes that can be played, not only looked at: rigid bodies and colliders (box, sphere, capsule, convex hull, mesh) with Rapier compiled to WebAssembly, triggers, joints, and a play mode in the viewport. Interaction states shared with 2D UI (hover, press, focus) drive 3D objects, so a door opens on click and a panel lights up on hover. 3D UI: any 2D frame can sit in the scene as a panel, HUD or screen that stays crisp (rendered from the same box model), for in-world interfaces.

**Files**
- `src/01_canvas/scene3d/physics.ts` — node (typescript)
- `src/01_canvas/scene3d/interaction.ts` — node (typescript)
- `src/01_canvas/viewport/PlayMode.tsx` — view (react)
- `src/01_canvas/scene3d/uiPanels.ts` — node (typescript)

**Edits**
- `package.json`
<!-- /step-meta:plan/3d-creation-sketch-planes-to-shaded-scenes-1793281213388/functional-environments-physics-and-interaction-1793281215081 -->

<!-- /step:plan/3d-creation-sketch-planes-to-shaded-scenes-1793281213388/functional-environments-physics-and-interaction-1793281215081 -->

## 19. Export and import: glTF, USD, OBJ, STL
<!-- step:plan/3d-creation-sketch-planes-to-shaded-scenes-1793281213388/export-and-import-gltf-usd-obj-stl-1793281215205 -->
**Status:** Proposed

Get work into every engine with standard files rather than generated engine code: glTF/GLB with meshes, PBR materials, skins, morph targets, animations, lights and cameras; USD/USDZ for Apple and film pipelines; OBJ and STL for printing. Export presets set the axis and unit conventions each engine wants (Unreal Z-up centimeters, Unity and Godot Y-up meters). Import glTF, OBJ and FBX back as editable meshes. Round-trip tests check that what leaves Sleipnir comes back the same.

**Files**
- `src/01_canvas/io/exportGltf.ts` — node (typescript)
- `src/01_canvas/io/exportUsd.ts` — node (typescript)
- `src/01_canvas/io/importModel.ts` — node (typescript)
- `src/01_canvas/io/enginePresets.ts` — node (typescript)

**Edits**
- `src/01_canvas/CanvasView.ViewModel.tsx`
- `package.json`
<!-- /step-meta:plan/3d-creation-sketch-planes-to-shaded-scenes-1793281213388/export-and-import-gltf-usd-obj-stl-1793281215205 -->

<!-- /step:plan/3d-creation-sketch-planes-to-shaded-scenes-1793281213388/export-and-import-gltf-usd-obj-stl-1793281215205 -->

## 20. 3D components as code
<!-- step:plan/3d-creation-sketch-planes-to-shaded-scenes-1793281213388/3d-components-as-code-1793281215322 -->
**Status:** Proposed

A 3D component becomes code like a 2D one does, through the emitter registry: a React Three Fiber component that loads its .glb and wires its interaction states and animation clips, or a plain three.js module for non-React web pages. 2D UI and 3D scenes mix in one component tree, so a product page with a live 3D model is one design.

**Files**
- `src/01_canvas/emit/r3f.ts` — node (typescript)
- `src/01_canvas/emit/threeModule.ts` — node (typescript)

**Edits**
- `src/01_canvas/emit/targets.ts`
- `src/01_canvas/emit/react.ts`
<!-- /step-meta:plan/3d-creation-sketch-planes-to-shaded-scenes-1793281213388/3d-components-as-code-1793281215322 -->

<!-- /step:plan/3d-creation-sketch-planes-to-shaded-scenes-1793281213388/3d-components-as-code-1793281215322 -->

## 21. AI can model too
<!-- step:plan/3d-creation-sketch-planes-to-shaded-scenes-1793281213388/ai-can-model-too-1793281215484 -->
**Status:** Proposed

Teach the /frame, /component and canvas_build tools 3D: a spec can place frames on planes, sketch profiles, apply extrude, revolve, loft and carve, assign materials, add lights, and build an armature. The agent can then rough out a blockout from a description ("a low-poly lighthouse on a rock"), and the result is ordinary editable sketches and modifiers, not a frozen mesh. A /model command routes to it.

**Edits**
- `tools/agentSkills/vendor/canvas.mjs`
- `electron/agent/tools/canvas.cjs`
- `tools/agentSkills/registry.mjs`
- `electron/agent/systemPrompt.cjs`
<!-- /step-meta:plan/3d-creation-sketch-planes-to-shaded-scenes-1793281213388/ai-can-model-too-1793281215484 -->

<!-- /step:plan/3d-creation-sketch-planes-to-shaded-scenes-1793281213388/ai-can-model-too-1793281215484 -->

## 22. Studio: the Analytics slot becomes lighting, materials and animation
<!-- step:plan/3d-creation-sketch-planes-to-shaded-scenes-1793281213388/studio-the-analytics-slot-becomes-lighting-materials-and-animation-1793281722512 -->
**Status:** Proposed

Long term: the hidden Analytics section (src/05_analytics) is replaced by Studio, a workspace for finishing a 3D scene rather than building it. A large viewport with lighting tools (key, fill and rim presets, HDRI picker, light linking, exposure and tone mapping), a material library and the node shader editor side by side, and the animation timeline with clips, curves and camera shots, plus a render panel for stills and turntable or shot videos. It works on the same boards and components as the Canvas, so a model goes from sketch to lit, animated shot without export.

**Files**
- `src/05_studio/StudioView.tsx` — view (react)
- `src/05_studio/StudioView.ViewModel.tsx` — view-model (react)
- `src/05_studio/renderShot.ts` — node (typescript)

**Edits**
- `src/App.tsx`
- `src/05_analytics/AnalyticsView.tsx`
<!-- /step-meta:plan/3d-creation-sketch-planes-to-shaded-scenes-1793281213388/studio-the-analytics-slot-becomes-lighting-materials-and-animation-1793281722512 -->

<!-- /step:plan/3d-creation-sketch-planes-to-shaded-scenes-1793281213388/studio-the-analytics-slot-becomes-lighting-materials-and-animation-1793281722512 -->
