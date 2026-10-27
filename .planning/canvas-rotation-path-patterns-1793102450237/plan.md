<!-- sleipnir:plan — generated from .planning/notes.json. Write freely under the title and between a step's /step-meta and /step markers; everything else is regenerated. -->
# Canvas rotation & path patterns
<!-- /plan-meta -->

<!-- steps -->

## 1. Rotation geometry core
<!-- step:plan/canvas-rotation-path-patterns-1793102450237/rotation-geometry-core-1793102466102 -->
Pure rotation math every later step leans on: a node's rotated corners, its axis-aligned bounds, point-in-rotated-box hit tests, and composing a node's rotation with its ancestors' so board-space geometry stays correct inside rotated frames. Promotes style.rotate (added for along-path) to a general, documented field for every layer kind.

**Files**
- `src/01_canvas/model/rotation.ts` — node (typescript)
- `src/01_canvas/model/rotation.test.ts` — node (typescript)

**Edits**
- `src/01_canvas/model/types.ts`
- `src/01_canvas/model/toCss.ts`
<!-- /step-meta:plan/canvas-rotation-path-patterns-1793102450237/rotation-geometry-core-1793102466102 -->

<!-- /step:plan/canvas-rotation-path-patterns-1793102450237/rotation-geometry-core-1793102466102 -->

## 2. Rotate on the board
<!-- step:plan/canvas-rotation-path-patterns-1793102450237/rotate-on-the-board-1793102466210 -->
Make rotation a real gesture: selection outlines and resize handles drawn rotated, a rotate handle just outside each corner (Shift snaps to 15°), hit-testing and marquee against the rotated shape, and resizing in the node's own rotated space so a turned image still resizes from the handle you grab.

**Edits**
- `src/01_canvas/model/doc.ts`
- `src/01_canvas/board/CanvasBoard.tsx`
- `src/01_canvas/CanvasView.ViewModel.tsx`
- `src/01_canvas/model/align.ts`
<!-- /step-meta:plan/canvas-rotation-path-patterns-1793102450237/rotate-on-the-board-1793102466210 -->

<!-- /step:plan/canvas-rotation-path-patterns-1793102450237/rotate-on-the-board-1793102466210 -->

## 3. Rotation in the inspector and every emitter
<!-- step:plan/canvas-rotation-path-patterns-1793102450237/rotation-in-the-inspector-and-every-emitter-1793102466403 -->
A ROTATION field (degrees) beside X/Y/W/H for every layer, plus rotate 90° actions; emit/svg.ts writes the rotation as an SVG transform so SVG components match the board, and emitter tests lock down React and SVG output.

**Edits**
- `src/01_canvas/panels/CanvasInspector.tsx`
- `src/01_canvas/emit/svg.ts`
- `src/01_canvas/emit/svg.test.ts`
- `src/01_canvas/emit/react.test.ts`
<!-- /step-meta:plan/canvas-rotation-path-patterns-1793102450237/rotation-in-the-inspector-and-every-emitter-1793102466403 -->

<!-- /step:plan/canvas-rotation-path-patterns-1793102450237/rotation-in-the-inspector-and-every-emitter-1793102466403 -->

## 4. Scaling for images and SVGs
<!-- step:plan/canvas-rotation-path-patterns-1793102450237/scaling-for-images-and-svgs-1793102466651 -->
Images and SVGs keep their aspect ratio when resized by default (Shift frees it), a Scale % field and Reset to natural size in the inspector, crisp SVG scaling via viewBox, and fit/fill quick toggles for image fills — so pasted PNGs, JPEGs and SVGs behave like Figma's.

**Files**
- `src/01_canvas/model/imageSizing.ts` — node (typescript)
- `src/01_canvas/model/imageSizing.test.ts` — node (typescript)

**Edits**
- `src/01_canvas/CanvasView.ViewModel.tsx`
- `src/01_canvas/panels/CanvasInspector.tsx`
- `src/01_canvas/panels/PaintSections.tsx`
<!-- /step-meta:plan/canvas-rotation-path-patterns-1793102450237/scaling-for-images-and-svgs-1793102466651 -->

<!-- /step:plan/canvas-rotation-path-patterns-1793102450237/scaling-for-images-and-svgs-1793102466651 -->

## 5. Repeat one item along a path
<!-- step:plan/canvas-rotation-path-patterns-1793102450237/repeat-one-item-along-a-path-1793102466953 -->
AlongPath gains a pattern: pick a template child and a repeat count (or fill-to-path by gap), and the layout keeps N linked copies spaced along the guide. Copies are real nodes tagged with their template, kept in sync on every change, shown grouped and read-only in the layers panel; editing the template updates every copy.

**Files**
- `src/01_canvas/model/pathPattern.ts` — node (typescript)
- `src/01_canvas/model/pathPattern.test.ts` — node (typescript)

**Edits**
- `src/01_canvas/model/types.ts`
- `src/01_canvas/model/pathFlow.ts`
- `src/01_canvas/panels/CanvasInspector.tsx`
- `src/01_canvas/panels/CanvasLayersPanel.tsx`
<!-- /step-meta:plan/canvas-rotation-path-patterns-1793102450237/repeat-one-item-along-a-path-1793102466953 -->

<!-- /step:plan/canvas-rotation-path-patterns-1793102450237/repeat-one-item-along-a-path-1793102466953 -->

## 6. Emit patterns compactly
<!-- step:plan/canvas-rotation-path-patterns-1793102450237/emit-patterns-compactly-1793102467236 -->
Instead of N hand-placed copies in the generated file, the React and SVG emitters write the pattern once as an array of positions mapped over the template, so a 200-item pattern stays a few readable lines of code.

**Edits**
- `src/01_canvas/emit/react.ts`
- `src/01_canvas/emit/react.test.ts`
- `src/01_canvas/emit/svg.ts`
- `src/01_canvas/emit/svg.test.ts`
<!-- /step-meta:plan/canvas-rotation-path-patterns-1793102450237/emit-patterns-compactly-1793102467236 -->

<!-- /step:plan/canvas-rotation-path-patterns-1793102450237/emit-patterns-compactly-1793102467236 -->

## 7. Optimize along-path layout for big patterns
<!-- step:plan/canvas-rotation-path-patterns-1793102450237/optimize-along-path-layout-for-big-patterns-1793102467555 -->
Cache each guide's flattened polyline and arc-length table by guide identity, re-flow only the frames whose guide or children changed, keep re-flow cheap during drags, and memoize copy rendering — with a test that a several-hundred-item pattern re-flows within a frame budget.

**Edits**
- `src/01_canvas/model/pathFlow.ts`
- `src/01_canvas/model/pathFlow.test.ts`
- `src/01_canvas/CanvasView.ViewModel.tsx`
- `src/01_canvas/board/CanvasNodeView.tsx`
<!-- /step-meta:plan/canvas-rotation-path-patterns-1793102450237/optimize-along-path-layout-for-big-patterns-1793102467555 -->

<!-- /step:plan/canvas-rotation-path-patterns-1793102450237/optimize-along-path-layout-for-big-patterns-1793102467555 -->

## 8. Path-flow editing on the board
<!-- step:plan/canvas-rotation-path-patterns-1793102450237/path-flow-editing-on-the-board-1793102467817 -->
Show the guide's start point and direction when an along-path frame is selected, drag an item along the curve to set the offset or reorder it, and draw pattern copies with rotated outlines — so tuning a pattern happens on the board, not only in the inspector.

**Edits**
- `src/01_canvas/board/CanvasBoard.tsx`
- `src/01_canvas/CanvasView.ViewModel.tsx`
- `src/01_canvas/model/layout.ts`
- `src/01_canvas/model/pathFlow.ts`
<!-- /step-meta:plan/canvas-rotation-path-patterns-1793102450237/path-flow-editing-on-the-board-1793102467817 -->

<!-- /step:plan/canvas-rotation-path-patterns-1793102450237/path-flow-editing-on-the-board-1793102467817 -->
