// The properties panel's half for a LINKED component — one pasted in from
// another board (see model/clipboard.ts). It is Figma's library-instance
// model: this use carries its own variant choice and prop values, while the
// component itself (its layers and paint) is edited on the board that owns
// it. DETACH trades the link for a fully editable local copy.

import { Frame } from '../../app/UIKit/Frame/Frame'
import { Icon } from '../../app/UIKit/Icon/Icon'
import type { LinkedComponent } from '../hooks/useLinkedComponents'
import type { CanvasExternalNode, CanvasProp, CanvasPropValue } from '../model/types'
import { ACTION, FIELD, Label, MONO, Section } from './inspectorKit'

function PropField({
  prop,
  value,
  onChange,
}: {
  prop: CanvasProp
  value: CanvasPropValue | undefined
  onChange: (value: CanvasPropValue | undefined) => void
}) {
  const fallback = prop.defaultValue ?? undefined
  if (prop.type === 'boolean') {
    return (
      <label style={{ ...MONO, fontSize: 10, color: 'var(--text-2)', display: 'flex', alignItems: 'center', gap: 6 }}>
        <input type="checkbox" checked={Boolean(value ?? fallback)} onChange={(e) => onChange(e.target.checked)} />
        {prop.name}
      </label>
    )
  }
  return (
    <Frame flow="vertical" gap={2} w="fill">
      <Label>{prop.name.toUpperCase()}</Label>
      {prop.type === 'enum' ? (
        <select value={String(value ?? fallback ?? prop.options?.[0] ?? '')} onChange={(e) => onChange(e.target.value)} style={FIELD}>
          {(prop.options ?? []).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      ) : (
        <input
          type={prop.type === 'number' ? 'number' : 'text'}
          value={value === undefined || value === null ? '' : String(value)}
          placeholder={fallback === undefined || fallback === null ? 'default' : String(fallback)}
          onChange={(e) => {
            const raw = e.target.value
            if (raw === '') onChange(undefined)
            else onChange(prop.type === 'number' ? Number(raw) : raw)
          }}
          style={FIELD}
        />
      )}
    </Frame>
  )
}

export function LinkedComponentSection({
  node,
  link,
  onPropChange,
  onOpenMain,
  onDetach,
}: {
  node: CanvasExternalNode
  link: LinkedComponent
  onPropChange: (name: string, value: CanvasPropValue | undefined) => void
  onOpenMain: () => void
  onDetach: () => void
}) {
  const { component } = link
  const variantProps = component.props.filter((p) => component.variantPropIds.includes(p.id))
  const otherProps = component.props.filter((p) => !component.variantPropIds.includes(p.id))

  return (
    <Section title="LINKED COMPONENT">
      <Frame flow="horizontal" align="center" gap={6} w="fill">
        <span style={{ color: 'var(--text-2)', display: 'flex' }}>
          <Icon name="component" size={11} />
        </span>
        <span style={{ ...MONO, fontSize: 11, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {component.name}
        </span>
      </Frame>
      <span style={{ ...MONO, fontSize: 9, color: 'var(--text-3)', lineHeight: 1.5, wordBreak: 'break-all' }}>
        From board “{link.ownerName}” · {node.filePath}
      </span>

      {variantProps.length > 0
        ? variantProps.map((prop) => (
            <PropField key={prop.id} prop={prop} value={node.propValues?.[prop.name]} onChange={(v) => onPropChange(prop.name, v)} />
          ))
        : component.variants.length > 1 && (
            <span style={{ ...MONO, fontSize: 9, color: 'var(--text-3)' }}>{component.variants.length} variants</span>
          )}
      {otherProps.map((prop) => (
        <PropField key={prop.id} prop={prop} value={node.propValues?.[prop.name]} onChange={(v) => onPropChange(prop.name, v)} />
      ))}

      <Frame flow="horizontal" gap={6} w="fill">
        <button type="button" onClick={onOpenMain} title={`Open “${link.ownerName}” and select the main component`} style={ACTION}>
          EDIT MAIN COMPONENT
        </button>
        <button
          type="button"
          onClick={onDetach}
          title="Replace this link with an editable copy of the component's layers. It stops following the component."
          style={ACTION}
        >
          DETACH
        </button>
      </Frame>
    </Section>
  )
}
