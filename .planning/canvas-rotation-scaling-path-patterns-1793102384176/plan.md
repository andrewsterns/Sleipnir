<!-- sleipnir:plan — generated from .planning/notes.json. Write freely under the title and between a step's /step-meta and /step markers; everything else is regenerated. -->
# Canvas rotation, scaling & path patterns
<!-- /plan-meta -->

<!-- steps -->

## 1. Rotate on the board
<!-- step:plan/canvas-rotation-scaling-path-patterns-1793102384176/rotate-on-the-board-1793102411311 -->
Make rotation a real gesture: selection outlines and resize handles drawn rotated, a rotate handle just outside each corner (Shift snaps to 15°), hit-testing and marquee against the rotated shape, and resizing in the node's own rotated space so a turned image still resizes from the handle you grab.

**Edits**
- `src/01_canvas/model/doc.ts`
- `src/01_canvas/board/CanvasBoard.tsx`
- `src/01_canvas/CanvasView.ViewModel.tsx`
- `src/01_canvas/model/align.ts`
<!-- /step-meta:plan/canvas-rotation-scaling-path-patterns-1793102384176/rotate-on-the-board-1793102411311 -->

<!-- /step:plan/canvas-rotation-scaling-path-patterns-1793102384176/rotate-on-the-board-1793102411311 -->

## 2. Rotation in the inspector and every emitter
<!-- step:plan/canvas-rotation-scaling-path-patterns-1793102384176/rotation-in-the-inspector-and-every-emitter-1793102411398 -->
A ROTATION field (degrees) beside X/Y/W/H for every layer, plus rotate 90° actions; emit/svg.ts writes the rotation as an SVG transform so SVG components match the board, and emitter tests lock down React and SVG output.

**Edits**
- `src/01_canvas/panels/CanvasInspector.tsx`
- `src/01_canvas/emit/svg.ts`
- `src/01_canvas/emit/svg.test.ts`
- `src/01_canvas/emit/react.test.ts`
<!-- /step-meta:plan/canvas-rotation-scaling-path-patterns-1793102384176/rotation-in-the-inspector-and-every-emitter-1793102411398 -->

<!-- /step:plan/canvas-rotation-scaling-path-patterns-1793102384176/rotation-in-the-inspector-and-every-emitter-1793102411398 -->

## 3. Emit patterns compactly
<!-- step:plan/canvas-rotation-scaling-path-patterns-1793102384176/emit-patterns-compactly-1793102411854 -->
Instead of N hand-placed copies in the generated file, the React and SVG emitters write the pattern once as an array of positions mapped over the template, so a 200-item pattern stays a few readable lines of code.

**Edits**
- `src/01_canvas/emit/react.ts`
- `src/01_canvas/emit/react.test.ts`
- `src/01_canvas/emit/svg.ts`
- `src/01_canvas/emit/svg.test.ts`
<!-- /step-meta:plan/canvas-rotation-scaling-path-patterns-1793102384176/emit-patterns-compactly-1793102411854 -->

<!-- /step:plan/canvas-rotation-scaling-path-patterns-1793102384176/emit-patterns-compactly-1793102411854 -->

## 4. Optimize along-path layout for big patterns
<!-- step:plan/canvas-rotation-scaling-path-patterns-1793102384176/optimize-along-path-layout-for-big-patterns-1793102412075 -->
Cache each guide's flattened polyline and arc-length table by guide identity, re-flow only the frames whose guide or children changed, keep re-flow cheap during drags, and memoize copy rendering — with a test that a several-hundred-item pattern re-flows within a frame budget.

**Edits**
- `src/01_canvas/model/pathFlow.ts`
- `src/01_canvas/model/pathFlow.test.ts`
- `src/01_canvas/CanvasView.ViewModel.tsx`
- `src/01_canvas/board/CanvasNodeView.tsx`
<!-- /step-meta:plan/canvas-rotation-scaling-path-patterns-1793102384176/optimize-along-path-layout-for-big-patterns-1793102412075 -->

<!-- /step:plan/canvas-rotation-scaling-path-patterns-1793102384176/optimize-along-path-layout-for-big-patterns-1793102412075 -->

## 5. Path-flow editing on the board
<!-- step:plan/canvas-rotation-scaling-path-patterns-1793102384176/path-flow-editing-on-the-board-1793102412451 -->
Show the guide's start point and direction when an along-path frame is selected, drag an item along the curve to set the offset or reorder it, and draw pattern copies with rotated outlines — so tuning a pattern happens on the board, not only in the inspector.

**Edits**
- `src/01_canvas/board/CanvasBoard.tsx`
- `src/01_canvas/CanvasView.ViewModel.tsx`
- `src/01_canvas/model/layout.ts`
- `src/01_canvas/model/pathFlow.ts`
<!-- /step-meta:plan/canvas-rotation-scaling-path-patterns-1793102384176/path-flow-editing-on-the-board-1793102412451 -->

<!-- /step:plan/canvas-rotation-scaling-path-patterns-1793102384176/path-flow-editing-on-the-board-1793102412451 -->
