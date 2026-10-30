import { Frame } from '../../app/UIKit/Frame/Frame'
import type { CanvasNode, NodeId } from '../model/types'
import { PLANE_ROTATION, placementOf, planeOf } from '../scene3d/placement'
import type { Placement3D, PlanePreset, Vec3 } from '../scene3d/sceneTypes'
import { ACTION, Label, MONO, NumberField, Section } from './inspectorKit'

const PLANES: { id: PlanePreset; label: string; hint: string }[] = [
  { id: 'front', label: 'FRONT', hint: 'Stand it facing the viewer (the XY plane)' },
  { id: 'top', label: 'TOP', hint: 'Lay it on the ground, facing up (the XZ plane)' },
  { id: 'side', label: 'SIDE', hint: 'Stand it facing right (the YZ plane)' },
]

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
 * Where a top-level layer's plane sits in 3D: on the Front, Top or Side
 * drafting plane, or turned to any angle, and where in space. The layer's 2D
 * contents are untouched — the board keeps showing them straight-on; this
 * only says how the 3D view stands them up (see scene3d/placement.ts).
 */
export function PlaneSection({ node, onChange }: { node: CanvasNode; onChange: (id: NodeId, space: Placement3D | undefined, gesture?: string) => void }) {
  const placement = placementOf(node)
  const plane = planeOf(placement.rotation)
  const set = (patch: Partial<Placement3D>, gesture?: string) => onChange(node.id, { ...placement, ...patch }, gesture)
  const axis = (key: 'position' | 'rotation', i: number, value: number) => {
    const next = [...placement[key]] as Vec3
    next[i] = value
    set({ [key]: next }, `${key}-${i}`)
  }
  return (
    <Section
      title="3D PLANE"
      action={
        node.space ? (
          <button type="button" style={{ ...MONO, fontSize: 9, color: 'var(--text-3)', background: 'transparent', border: 'none', cursor: 'pointer' }} title="Back on the front plane, where the board shows it" onClick={() => onChange(node.id, undefined)}>
            RESET
          </button>
        ) : undefined
      }
    >
      <div style={segmentGroup}>
        {PLANES.map((p) => (
          <button key={p.id} type="button" aria-pressed={plane === p.id} title={p.hint} style={segmentStyle(plane === p.id)} onClick={() => set({ rotation: PLANE_ROTATION[p.id] })}>
            {p.label}
          </button>
        ))}
      </div>
      <Label>POSITION (M)</Label>
      <Frame flow="horizontal" gap={6} w="fill">
        {(['X', 'Y', 'Z'] as const).map((l, i) => (
          <NumberField key={l} label={l} value={placement.position[i]} step={0.01} onChange={(v) => axis('position', i, v)} />
        ))}
      </Frame>
      <Label>ROTATION (°){plane === 'custom' ? ' — CUSTOM' : ''}</Label>
      <Frame flow="horizontal" gap={6} w="fill">
        {(['X', 'Y', 'Z'] as const).map((l, i) => (
          <NumberField key={l} label={l} value={placement.rotation[i]} suffix="°" onChange={(v) => axis('rotation', i, v)} />
        ))}
      </Frame>
      {!node.space && (
        <span style={{ ...MONO, fontSize: 9, color: 'var(--text-3)', lineHeight: 1.5 }}>
          On the front plane where the board shows it. Pick a plane, or move it in 3D, to place it in space.
        </span>
      )}
    </Section>
  )
}
