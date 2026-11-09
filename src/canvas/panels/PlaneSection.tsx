import { Frame } from '../../app/UIKit/Frame/Frame'
import type { CanvasDoc, CanvasNode, NodeId } from '../../document/types'
import type { DefaultPlane, PlaneRef } from '../../document/objects'
import { placementOf } from '../../document/placement'
import { describePlane } from '../../modeling/scene3d/planeRefs'
import type { Placement3D, Vec3 } from '../../document/sceneTypes'
import { ACTION, Label, UI_FONT, NumberField, Section } from './inspectorKit'

const PLANES: { id: DefaultPlane; label: string; hint: string }[] = [
  { id: 'front', label: 'Front', hint: 'Stand it on the Front plane, facing the viewer (XY)' },
  { id: 'top', label: 'Top', hint: 'Lay it on the Top plane, facing up (XZ)' },
  { id: 'side', label: 'Side', hint: 'Stand it on the Side plane, facing right (YZ)' },
]

/** The default plane a sketch stands on directly or is offset from, and how far. */
function baseOf(ref: PlaneRef | undefined): { plane: DefaultPlane; distance: number } | null {
  if (ref?.kind === 'default') return { plane: ref.plane, distance: 0 }
  if (ref?.kind === 'offset' && ref.from.kind === 'default') return { plane: ref.from.plane, distance: ref.distance }
  return null
}

export const segmentStyle = (active: boolean): React.CSSProperties => ({
  ...ACTION,
  width: 'auto',
  flex: 1,
  borderRadius: 0,
  border: 'none',
  background: active ? 'rgba(var(--item-ink, 255,255,255), 0.14)' : 'transparent',
  color: active ? 'var(--text-1)' : 'var(--text-3)',
})

export const segmentGroup: React.CSSProperties = {
  display: 'flex',
  width: '100%',
  border: '1px solid var(--border-1)',
  borderRadius: 'var(--radius-control)',
  overflow: 'hidden',
}

/**
 * Where a top-level layer stands in 3D. As a sketch it stands on a plane —
 * Front, Top or Side, offset from one, or a face of an object — and follows
 * that plane (scene3d/planeRefs.ts); typing a position or rotation places it
 * freely instead. The board shows it as the 3D Front view sees it, and a
 * double-click opens its plane face on to draw on (scene3d/planeEdit.ts).
 */
export function PlaneSection({
  node,
  doc,
  onChange,
  onPlane,
  link,
  problem,
}: {
  node: CanvasNode
  doc: CanvasDoc
  /** A placement typed in, or undefined to put it back on the front plane, facing the board. */
  onChange: (id: NodeId, space: Placement3D | undefined, gesture?: string) => void
  onPlane: (id: NodeId, plane: PlaneRef, gesture?: string) => void
  /** A placed sketch: the Sketch it comes from, a way to open it, and Unlink. */
  link?: { name: string; onOpen: () => void; onUnlink: () => void } | null
  /** Broken: why, and Re-pick face when a face is what it lost. Picking Front, Top or Side below also mends it. */
  problem?: { why: string; onRepickFace?: () => void } | null
}) {
  const placement = placementOf(node)
  const ref = node.sketch?.plane
  const base = baseOf(ref)
  const held = !!ref && ref.kind !== 'custom'
  const set = (patch: Partial<Placement3D>, gesture?: string) => onChange(node.id, { ...placement, ...patch }, gesture)
  const axis = (key: 'position' | 'rotation', i: number, value: number) => {
    const next = [...placement[key]] as Vec3
    next[i] = value
    set({ [key]: next }, `${key}-${i}`)
  }
  const offset = (distance: number) =>
    base && onPlane(node.id, distance ? { kind: 'offset', from: { kind: 'default', plane: base.plane }, distance } : { kind: 'default', plane: base.plane }, 'offset')
  return (
    <Section
      title="Plane"
      action={
        node.space || node.sketch ? (
          <button type="button" style={{ ...UI_FONT, fontSize: 10, color: 'var(--text-3)', background: 'transparent', border: 'none', cursor: 'pointer' }} title="Back on the front plane, facing the board" onClick={() => onChange(node.id, undefined)}>
            Reset
          </button>
        ) : undefined
      }
    >
      {problem && (
        <Frame flow="vertical" gap={4} w="fill">
          <span style={{ ...UI_FONT, fontSize: 11, color: 'var(--danger)', lineHeight: 1.5 }}>{problem.why}.</span>
          <Frame flow="horizontal" align="center" gap={12} w="fill">
            {problem.onRepickFace && (
              <button type="button" style={{ ...UI_FONT, fontSize: 11, color: 'var(--text-1)', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline', textUnderlineOffset: 2 }} title="Click a face in 3D for it to stand on" onClick={problem.onRepickFace}>
                Re-pick face
              </button>
            )}
            <span style={{ ...UI_FONT, fontSize: 10, color: 'var(--text-3)' }}>{problem.onRepickFace ? 'or pick a plane below' : 'Unlink keeps this copy as a local sketch'}</span>
          </Frame>
        </Frame>
      )}
      {link && (
        <Frame flow="horizontal" align="center" gap={8} w="fill">
          <span style={{ ...UI_FONT, fontSize: 11, color: 'var(--text-2)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={`Placed from the sketch “${link.name}” — edits there flow in here`}>
            Linked to {link.name}
          </span>
          <button type="button" style={{ ...UI_FONT, fontSize: 10, color: 'var(--text-2)', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }} title="Open the sketch to edit its layers" onClick={link.onOpen}>
            Edit in sketch
          </button>
          <button type="button" style={{ ...UI_FONT, fontSize: 10, color: 'var(--text-2)', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }} title="Keep a local copy here and stop following the sketch" onClick={link.onUnlink}>
            Unlink
          </button>
        </Frame>
      )}
      <div style={segmentGroup}>
        {PLANES.map((p) => (
          <button key={p.id} type="button" aria-pressed={base?.plane === p.id} title={p.hint} style={segmentStyle(base?.plane === p.id)} onClick={() => onPlane(node.id, { kind: 'default', plane: p.id })}>
            {p.label}
          </button>
        ))}
      </div>
      {ref && (
        <span style={{ ...UI_FONT, fontSize: 10, color: 'var(--text-3)', lineHeight: 1.5 }}>
          {held ? `On ${describePlane(doc, ref)}` : 'On a custom plane — pick Front, Top or Side to stand it on one'}
        </span>
      )}
      {base && <NumberField label="Offset (m)" value={base.distance} step={0.01} onChange={offset} />}
      <Label>Position (m){held ? ' — typing one frees it from the plane' : ''}</Label>
      <Frame flow="horizontal" gap={6} w="fill">
        {(['X', 'Y', 'Z'] as const).map((l, i) => (
          <NumberField key={l} label={l} value={placement.position[i]} step={0.01} onChange={(v) => axis('position', i, v)} />
        ))}
      </Frame>
      <Label>Rotation (°)</Label>
      <Frame flow="horizontal" gap={6} w="fill">
        {(['X', 'Y', 'Z'] as const).map((l, i) => (
          <NumberField key={l} label={l} value={placement.rotation[i]} suffix="°" onChange={(v) => axis('rotation', i, v)} />
        ))}
      </Frame>
      {!node.space && (
        <span style={{ ...UI_FONT, fontSize: 10, color: 'var(--text-3)', lineHeight: 1.5 }}>
          On the Front plane. Pick another, or move it in 3D, to stand it elsewhere; double-click it in the list to draw on it.
        </span>
      )}
    </Section>
  )
}
