import { Frame } from '../../app/UIKit/Frame/Frame'
import type { CanvasDoc, CanvasNode, NodeId } from '../../document/types'
import type { RevolveAxis, SolidSpec } from '../../document/sceneTypes'
import { triangleCount } from '../../modeling/geometry/modifiers'
import { layerMesh, sweptMesh } from '../../modeling/scene3d/sceneMeshes'
import { solidOf } from '../../document/objects'
import { Label, UI_FONT, NumberField, Section } from './inspectorKit'
import { segmentGroup, segmentStyle } from './PlaneSection'
import { SelectField } from '../../app/UIKit/Field/TextField'

type Kind = 'none' | SolidSpec['kind']

const KINDS: { id: Kind; label: string; hint: string }[] = [
  { id: 'none', label: 'Flat', hint: 'A flat layer on its plane' },
  { id: 'extrude', label: 'Extrude', hint: 'Push the outline out of its plane' },
  { id: 'revolve', label: 'Revolve', hint: 'Spin the outline around its center line or an edge' },
  { id: 'sweep', label: 'Sweep', hint: 'Carry the outline along another layer’s path' },
]

const AXES: { id: RevolveAxis; label: string; hint: string }[] = [
  { id: 'center', label: 'Center', hint: 'Spin around the vertical center line: draw the whole silhouette' },
  { id: 'left', label: 'Left edge', hint: 'Spin around the left edge: draw half a profile against it' },
  { id: 'bottom', label: 'Bottom edge', hint: 'Spin around the bottom edge, lying down: discs and wheels' },
]

// What each modifier starts as when first picked.
const DEFAULTS: Record<SolidSpec['kind'], (pathId: NodeId | undefined) => SolidSpec | undefined> = {
  extrude: () => ({ kind: 'extrude', depth: 0.2 }),
  revolve: () => ({ kind: 'revolve', axis: 'center', angle: 360, steps: 48 }),
  sweep: (pathId) => (pathId ? { kind: 'sweep', pathId } : undefined),
}

/**
 * Turns a layer's outline into a solid — and says what it costs: every anchor
 * of the outline is a vertex of the profile, and the modifier multiplies it
 * (see geometry/modifiers.ts), so the triangle count updates as you sketch.
 */
export function SolidSection({
  node,
  doc,
  paths,
  onChange,
}: {
  node: CanvasNode
  doc: CanvasDoc
  /** Other vector layers a sweep can follow. */
  paths: { id: NodeId; name: string }[]
  onChange: (id: NodeId, solid: SolidSpec | undefined, gesture?: string) => void
}) {
  const solid = solidOf(doc, node.id)
  const kind: Kind = solid?.kind ?? 'none'
  const path = solid?.kind === 'sweep' ? findById(doc.nodes, solid.pathId) : null
  const mesh = solid?.kind === 'sweep' ? (path ? sweptMesh(node, path) : null) : layerMesh(node, doc)
  const tris = mesh ? triangleCount(mesh) : 0
  const pick = (k: Kind) => onChange(node.id, k === 'none' ? undefined : DEFAULTS[k](solid?.kind === 'sweep' ? solid.pathId : paths[0]?.id))

  return (
    <Section title="Solid">
      <div style={segmentGroup}>
        {KINDS.map((k) => (
          <button
            key={k.id}
            type="button"
            aria-pressed={kind === k.id}
            disabled={k.id === 'sweep' && paths.length === 0}
            title={k.id === 'sweep' && paths.length === 0 ? 'Draw a path to sweep along first' : k.hint}
            style={{ ...segmentStyle(kind === k.id), opacity: k.id === 'sweep' && paths.length === 0 ? 0.4 : 1 }}
            onClick={() => pick(k.id)}
          >
            {k.label}
          </button>
        ))}
      </div>

      {solid?.kind === 'extrude' && (
        <NumberField label="Depth (m)" value={solid.depth} step={0.01} min={0.001} onChange={(depth) => onChange(node.id, { ...solid, depth }, 'depth')} />
      )}

      {solid?.kind === 'revolve' && (
        <>
          <div style={segmentGroup}>
            {AXES.map((a) => (
              <button key={a.id} type="button" aria-pressed={solid.axis === a.id} title={a.hint} style={segmentStyle(solid.axis === a.id)} onClick={() => onChange(node.id, { ...solid, axis: a.id })}>
                {a.label}
              </button>
            ))}
          </div>
          <Frame flow="horizontal" gap={6} w="fill">
            <NumberField label="Angle" value={solid.angle} suffix="°" min={1} max={360} onChange={(angle) => onChange(node.id, { ...solid, angle }, 'angle')} />
            <NumberField label="Steps" value={solid.steps} min={3} max={256} onChange={(steps) => onChange(node.id, { ...solid, steps: Math.round(steps) }, 'steps')} />
          </Frame>
        </>
      )}

      {solid?.kind === 'sweep' && (
        <Frame flow="vertical" gap={2} w="fill">
          <Label>Along</Label>
          <SelectField size="sm" value={solid.pathId} onChange={(e) => onChange(node.id, { ...solid, pathId: e.target.value })}>
            {paths.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </SelectField>
        </Frame>
      )}

      {solid && (
        <span style={{ ...UI_FONT, fontSize: 10, color: 'var(--text-3)', lineHeight: 1.5 }}>
          {tris.toLocaleString()} triangles. Each anchor of the outline is a vertex; curves are split finely enough to stay smooth.
          {solid.kind === 'sweep' ? ' The profile is centered on the path.' : ''} See it in 3D.
        </span>
      )}
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
