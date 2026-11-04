// The properties panel's half for a LINKED component — one pasted in from
// another board (see io/clipboard.ts). It is Figma's library-instance
// model: this use carries its own variant choice and prop values, while the
// component itself (its layers and paint) is edited on the board that owns
// it. DETACH trades the link for a fully editable local copy.

import { Frame } from '../../app/UIKit/Frame/Frame'
import { Icon } from '../../app/UIKit/Icon/Icon'
import type { LinkedComponent } from '../hooks/useLinkedComponents'
import type { CanvasExternalNode, CanvasProp, CanvasPropValue } from '../../document/types'
import { ACTION, Label, UI_FONT, Section } from './inspectorKit'
import { SelectField, TextField } from '../../app/UIKit/Field/TextField'
import { Checkbox } from '../../app/UIKit/Checkbox/Checkbox'

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
      <label style={{ ...UI_FONT, fontSize: 11, color: 'var(--text-2)', display: 'flex', alignItems: 'center', gap: 6 }}>
        <Checkbox checked={Boolean(value ?? fallback)} onChange={(checked) => onChange(checked)} />
        {prop.name}
      </label>
    )
  }
  return (
    <Frame flow="vertical" gap={2} w="fill">
      <Label>{prop.name}</Label>
      {prop.type === 'enum' ? (
        <SelectField size="sm" value={String(value ?? fallback ?? prop.options?.[0] ?? '')} onChange={(e) => onChange(e.target.value)}>
          {(prop.options ?? []).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </SelectField>
      ) : (
        <TextField size="sm"
          type={prop.type === 'number' ? 'number' : 'text'}
          value={value === undefined || value === null ? '' : String(value)}
          placeholder={fallback === undefined || fallback === null ? 'default' : String(fallback)}
          onChange={(e) => {
            const raw = e.target.value
            if (raw === '') onChange(undefined)
            else onChange(prop.type === 'number' ? Number(raw) : raw)
          }}
         
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
    <Section title="Linked component">
      <Frame flow="horizontal" align="center" gap={6} w="fill">
        <span style={{ color: 'var(--text-2)', display: 'flex' }}>
          <Icon name="component" size={11} />
        </span>
        <span style={{ ...UI_FONT, fontSize: 11, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {component.name}
        </span>
      </Frame>
      <span style={{ ...UI_FONT, fontSize: 10, color: 'var(--text-3)', lineHeight: 1.5, wordBreak: 'break-all' }}>
        From board “{link.ownerName}” · {node.filePath}
      </span>

      {variantProps.length > 0
        ? variantProps.map((prop) => (
            <PropField key={prop.id} prop={prop} value={node.propValues?.[prop.name]} onChange={(v) => onPropChange(prop.name, v)} />
          ))
        : component.variants.length > 1 && (
            <span style={{ ...UI_FONT, fontSize: 10, color: 'var(--text-3)' }}>{component.variants.length} variants</span>
          )}
      {otherProps.map((prop) => (
        <PropField key={prop.id} prop={prop} value={node.propValues?.[prop.name]} onChange={(v) => onPropChange(prop.name, v)} />
      ))}

      <Frame flow="horizontal" gap={6} w="fill">
        <button type="button" onClick={onOpenMain} title={`Open “${link.ownerName}” and select the main component`} style={ACTION}>
          Edit main component
        </button>
        <button
          type="button"
          onClick={onDetach}
          title="Replace this link with an editable copy of the component's layers. It stops following the component."
          style={ACTION}
        >
          Detach
        </button>
      </Frame>
    </Section>
  )
}
