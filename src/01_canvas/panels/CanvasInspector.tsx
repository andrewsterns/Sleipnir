// The properties panel for the current selection: geometry, layout, paint, and
// (for a frame) the emit-target dropdown.

import { useState } from 'react'
import { Frame } from '../../app/UIKit/Frame/Frame'
import { Icon } from '../../app/UIKit/Icon/Icon'
import { CANVAS_TARGETS } from '../emit/targets'
import type {
  CanvasComponent,
  CanvasNode,
  CanvasRect,
  CanvasStyle,
  CanvasVariant,
  Flow,
  NodeId,
} from '../model/types'

const MONO: React.CSSProperties = { fontFamily: 'var(--font-mono)' }

const FIELD: React.CSSProperties = {
  ...MONO,
  background: 'var(--bg-2)',
  border: '1px solid var(--border-1)',
  borderRadius: 'var(--radius-control)',
  color: 'var(--text-1)',
  fontSize: 10,
  padding: '4px 6px',
  outline: 'none',
  width: '100%',
  minWidth: 0,
}

// Shared look for the stacked, full-width buttons at the bottom of the
// component section. Call sites layer their own color/opacity/cursor on top for
// the enabled-vs-disabled and destructive cases.
const ACTION: React.CSSProperties = {
  ...MONO,
  fontSize: 9,
  letterSpacing: '0.08em',
  textAlign: 'center',
  width: '100%',
  background: 'var(--bg-2)',
  border: '1px solid var(--border-1)',
  borderRadius: 'var(--radius-control)',
  color: 'var(--text-2)',
  padding: '5px 8px',
  cursor: 'pointer',
}

/** Basename of a forward-slashed path — '' when the path ends in a separator. */
function fileNameOf(path: string): string {
  return path.includes('/') ? path.slice(path.lastIndexOf('/') + 1) : path
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ ...MONO, fontSize: 9, color: 'var(--text-3)', letterSpacing: '0.08em' }}>{children}</span>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Frame flow="vertical" gap={6} w="fill" padding={{ top: 10, bottom: 10, left: 10, right: 10 }}
      stroke={{ bottom: { color: 'border-1' } }}>
      <Label>{title}</Label>
      {children}
    </Frame>
  )
}

function NumberField({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string
  value: number | undefined
  onChange: (n: number) => void
  disabled?: boolean
}) {
  return (
    <Frame flow="vertical" gap={2} grow style={{ minWidth: 0 }}>
      <Label>{label}</Label>
      <input
        type="number"
        disabled={disabled}
        value={value ?? ''}
        onChange={(e) => {
          const n = Number(e.target.value)
          if (!Number.isNaN(n)) onChange(n)
        }}
        style={{ ...FIELD, opacity: disabled ? 0.4 : 1 }}
      />
    </Frame>
  )
}

export interface CanvasInspectorProps {
  node: CanvasNode | null
  selectionCount: number
  /** The parent's flow — decides whether X/Y are authoritative for this node. */
  parentFlow: Flow | undefined
  /** Set when the selection is an instance, i.e. a component is in play. */
  component: CanvasComponent | null
  activeVariant: CanvasVariant | null
  canPromote: boolean
  onRename: (id: NodeId, name: string) => void
  onRectChange: (patch: Partial<CanvasRect>) => void
  onStyleChange: (patch: Partial<CanvasStyle>) => void
  onTextChange: (id: NodeId, text: string) => void
  onPromote: () => void
  onWriteComponent: (componentId: string) => void
  /** True when the canvas state has changed since the component's file was last written. */
  isDirty: boolean
  onPush: (componentId: string) => void
  onAddVariant: (name: string) => void
  onRemoveVariant: (variantId: string) => void
  onRenameVariant: (variantId: string, name: string) => void
  onSelectVariant: (variantId: string) => void
  /** Workspace-relative folders the WORKSPACE PATH field can autocomplete to. */
  folderOptions: string[]
  /** Retargets where the component's file lives — a real file move once it has one. Must reject (not throw synchronously) so the panel can show the reason inline. */
  onSetPath: (componentId: string, path: string) => Promise<void>
  /** Deletes the component's file, leaving the design on the board. */
  onRemoveFromWorkspace: (componentId: string) => void
  /** Dissolves the component back into a plain frame. Offered only when `canFlatten`. */
  onFlatten: (componentId: string) => void
  /** Whether flattening is meaningful — exactly one instance to dissolve into. */
  canFlatten: boolean
}

/** Create-component / variant controls. Only the component half of the panel. */
function ComponentSection({
  component,
  activeVariant,
  onWriteComponent,
  isDirty,
  onPush,
  onAddVariant,
  onRemoveVariant,
  onRenameVariant,
  onSelectVariant,
  folderOptions,
  onSetPath,
  onRemoveFromWorkspace,
  onFlatten,
  canFlatten,
}: {
  component: CanvasComponent
  activeVariant: CanvasVariant | null
  onWriteComponent: (componentId: string) => void
  isDirty: boolean
  onPush: (componentId: string) => void
  onAddVariant: (name: string) => void
  onRemoveVariant: (variantId: string) => void
  onRenameVariant: (variantId: string, name: string) => void
  onSelectVariant: (variantId: string) => void
  folderOptions: string[]
  onSetPath: (componentId: string, path: string) => Promise<void>
  onRemoveFromWorkspace: (componentId: string) => void
  onFlatten: (componentId: string) => void
  canFlatten: boolean
}) {
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  // The path field is a draft until committed, so a half-typed path never
  // triggers a file move on every keystroke.
  const [pathDraft, setPathDraft] = useState(component.filePath ?? '')
  const [pathError, setPathError] = useState<string | null>(null)

  // Re-seed when the selection changes to a different component.
  const [seededFor, setSeededFor] = useState(component.id)
  if (seededFor !== component.id) {
    setSeededFor(component.id)
    setPathDraft(component.filePath ?? '')
    setPathError(null)
  }

  const submit = () => {
    if (!name.trim()) return
    onAddVariant(name)
    setName('')
    setAdding(false)
  }

  const pathChanged = pathDraft.trim() !== (component.filePath ?? '')

  const folderMatches = (() => {
    const dir = pathDraft.includes('/') ? pathDraft.slice(0, pathDraft.lastIndexOf('/')) : pathDraft
    const query = dir.trim().toLowerCase()
    if (!query || !pathChanged) return []
    return folderOptions.filter((f) => f.toLowerCase().includes(query) && f !== dir).slice(0, 5)
  })()

  const commitPath = () => {
    const next = pathDraft.trim()
    if (!next || !pathChanged) return
    setPathError(null)
    onSetPath(component.id, next).catch((e: unknown) => {
      setPathError(e instanceof Error ? e.message : String(e))
    })
  }

  return (
    <Section title={`COMPONENT · ${component.sync.toUpperCase()}`}>
      {/* Shown for detached as well as ejected. Detached is the state a
          deleted or vanished file leaves behind, so gating the explanation on
          'ejected' alone meant the one case that most needs explaining said
          nothing at all. */}
      {(component.sync === 'ejected' || component.sync === 'detached') && component.ejectReason && (
        <span style={{ ...MONO, fontSize: 9, color: '#e07a7a', lineHeight: 1.5 }}>
          {component.ejectReason}
        </span>
      )}
      {/* "yet" is only true for a component that was never written. Saying it
          about one whose file was just deleted reads as though the delete
          didn't happen. */}
      {!component.filePath && !component.ejectReason && (
        <span style={{ ...MONO, fontSize: 9, color: 'var(--text-3)' }}>Not in the workspace yet</span>
      )}
      {component.filePath && !isDirty && (
        <span style={{ ...MONO, fontSize: 9, color: 'var(--text-3)' }}>Up to date</span>
      )}

      <Label>VARIANTS</Label>
      {component.variants.map((variant) => (
        <Frame key={variant.id} flow="horizontal" gap={4} align="center" w="fill">
          <button
            type="button"
            onClick={() => onSelectVariant(variant.id)}
            title="Show this variant"
            style={{
              ...MONO,
              fontSize: 9,
              width: 14,
              height: 14,
              background: variant.id === activeVariant?.id ? 'var(--accent, #6fa8dc)' : 'transparent',
              border: '1px solid var(--border-1)',
              borderRadius: 2,
              cursor: 'pointer',
              padding: 0,
              flexShrink: 0,
            }}
          />
          <input
            value={variant.name}
            onChange={(e) => onRenameVariant(variant.id, e.target.value)}
            style={{ ...FIELD, flex: 1 }}
          />
          {component.variants.length > 1 && (
            <button
              type="button"
              onClick={() => onRemoveVariant(variant.id)}
              title="Remove variant"
              style={{
                ...MONO,
                fontSize: 10,
                background: 'transparent',
                border: 'none',
                color: 'var(--text-3)',
                cursor: 'pointer',
                padding: '0 2px',
              }}
            >
              ×
            </button>
          )}
        </Frame>
      ))}

      {adding ? (
        <input
          autoFocus
          value={name}
          placeholder="variant name"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit()
            if (e.key === 'Escape') { setAdding(false); setName('') }
          }}
          onBlur={() => { if (!name) setAdding(false) }}
          style={FIELD}
        />
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          style={{
            ...MONO,
            fontSize: 9,
            background: 'var(--bg-2)',
            border: '1px solid var(--border-1)',
            borderRadius: 'var(--radius-control)',
            color: 'var(--text-2)',
            padding: '4px 8px',
            cursor: 'pointer',
          }}
        >
          + ADD VARIANT
        </button>
      )}

      {/* ── Where it lives ── */}
      <Label>WORKSPACE PATH</Label>
      <input
        value={pathDraft}
        placeholder={`${component.componentRoot}/…`}
        onChange={(e) => setPathDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commitPath()
          if (e.key === 'Escape') setPathDraft(component.filePath ?? '')
        }}
        style={FIELD}
      />
      {folderMatches.length > 0 && (
        <Frame flow="vertical" w="fill">
          {folderMatches.map((dir) => (
            <button
              key={dir}
              type="button"
              className="srow"
              onClick={() => setPathDraft(`${dir}/${fileNameOf(pathDraft) || 'component.tsx'}`)}
              style={{
                ...MONO,
                fontSize: 9,
                textAlign: 'left',
                padding: '3px 6px',
                background: 'transparent',
                border: 'none',
                color: 'var(--text-2)',
                cursor: 'pointer',
              }}
            >
              {dir}
            </button>
          ))}
        </Frame>
      )}
      {pathError && <span style={{ ...MONO, fontSize: 9, color: '#e07a7a' }}>{pathError}</span>}
      {pathChanged && !pathError && (
        <button
          type="button"
          onClick={commitPath}
          style={{ ...ACTION, color: 'var(--text-1)' }}
        >
          {component.filePath ? 'MOVE FILE' : 'SET PATH'}
        </button>
      )}

      {/* ── Actions ── */}
      <Frame flow="vertical" gap={4} w="fill" padding={{ top: 6 }}>
        {/* Naming used to happen in the dialog that gated promotion. Promotion
            no longer opens one, so this is where a component gets renamed or
            sent to a different path — which means it must stay enabled once
            the file exists, not grey out the moment it does. */}
        <button
          type="button"
          onClick={() => onWriteComponent(component.id)}
          title={
            component.filePath
              ? 'Rename this component, or write it to a different path'
              : 'Create this component as a real file'
          }
          style={{ ...ACTION, cursor: 'pointer' }}
        >
          {component.filePath ? 'RENAME / MOVE…' : 'PUSH TO WORKSPACE'}
        </button>
        <button
          type="button"
          disabled={!component.filePath || !isDirty}
          onClick={() => onPush(component.id)}
          title={
            !component.filePath
              ? 'Not in the workspace yet'
              : isDirty
                ? "Write the canvas's current state into the existing file"
                : 'Nothing to update — the file matches the canvas'
          }
          style={{
            ...ACTION,
            opacity: component.filePath && isDirty ? 1 : 0.4,
            cursor: component.filePath && isDirty ? 'pointer' : 'default',
          }}
        >
          {isDirty && component.filePath ? '● UPDATE COMPONENT' : 'UPDATE COMPONENT'}
        </button>
        {/* The deliberate half of the downgrade rule: removing the file
            un-promotes a component automatically only when nothing would be
            lost, so the case that WOULD lose something needs somewhere to say
            "yes, I meant it". Offered only with a single instance, which is
            the only case that has a single place to dissolve into. */}
        {canFlatten && (
          <button
            type="button"
            onClick={() => onFlatten(component.id)}
            title="Turn this back into a plain frame. Variants and props are discarded; the layout stays."
            style={{ ...ACTION, cursor: 'pointer' }}
          >
            FLATTEN TO FRAME
          </button>
        )}
        <button
          type="button"
          disabled={!component.filePath}
          onClick={() => onRemoveFromWorkspace(component.id)}
          title="Delete this component's file from the workspace. The design stays on the canvas."
          style={{
            ...ACTION,
            color: component.filePath ? '#e07a7a' : 'var(--text-3)',
            opacity: component.filePath ? 1 : 0.4,
            cursor: component.filePath ? 'pointer' : 'default',
          }}
        >
          REMOVE FROM WORKSPACE
        </button>
      </Frame>
    </Section>
  )
}

export function CanvasInspector({
  node,
  selectionCount,
  parentFlow,
  component,
  activeVariant,
  canPromote,
  onRename,
  onRectChange,
  onStyleChange,
  onTextChange,
  onPromote,
  onWriteComponent,
  isDirty,
  onPush,
  onAddVariant,
  onRemoveVariant,
  onRenameVariant,
  onSelectVariant,
  folderOptions,
  onSetPath,
  onRemoveFromWorkspace,
  onFlatten,
  canFlatten,
}: CanvasInspectorProps) {
  if (!node) {
    return (
      <Frame flow="vertical" align="center" justify="center" padding={16} grow>
        <span style={{ ...MONO, fontSize: 10, color: 'var(--text-3)' }}>
          {selectionCount > 1 ? `${selectionCount} selected` : 'Nothing selected'}
        </span>
      </Frame>
    )
  }

  // Under an auto-layout parent the layout owns position, exactly as in Figma —
  // so X/Y are shown but disabled rather than hidden, which explains itself.
  const positionOwnedByLayout = !!parentFlow && parentFlow !== 'freeform'
  const style = node.style

  return (
    <Frame flow="vertical" w="fill" style={{ overflowY: 'auto' }} grow>
      <Section title="NAME">
        <input
          value={node.name}
          onChange={(e) => onRename(node.id, e.target.value)}
          style={FIELD}
        />
        {canPromote && (
          <button
            type="button"
            onClick={onPromote}
            title="Turn this frame into a reusable component"
            style={{
              ...MONO,
              fontSize: 9,
              background: 'var(--bg-2)',
              border: '1px solid var(--border-1)',
              borderRadius: 'var(--radius-control)',
              color: 'var(--text-1)',
              padding: '5px 8px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 5,
            }}
          >
            <Icon name="component" size={11} />
            CREATE COMPONENT
          </button>
        )}
      </Section>

      {component && (
        <ComponentSection
          component={component}
          activeVariant={activeVariant}
          onWriteComponent={onWriteComponent}
          isDirty={isDirty}
          onPush={onPush}
          onAddVariant={onAddVariant}
          onRemoveVariant={onRemoveVariant}
          onRenameVariant={onRenameVariant}
          onSelectVariant={onSelectVariant}
          folderOptions={folderOptions}
          onSetPath={onSetPath}
          onRemoveFromWorkspace={onRemoveFromWorkspace}
          onFlatten={onFlatten}
          canFlatten={canFlatten}
        />
      )}

      <Section title="POSITION & SIZE">
        <Frame flow="horizontal" gap={6} w="fill">
          <NumberField label="X" value={node.rect.x} disabled={positionOwnedByLayout} onChange={(x) => onRectChange({ x })} />
          <NumberField label="Y" value={node.rect.y} disabled={positionOwnedByLayout} onChange={(y) => onRectChange({ y })} />
        </Frame>
        <Frame flow="horizontal" gap={6} w="fill">
          <NumberField label="W" value={node.rect.w} onChange={(w) => onRectChange({ w })} />
          <NumberField label="H" value={node.rect.h} onChange={(h) => onRectChange({ h })} />
        </Frame>
        {positionOwnedByLayout && (
          <span style={{ ...MONO, fontSize: 9, color: 'var(--text-3)' }}>
            Position is set by the parent's {parentFlow} layout.
          </span>
        )}
      </Section>

      {node.kind === 'text' && (
        <Section title="TEXT">
          <textarea
            value={node.text}
            onChange={(e) => onTextChange(node.id, e.target.value)}
            rows={3}
            style={{ ...FIELD, resize: 'vertical' }}
          />
        </Section>
      )}

      {node.kind === 'frame' && (
        <>
          <Section title="LAYOUT">
            <Frame flow="vertical" gap={2} w="fill">
              <Label>FLOW</Label>
              <select
                value={style.flow ?? 'freeform'}
                onChange={(e) => onStyleChange({ flow: e.target.value as Flow })}
                style={FIELD}
              >
                <option value="freeform">Freeform (absolute children)</option>
                <option value="vertical">Vertical stack</option>
                <option value="horizontal">Horizontal stack</option>
                <option value="grid">Grid</option>
              </select>
            </Frame>
            {style.flow && style.flow !== 'freeform' && (
              <Frame flow="horizontal" gap={6} w="fill">
                <NumberField label="GAP" value={style.gap ?? 0} onChange={(gap) => onStyleChange({ gap })} />
                <NumberField
                  label="PAD"
                  value={typeof style.padding === 'number' ? style.padding : 0}
                  onChange={(padding) => onStyleChange({ padding })}
                />
              </Frame>
            )}
          </Section>

          <Section title="APPEARANCE">
            <Frame flow="vertical" gap={2} w="fill">
              <Label>FILL</Label>
              <input
                value={style.fills?.[0]?.color ?? ''}
                placeholder="bg-2 or #101014"
                onChange={(e) => {
                  const color = e.target.value.trim()
                  onStyleChange({ fills: color ? [{ color }] : [] })
                }}
                style={FIELD}
              />
            </Frame>
            <Frame flow="horizontal" gap={6} w="fill">
              <NumberField
                label="RADIUS"
                value={typeof style.radius === 'number' ? style.radius : 0}
                onChange={(radius) => onStyleChange({ radius })}
              />
              <NumberField
                label="STROKE W"
                value={style.stroke?.width ?? 0}
                onChange={(width) =>
                  onStyleChange({ stroke: { color: style.stroke?.color ?? 'border-1', width } })
                }
              />
            </Frame>
          </Section>

          <Section title="TARGET">
            {/* The language dropdown. Unavailable targets stay listed and
                disabled with their reason, so "why can't I pick Rust?" is
                answered here rather than in a doc. */}
            <select
              defaultValue="react"
              style={FIELD}
              onChange={() => {
                /* Wiring the choice onto a ComponentDef lands with
                   promote-to-component in Stage 2; the control ships now so the
                   target set is visible and honest from the start. */
              }}
            >
              {CANVAS_TARGETS.map((target) => (
                <option key={target.id} value={target.id} disabled={!target.available}>
                  {target.available ? target.label : `${target.label} — ${target.unavailableReason ?? 'unavailable'}`}
                </option>
              ))}
            </select>
            <span style={{ ...MONO, fontSize: 9, color: 'var(--text-3)', lineHeight: 1.5 }}>
              A frame is language-agnostic. Each target lowers it into that
              language's own container — there is no shared &lt;Frame/&gt; runtime to install.
            </span>
          </Section>
        </>
      )}
    </Frame>
  )
}
