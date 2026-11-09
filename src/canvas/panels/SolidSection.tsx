import type { CanvasDoc, CanvasNode, NodeId } from '../../document/types'
import { triangleCount } from '../../modeling/geometry/modifiers'
import { layerMesh, sweepTolerance, sweptMesh } from '../../modeling/scene3d/sceneMeshes'
import { featureOf, SMOOTHNESS, solidOf, type Feature, type Smoothness } from '../../document/objects'
import { UI_FONT, Section } from './inspectorKit'
import { segmentGroup, segmentStyle } from './PlaneSection'

/**
 * How round a part's curves are — with its fill and stroke, how it looks
 * (src/canvas/LAYOUT.md: Appearance). Its triangle count beside it.
 */
export function SmoothnessSection({ node, doc, onFeature }: { node: CanvasNode; doc: CanvasDoc; onFeature: (featureId: string, patch: Partial<Feature>) => void }) {
  const feature = featureOf(doc, node.id)?.feature
  const solid = solidOf(doc, node.id)
  if (!feature || !solid) return null
  const smoothness: Smoothness = feature.smoothness ?? 'medium'
  const path = solid.kind === 'sweep' ? findById(doc.nodes, solid.pathId) : null
  const mesh = solid.kind === 'sweep' ? (path ? sweptMesh(node, path, sweepTolerance(doc, node)) : null) : layerMesh(node, doc)
  const tris = mesh ? triangleCount(mesh) : 0
  // A revolve's steps follow the smoothness picked; typed by hand, they're its own.
  const set = (next: Smoothness) =>
    onFeature(feature.id, feature.kind === 'revolve' ? { smoothness: next, steps: Math.max(3, Math.round((SMOOTHNESS[next].steps * feature.angle) / 360)) } : { smoothness: next })
  return (
    <Section
      title="Smoothness"
      action={
        <span style={{ ...UI_FONT, fontSize: 10, color: 'var(--text-3)' }} title="What this part costs to draw">
          {tris.toLocaleString()} triangles
        </span>
      }
    >
      <div style={segmentGroup}>
        {(Object.keys(SMOOTHNESS) as Smoothness[]).map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={smoothness === s}
            title={s === 'low' ? 'Fewer, bigger polygons — lighter' : s === 'high' ? 'More, smaller polygons — rounder, heavier' : 'The default'}
            style={segmentStyle(smoothness === s)}
            onClick={() => set(s)}
          >
            {SMOOTHNESS[s].label}
          </button>
        ))}
      </div>
    </Section>
  )
}

function findById(nodes: CanvasNode[], id: NodeId): CanvasNode | null {
  for (const n of nodes) {
    if (n.id === id) return n
    const hit = n.kind === 'frame' ? findById(n.children, id) : null
    if (hit) return hit
  }
  return null
}
