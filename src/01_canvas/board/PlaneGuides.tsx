import type { Guide } from '../model/align'
import { toScreenPoint, type Camera } from '../hooks/panZoomMath'

/**
 * Construction lines from the other 3D planes, projected onto the selected
 * layer's plane (see scene3d/sketchPlane.ts) — dashed and quiet in the plan
 * color, so they read as reference, not as the pink snap guides of a drag.
 * Drawn in screen space so they stay hairline-thin at any zoom.
 */
export function PlaneGuides({ guides, camera }: { guides: Guide[]; camera: Camera }) {
  return (
    <>
      {guides.map((guide, i) => {
        const from = toScreenPoint(camera, guide.axis === 'x' ? guide.position : guide.start, guide.axis === 'x' ? guide.start : guide.position)
        const length = (guide.end - guide.start) * camera.k
        return (
          <div
            key={`plane-guide-${i}`}
            style={{
              position: 'absolute',
              left: from.x,
              top: from.y,
              width: guide.axis === 'x' ? 0 : length,
              height: guide.axis === 'x' ? length : 0,
              borderLeft: guide.axis === 'x' ? '1px dashed var(--graph-plan, #5b9dff)' : undefined,
              borderTop: guide.axis === 'y' ? '1px dashed var(--graph-plan, #5b9dff)' : undefined,
              opacity: 0.55,
              pointerEvents: 'none',
            }}
          />
        )
      })}
    </>
  )
}
