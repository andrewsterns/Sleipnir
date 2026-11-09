import { useEffect } from 'react'
import { Frame } from '../../app/UIKit/Frame/Frame'
import { SelectField } from '../../app/UIKit/Field/TextField'
import type { NodeId } from '../../document/types'
import type { RevolveAxis } from '../../document/sceneTypes'
import type { CanvasObject, ExtrudeFeature, Feature, FeatureOp } from '../../document/objects'
import { Label, UI_FONT, NumberField, Section } from './inspectorKit'
import { segmentGroup, segmentStyle } from './PlaneSection'

const DIRECTIONS: { id: NonNullable<ExtrudeFeature['direction']>; label: string; hint: string }[] = [
  { id: 'normal', label: 'One way', hint: 'Out of the sketch’s front' },
  { id: 'reverse', label: 'Reverse', hint: 'Behind the sketch instead' },
  { id: 'symmetric', label: 'Both sides', hint: 'Half each way, centered on the sketch' },
]

const AXES: { id: RevolveAxis; label: string; hint: string }[] = [
  { id: 'center', label: 'Center', hint: 'Spin around the vertical center line: draw the whole silhouette' },
  { id: 'left', label: 'Left edge', hint: 'Spin around the left edge: draw half a profile against it' },
  { id: 'bottom', label: 'Bottom edge', hint: 'Spin around the bottom edge, lying down: discs and wheels' },
]

const OPS: { id: Exclude<FeatureOp, 'new'>; label: string; hint: string }[] = [
  { id: 'add', label: 'Add', hint: 'Joined to the part so far' },
  { id: 'subtract', label: 'Subtract', hint: 'Cut out of the part so far' },
  { id: 'intersect', label: 'Intersect', hint: 'Only where it overlaps the part so far' },
]

const quiet: React.CSSProperties = { ...UI_FONT, fontSize: 10, color: 'var(--text-3)', lineHeight: 1.5 }
const textButton: React.CSSProperties = { ...UI_FONT, fontSize: 10, color: 'var(--text-3)', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }

/**
 * A feature's settings, as Onshape's feature dialog (src/canvas/LAYOUT.md):
 * what it does to its sketch, and how it meets the part built before it.
 * Every change shows at once in the 3D view; OK keeps the lot as one undo
 * step, Cancel puts all of it back. Picking anything else keeps it.
 */
export function FeatureSection({
  feature,
  part,
  paths,
  pending,
  onChange,
  onDone,
  onRemove,
}: {
  feature: Feature
  part: CanvasObject
  /** Vector layers a sweep can follow. */
  paths: { id: NodeId; name: string }[]
  /** Changed since it was last kept: OK and Cancel show. */
  pending: boolean
  onChange: (patch: Partial<Feature>) => void
  onDone: (keep: boolean) => void
  onRemove: () => void
}) {
  const first = part.features[0]?.id === feature.id
  // While it has changes, Enter keeps them and Esc puts them back — outside a field, where Enter and Esc are the field's.
  useEffect(() => {
    if (!pending) return
    const key = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return
      if (e.key !== 'Enter' && e.key !== 'Escape') return
      e.preventDefault()
      e.stopImmediatePropagation()
      onDone(e.key === 'Enter')
    }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [pending, onDone])
  return (
    <Section
      title={feature.name}
      action={
        <button type="button" style={textButton} title="Take the feature away — its sketch lies flat again" onClick={onRemove}>
          Remove
        </button>
      }
    >
      {feature.kind === 'extrude' && (
        <>
          <NumberField label="Depth (m)" value={feature.depth} step={0.01} min={0.001} onChange={(depth) => onChange({ depth })} />
          <div style={segmentGroup}>
            {DIRECTIONS.map((d) => {
              const on = (feature.direction ?? 'normal') === d.id
              return (
                <button key={d.id} type="button" aria-pressed={on} title={d.hint} style={segmentStyle(on)} onClick={() => onChange({ direction: d.id })}>
                  {d.label}
                </button>
              )
            })}
          </div>
        </>
      )}

      {feature.kind === 'extrude' && feature.tweaks && Object.keys(feature.tweaks).length > 0 && (
        <Frame flow="horizontal" align="center" gap={8} w="fill">
          <span style={{ ...quiet, flex: 1 }}>{Object.keys(feature.tweaks).length} corners moved on their own.</span>
          <button type="button" style={textButton} title="Put the corners back where the sketch says" onClick={() => onChange({ tweaks: undefined })}>
            Reset
          </button>
        </Frame>
      )}

      {feature.kind === 'revolve' && (
        <>
          <div style={segmentGroup}>
            {AXES.map((a) => (
              <button key={a.id} type="button" aria-pressed={feature.axis === a.id} title={a.hint} style={segmentStyle(feature.axis === a.id)} onClick={() => onChange({ axis: a.id })}>
                {a.label}
              </button>
            ))}
          </div>
          <Frame flow="horizontal" gap={6} w="fill">
            <NumberField label="Angle" value={feature.angle} suffix="°" min={1} max={360} onChange={(angle) => onChange({ angle })} />
            <NumberField label="Steps" value={feature.steps} min={3} max={256} onChange={(steps) => onChange({ steps: Math.round(steps) })} />
          </Frame>
        </>
      )}

      {feature.kind === 'sweep' && (
        <Frame flow="vertical" gap={2} w="fill">
          <Label>Along</Label>
          <SelectField size="sm" value={feature.pathId} onChange={(e) => onChange({ pathId: e.target.value })}>
            {paths.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </SelectField>
        </Frame>
      )}

      {feature.kind === 'loft' && <span style={quiet}>Lofts aren’t built yet — its sketches are kept for when they are.</span>}

      {/* How it meets the part so far. The first feature starts the part, so it has nothing to meet. */}
      {first ? (
        <span style={quiet}>Starts {part.name}. Features after it add to it, cut it or keep only the overlap.</span>
      ) : (
        <>
          <div style={segmentGroup}>
            {OPS.map((o) => (
              <button key={o.id} type="button" aria-pressed={feature.op === o.id} title={o.hint} style={segmentStyle(feature.op === o.id)} onClick={() => onChange({ op: o.id })}>
                {o.label}
              </button>
            ))}
          </div>
          {feature.op !== 'add' && <span style={quiet}>Shown as added until cutting and overlaps are built.</span>}
        </>
      )}

      {pending && (
        <Frame flow="horizontal" gap={6} w="fill" justify="end">
          <button type="button" title="Put back what changed (Esc)" style={{ ...segmentStyle(false), flex: 'none', padding: '4px 10px' }} onClick={() => onDone(false)}>
            Cancel
          </button>
          <button type="button" title="Keep it, as one undo step (Enter)" style={{ ...segmentStyle(true), flex: 'none', padding: '4px 14px' }} onClick={() => onDone(true)}>
            OK
          </button>
        </Frame>
      )}
    </Section>
  )
}
