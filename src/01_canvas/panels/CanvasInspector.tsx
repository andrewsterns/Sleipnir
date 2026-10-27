// The properties panel for the current selection: geometry, layout, paint, and
// (for a frame) the emit-target dropdown.

import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { Frame } from '../../app/UIKit/Frame/Frame'
import { Icon } from '../../app/UIKit/Icon/Icon'
import { CANVAS_TARGETS } from '../emit/targets'
import { effectsOf, type ImageUrlResolver } from '../model/paint'
import type {
  CanvasComponent,
  CanvasNode,
  CanvasPropValue,
  CanvasRect,
  CanvasStyle,
  CanvasTextStyle,
  CanvasVariant,
  Flow,
  CanvasVectorNode,
  CornerRadius,
  Effect,
  Fill,
  NodeId,
  StrokeStyle,
} from '../model/types'
import { ACTION, FIELD, ICON_BUTTON, Label, MONO, NumberField, Section } from './inspectorKit'
import type { PointType } from '../model/vectorEdit'

/** The selected anchors while editing a path (see CanvasView.ViewModel's pointSelection). */
export interface PointSelection {
  count: number
  type: PointType | 'mixed'
  /** Shared corner radius, or null when the selected anchors differ. */
  radius: number | null
}
import { EffectsSection, FillsSection, type ImageSources } from './PaintSections'
import { ColorField } from './ColorPicker'
import { LinkedComponentSection } from './LinkedComponentSection'
import type { LinkedComponent } from '../hooks/useLinkedComponents'
import { variantValuesOf } from '../model/clipboard'
import { normalizeDegrees } from '../model/rotation'
import { ArrangeSection, LayoutSection, SpacingSection, type ArrangeProps } from './LayoutSection'
import { imageFillOf, isImageLayer, rectAtImageRatio, rectAtScale, scalePercent } from '../model/imageSizing'
import { resolveVariant } from '../model/variants'

/** Shared, so an unfilled node doesn't hand the memoized fill section a new array every render. */
const NO_FILLS: Fill[] = []

/** Basename of a forward-slashed path — '' when the path ends in a separator. */
function fileNameOf(path: string): string {
  return path.includes('/') ? path.slice(path.lastIndexOf('/') + 1) : path
}

export interface CanvasInspectorProps {
  node: CanvasNode | null
  selectionCount: number
  /** The parent's flow — decides whether X/Y are authoritative for this node. */
  parentFlow: Flow | undefined
  /** Set when the selection is a piece on an along-path frame (see CanvasView.ViewModel's selectionPathPiece). */
  pathPiece?: { isCopy: boolean; templateName: string; runLength: number } | null
  /** Align / distribute / group for the selection — the ARRANGE section. */
  arrange: ArrangeProps
  /** Set when the selection is an instance, i.e. a component is in play. */
  component: CanvasComponent | null
  activeVariant: CanvasVariant | null
  canPromote: boolean
  onRename: (id: NodeId, name: string) => void
  onRectChange: (patch: Partial<CanvasRect>, gesture?: string) => void
  /** `gesture` names the control behind the edit, so a run of edits from one control is one undo step. */
  onStyleChange: (patch: Partial<CanvasStyle>, gesture?: string) => void
  onTextChange: (id: NodeId, text: string) => void
  /** Restyles a component's variant root — the main component every instance renders — or, with `nodeId`, one node inside it. */
  onComponentStyleChange: (componentId: string, variantId: string, patch: Partial<CanvasStyle>, gesture?: string, nodeId?: NodeId) => void
  /** Changes a vector's own shape fields — a polygon's sides, a path's closed flag. */
  onVectorChange: (id: NodeId, patch: Partial<Pick<CanvasVectorNode, 'sides' | 'closed'>>, gesture?: string) => void
  /** The vector whose points are being edited, if any. */
  editingVectorId: NodeId | null
  /** The selected anchors of the path being edited, summarized — null when none are selected. */
  pointSelection: PointSelection | null
  onPointType: (type: PointType) => void
  onPointRadius: (radius: number, gesture?: string) => void
  onEditPoints: (id: NodeId) => void
  onDoneEditing: () => void
  /** Whether the selection is vector art MAKE SVG COMPONENT can promote. */
  canMakeSvgComponent: boolean
  onMakeSvgComponent: () => void
  /** Typography for a text node — size, weight, and its color (a text node's fill, in Figma's terms). */
  onFontChange: (id: NodeId, patch: Partial<CanvasTextStyle>, gesture?: string) => void
  /** Loads workspace images for the fill swatches — the board's own resolver. */
  imageUrl: ImageUrlResolver
  /** How the image fill editor lists and imports images. */
  images: ImageSources
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
  /** Set when the selection links to a component on another board (see model/clipboard.ts). */
  linked: LinkedComponent | null
  onLinkedPropChange: (id: NodeId, name: string, value: CanvasPropValue | undefined) => void
  onOpenMainComponent: (filePath: string) => void
  onDetachLinked: () => void
}

/**
 * Paint that belongs to a component on another board: shown for reference,
 * edited over there. `disabled` on a fieldset disables every control inside.
 */
function ReadOnly({ when, children }: { when: boolean; children: React.ReactNode }) {
  if (!when) return <>{children}</>
  return (
    <fieldset disabled style={{ border: 0, margin: 0, padding: 0, minWidth: 0, opacity: 0.55, pointerEvents: 'none' }}>
      {children}
    </fieldset>
  )
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
          title="Delete this component's file from the workspace. The design stays on the canvas — a component still in .canvas turns back into a frame."
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
  pathPiece,
  arrange,
  component,
  activeVariant,
  canPromote,
  onRename,
  onRectChange,
  onStyleChange,
  onTextChange,
  onFontChange,
  onComponentStyleChange,
  onVectorChange,
  editingVectorId,
  pointSelection,
  onPointType,
  onPointRadius,
  onEditPoints,
  onDoneEditing,
  canMakeSvgComponent,
  onMakeSvgComponent,
  imageUrl,
  images,
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
  linked,
  onLinkedPropChange,
  onOpenMainComponent,
  onDetachLinked,
}: CanvasInspectorProps) {
  // The paint sections are memoized, so they get callbacks that never change:
  // they read whatever is being painted right now through this ref. The
  // inspector's own props change on every doc change — every frame of a drag.
  const paintRef = useRef<{ onChange: (patch: Partial<CanvasStyle>, gesture?: string) => void } | null>(null)
  const paintChange = useCallback((patch: Partial<CanvasStyle>, gesture?: string) => paintRef.current?.onChange(patch, gesture), [])
  const fillsChange = useCallback((fills: Fill[], gesture?: string) => paintChange({ fills }, gesture), [paintChange])
  // Writing `effects` retires a legacy single `shadow` for good.
  const effectsChange = useCallback(
    (effects: Effect[], gesture?: string) => paintChange({ effects, shadow: undefined }, gesture),
    [paintChange],
  )

  if (!node) {
    return (
      <Frame flow="vertical" grow>
        {/* Several layers: arranging them is the one thing to do. */}
        <ArrangeSection {...arrange} />
        <Frame flow="vertical" align="center" justify="center" padding={16} gap={10} grow>
        <span style={{ ...MONO, fontSize: 10, color: 'var(--text-3)' }}>
          {selectionCount > 1 ? `${selectionCount} selected` : 'Nothing selected'}
        </span>
        {canMakeSvgComponent && <MakeSvgButton onClick={onMakeSvgComponent} />}
        </Frame>
      </Frame>
    )
  }

  // Under an auto-layout parent the layout owns position, exactly as in Figma —
  // so X/Y are shown but disabled rather than hidden, which explains itself.
  const positionOwnedByLayout = (!!parentFlow && parentFlow !== 'freeform') || !!pathPiece
  const style = node.style

  // Whose paint the paint sections edit. A frame or text node paints itself.
  // An instance's own style never reaches its call site in the emitted code
  // (`<Card />` carries props, not styles), so painting it would draw on the
  // board and vanish from the file — the instance edits the main component it
  // renders instead: its active variant's root.
  //
  // An SVG component made from one vector is that vector — its wrapper is
  // only the svg's canvas — so its paint is the vector's own.
  const loneVector =
    component?.format === 'svg' && activeVariant?.root.children.length === 1 && activeVariant.root.children[0].kind === 'vector'
      ? (activeVariant.root.children[0] as CanvasVectorNode)
      : null
  const paint: {
    style: CanvasStyle
    /** Whether it has fills and a stroke — a frame or a vector; text has neither. */
    hasPaint: boolean
    isFrame: boolean
    isText: boolean
    /** Set when the paint lands on a vector, which draws as SVG and paints by its rules. */
    vector: CanvasVectorNode | null
    mainComponent: boolean
    /** A linked component's paint — it lives on another board, so it's shown but not edited here. */
    readOnly?: boolean
    key: string
    onChange: (patch: Partial<CanvasStyle>, gesture?: string) => void
  } | null =
    node.kind === 'frame' || node.kind === 'text' || node.kind === 'vector'
      ? {
          style,
          hasPaint: node.kind !== 'text',
          isFrame: node.kind === 'frame',
          isText: node.kind === 'text',
          vector: node.kind === 'vector' ? node : null,
          mainComponent: false,
          key: node.id,
          onChange: onStyleChange,
        }
      : node.kind === 'instance' && component && activeVariant
        ? {
            style: loneVector ? loneVector.style : activeVariant.root.style,
            hasPaint: true,
            isFrame: !loneVector,
            isText: false,
            vector: loneVector,
            mainComponent: true,
            key: loneVector ? loneVector.id : activeVariant.id,
            onChange: (patch, gesture) => onComponentStyleChange(component.id, activeVariant.id, patch, gesture, loneVector?.id),
          }
        : node.kind === 'external' && linked
          ? (() => {
              const root = resolveVariant(linked.component, variantValuesOf(linked.component, node.propValues)).root
              return {
                style: root.style,
                hasPaint: true,
                isFrame: true,
                isText: false,
                vector: null,
                mainComponent: false,
                readOnly: true,
                key: `linked-${root.id}`,
                onChange: () => {},
              }
            })()
          : null
  paintRef.current = paint

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
        {canMakeSvgComponent && <MakeSvgButton onClick={onMakeSvgComponent} />}
      </Section>

      {node.kind === 'external' && linked && (
        <LinkedComponentSection
          node={node}
          link={linked}
          onPropChange={(name, value) => onLinkedPropChange(node.id, name, value)}
          onOpenMain={() => onOpenMainComponent(node.filePath)}
          onDetach={onDetachLinked}
        />
      )}

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

      <ArrangeSection {...arrange} />

      <Section title="POSITION & SIZE">
        <Frame flow="horizontal" gap={6} w="fill">
          <NumberField label="X" value={node.rect.x} disabled={positionOwnedByLayout} onChange={(x) => onRectChange({ x }, 'x')} />
          <NumberField label="Y" value={node.rect.y} disabled={positionOwnedByLayout} onChange={(y) => onRectChange({ y }, 'y')} />
        </Frame>
        <Frame flow="horizontal" gap={6} w="fill">
          <NumberField label="W" value={node.rect.w} onChange={(w) => onRectChange({ w }, 'w')} />
          <NumberField label="H" value={node.rect.h} onChange={(h) => onRectChange({ h }, 'h')} />
        </Frame>
        {/* Rotation, about the layer's own center (model/rotation.ts). Typing
            any angle normalizes it to (-180, 180]; the buttons turn 90°. */}
        <Frame flow="horizontal" gap={6} w="fill" align="end">
          <NumberField
            label="ROTATION"
            value={node.style.rotate ?? 0}
            suffix="°"
            onChange={(deg) => onStyleChange({ rotate: normalizeDegrees(deg) || undefined }, 'rotate')}
          />
          <button
            title="Rotate 90° counter-clockwise"
            style={{ ...ACTION, width: 'auto', flexShrink: 0 }}
            onClick={() => onStyleChange({ rotate: normalizeDegrees((node.style.rotate ?? 0) - 90) || undefined })}
          >
            ⟲ 90°
          </button>
          <button
            title="Rotate 90° clockwise"
            style={{ ...ACTION, width: 'auto', flexShrink: 0 }}
            onClick={() => onStyleChange({ rotate: normalizeDegrees((node.style.rotate ?? 0) + 90) || undefined })}
          >
            ⟳ 90°
          </button>
        </Frame>
        {pathPiece ? (
          <span style={{ ...MONO, fontSize: 9, color: 'var(--text-3)', lineHeight: 1.5 }}>
            {pathPiece.isCopy
              ? `One of ${pathPiece.runLength} “${pathPiece.templateName}” pieces. Its place on the path and its rotation are its own — drag it along the curve to reorder; any other edit changes every piece.`
              : 'Placed by the path — drag it along the curve to reorder. Rotation adds to the path’s own turn.'}
          </span>
        ) : positionOwnedByLayout && (
          <span style={{ ...MONO, fontSize: 9, color: 'var(--text-3)' }}>
            Position is set by the parent's {parentFlow} layout.
          </span>
        )}
      </Section>

      {isImageLayer(node) && (
        <ImageSizeSection key={node.id} node={node} imageUrl={imageUrl} onRectChange={onRectChange} />
      )}

      {node.kind === 'text' && (
        <Section title="TEXT">
          <textarea
            value={node.text}
            onChange={(e) => onTextChange(node.id, e.target.value)}
            rows={3}
            style={{ ...FIELD, resize: 'vertical' }}
          />
          <Frame flow="horizontal" gap={6} w="fill">
            <NumberField
              label="SIZE"
              value={node.font?.size ?? 14}
              min={1}
              onChange={(size) => onFontChange(node.id, { size }, 'font:size')}
            />
            <Frame flow="vertical" gap={2} grow style={{ minWidth: 0 }}>
              <Label>WEIGHT</Label>
              <select
                value={node.font?.weight ?? 400}
                onChange={(e) => onFontChange(node.id, { weight: Number(e.target.value) })}
                style={FIELD}
              >
                {[100, 200, 300, 400, 500, 600, 700, 800, 900].map((w) => (
                  <option key={w} value={w}>
                    {w}
                  </option>
                ))}
              </select>
            </Frame>
          </Frame>
          <Label>COLOR</Label>
          <ColorField
            color={node.font?.color ?? 'text-1'}
            gesture="font"
            onColor={(color, g) => onFontChange(node.id, { color }, g)}
          />
        </Section>
      )}

      {paint?.mainComponent && (
        <Frame padding={{ top: 8, bottom: 0, left: 10, right: 10 }} w="fill">
          <span style={{ ...MONO, fontSize: 9, color: 'var(--text-3)', lineHeight: 1.5, display: 'block' }}>
            Paint below edits the main component{activeVariant && component && component.variants.length > 1 ? ` (${activeVariant.name})` : ''} — every
            instance updates. Update component writes it to the file.
          </span>
        </Frame>
      )}

      {node.kind === 'vector' && (
        <VectorSection
          node={node}
          onVectorChange={onVectorChange}
          pointSelection={editingVectorId === node.id ? pointSelection : null}
          onPointType={onPointType}
          onPointRadius={onPointRadius}
          editingPoints={editingVectorId === node.id}
          onEditPoints={onEditPoints}
          onDoneEditing={onDoneEditing}
        />
      )}

      {paint?.readOnly && linked && (
        <Frame padding={{ top: 8, bottom: 0, left: 10, right: 10 }} w="fill">
          <span style={{ ...MONO, fontSize: 9, color: 'var(--text-3)', lineHeight: 1.5, display: 'block' }}>
            The main component’s paint, for reference — edit it on “{linked.ownerName}”, or DETACH to edit a local copy.
          </span>
        </Frame>
      )}

      <ReadOnly when={!!paint?.readOnly}>
        {paint && <LayerSection style={paint.style} isFrame={paint.isFrame} onStyleChange={paintChange} />}
      </ReadOnly>

      {node.kind === 'frame' && <LayoutSection node={node} onStyleChange={onStyleChange} />}
      <SpacingSection node={node} parentFlow={parentFlow} onStyleChange={onStyleChange} />

      <ReadOnly when={!!paint?.readOnly}>
      {paint?.hasPaint && (
        <>
          {/* Keyed by what is being painted, so a half-open fill editor
              doesn't follow the selection onto something else. */}
          <FillsSection
            key={paint.key}
            fills={paint.style.fills ?? NO_FILLS}
            imageUrl={imageUrl}
            images={images}
            svg={!!paint.vector}
            onChange={fillsChange}
          />
          <StrokeSection style={paint.style} vectorShape={paint.vector?.shape} onStyleChange={paintChange} />
        </>
      )}

      {paint && (
        <EffectsSection
          effects={effectsOf(paint.style)}
          text={paint.isText}
          svg={!!paint.vector}
          onChange={effectsChange}
        />
      )}
      </ReadOnly>

      {node.kind === 'frame' && (
        <>
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

/** Layer opacity, plus clip content for a frame — Figma's layer row. */
const LayerSection = memo(function LayerSection({
  style,
  isFrame,
  onStyleChange,
}: {
  style: CanvasStyle
  isFrame: boolean
  onStyleChange: (patch: Partial<CanvasStyle>, gesture?: string) => void
}) {
  return (
    <Section title="LAYER">
      <Frame flow="horizontal" gap={6} align="end" w="fill">
        <NumberField
          label="OPACITY"
          value={Math.round((style.opacity ?? 1) * 100)}
          min={0}
          max={100}
          suffix="%"
          onChange={(n) => onStyleChange({ opacity: n >= 100 ? undefined : n / 100 }, 'layer:opacity')}
        />
        {isFrame && (
          <label
            style={{
              ...MONO,
              fontSize: 9,
              color: 'var(--text-2)',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              paddingBottom: 5,
              flexShrink: 0,
            }}
          >
            <input type="checkbox" checked={!!style.clip} onChange={(e) => onStyleChange({ clip: e.target.checked || undefined })} />
            CLIP CONTENT
          </label>
        )}
      </Frame>
    </Section>
  )
})

const CORNERS: { key: keyof CornerRadius; label: string; title: string }[] = [
  { key: 'tl', label: '↖', title: 'Top-left' },
  { key: 'tr', label: '↗', title: 'Top-right' },
  { key: 'bl', label: '↙', title: 'Bottom-left' },
  { key: 'br', label: '↘', title: 'Bottom-right' },
]

/**
 * Corner radius, Figma-style: one value for all four corners, or — with the
 * corners toggle — each its own. Splitting copies the uniform value to every
 * corner; joining keeps the largest, so nothing visibly jumps.
 */
function RadiusFields({
  radius,
  onStyleChange,
}: {
  radius: CanvasStyle['radius']
  onStyleChange: (patch: Partial<CanvasStyle>, gesture?: string) => void
}) {
  const split = typeof radius === 'object'
  const values = split ? [radius.tl ?? 0, radius.tr ?? 0, radius.br ?? 0, radius.bl ?? 0] : [radius ?? 0]
  const uniform = values.every((v) => v === values[0])
  return (
    <Frame flow="horizontal" gap={4} align="end" grow style={{ minWidth: 0 }}>
      <NumberField
        label="RADIUS"
        // Split corners that differ have no single value to show.
        value={uniform ? values[0] : undefined}
        min={0}
        onChange={(r) => onStyleChange({ radius: r }, 'radius')}
      />
      <button
        type="button"
        title={split ? 'One radius for all corners' : 'A radius for each corner'}
        aria-pressed={split}
        onClick={() =>
          onStyleChange({
            radius: split ? Math.max(...values) : { tl: values[0], tr: values[0], br: values[0], bl: values[0] },
          })
        }
        style={{ ...ICON_BUTTON, width: 22, height: 24, border: `1px solid ${split ? 'var(--border-1)' : 'transparent'}`, background: split ? 'var(--bg-2)' : 'transparent' }}
      >
        ⛶
      </button>
    </Frame>
  )
}

/** The four corners, each its own radius — laid out like the corners they are. */
function CornerFields({
  radius,
  onStyleChange,
}: {
  radius: CornerRadius
  onStyleChange: (patch: Partial<CanvasStyle>, gesture?: string) => void
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, width: '100%' }}>
      {CORNERS.map((c) => (
        <div key={c.key} title={c.title}>
          <NumberField
            label={c.label}
            value={radius[c.key] ?? 0}
            min={0}
            onChange={(r) => onStyleChange({ radius: { ...radius, [c.key]: r } }, `radius:${c.key}`)}
          />
        </div>
      ))}
    </div>
  )
}

/** Stroke and corner radius. A stroke is paint, never layout (see toCss.ts). */
const StrokeSection = memo(function StrokeSection({
  style,
  vectorShape,
  onStyleChange,
}: {
  style: CanvasStyle
  /** Set for a vector: only a rectangle has corners to round, and SVG strokes are always centered. */
  vectorShape?: CanvasVectorNode['shape']
  onStyleChange: (patch: Partial<CanvasStyle>, gesture?: string) => void
}) {
  const vector = vectorShape !== undefined
  const hasRadius = !vector || vectorShape === 'rectangle'
  const stroke: StrokeStyle = style.stroke ?? { color: 'border-1', width: 0 }
  const setStroke = (patch: Partial<StrokeStyle>, gesture?: string) =>
    onStyleChange({ stroke: { ...stroke, ...patch } }, gesture)

  return (
    <Section title={hasRadius ? 'STROKE & RADIUS' : 'STROKE'}>
      {hasRadius && <RadiusFields radius={style.radius} onStyleChange={onStyleChange} />}
      {hasRadius && typeof style.radius === 'object' && <CornerFields radius={style.radius} onStyleChange={onStyleChange} />}
      {/* One row, like a fill: the color, then its weight. */}
      <ColorField color={stroke.color} gesture="stroke" title="Stroke" onColor={(color, g) => setStroke({ color }, g)}>
        <div style={{ width: 52, flexShrink: 0 }} title="Stroke weight">
          <NumberField value={stroke.width} min={0} suffix="px" onChange={(width) => setStroke({ width }, 'stroke:width')} />
        </div>
      </ColorField>
      {stroke.width > 0 && (
        <>
          <Frame flow="horizontal" gap={6} w="fill">
            {!vector && (
              <select
                value={stroke.position ?? 'inside'}
                onChange={(e) => setStroke({ position: e.target.value as StrokeStyle['position'] })}
                style={FIELD}
              >
                <option value="inside">Inside</option>
                <option value="center">Center</option>
                <option value="outside">Outside</option>
              </select>
            )}
            <select
              value={stroke.style ?? 'solid'}
              onChange={(e) => setStroke({ style: e.target.value as StrokeStyle['style'] })}
              style={FIELD}
            >
              <option value="solid">Solid</option>
              <option value="dashed">Dashed</option>
              <option value="dotted">Dotted</option>
            </select>
          </Frame>
        </>
      )}
    </Section>
  )
})

function MakeSvgButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Turn these vectors into a component whose file is one <svg> of paths, not divs"
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
      <Icon name="vector" size={11} />
      MAKE SVG COMPONENT
    </button>
  )
}

/** A vector's own geometry: a polygon's side count, a path's closed flag. */
function VectorSection({
  node,
  onVectorChange,
  editingPoints,
  onEditPoints,
  onDoneEditing,
  pointSelection,
  onPointType,
  onPointRadius,
}: {
  node: CanvasVectorNode
  onVectorChange: (id: NodeId, patch: Partial<Pick<CanvasVectorNode, 'sides' | 'closed'>>, gesture?: string) => void
  editingPoints: boolean
  onEditPoints: (id: NodeId) => void
  onDoneEditing: () => void
  pointSelection: PointSelection | null
  onPointType: (type: PointType) => void
  onPointRadius: (radius: number, gesture?: string) => void
}) {
  const label = { rectangle: 'RECTANGLE', ellipse: 'ELLIPSE', polygon: 'POLYGON', path: 'PATH' }[node.shape]
  return (
    <Section title={label}>
      {editingPoints ? (
        <>
          {pointSelection ? (
            <PointControls selection={pointSelection} onPointType={onPointType} onPointRadius={onPointRadius} />
          ) : (
            <span style={{ ...MONO, fontSize: 9, color: 'var(--text-3)', lineHeight: 1.6, display: 'block' }}>
              Select an anchor to set its type and corner radius · Ctrl+click the outline to add a point · Ctrl+click an
              anchor: sharp ↔ smooth · click a handle and Delete to make that side sharp
            </span>
          )}
          <button type="button" onClick={onDoneEditing} style={{ ...ACTION, color: 'var(--text-1)' }}>
            DONE (ENTER)
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => onEditPoints(node.id)}
          title={node.shape === 'path' ? 'Edit this path point by point (or double-click it)' : 'Turn this shape into a path and edit its points (or double-click it)'}
          style={ACTION}
        >
          EDIT POINTS
        </button>
      )}
      {node.shape === 'polygon' && (
        <NumberField
          label="SIDES"
          value={node.sides ?? 3}
          min={3}
          max={12}
          onChange={(sides) => onVectorChange(node.id, { sides: Math.round(sides) }, 'vector:sides')}
        />
      )}
      {node.shape === 'path' && (
        <Frame flow="horizontal" align="center" justify="between" w="fill">
          <Label>{`${node.points?.length ?? 0} POINTS`}</Label>
          <label style={{ ...MONO, fontSize: 9, color: 'var(--text-2)', display: 'flex', alignItems: 'center', gap: 4 }}>
            <input type="checkbox" checked={!!node.closed} onChange={(e) => onVectorChange(node.id, { closed: e.target.checked })} />
            CLOSED
          </label>
        </Frame>
      )}
    </Section>
  )
}

/**
 * The selected anchors' type and corner radius. Sharp/Smooth is a toggle
 * across the whole selection (Ctrl+click on an anchor does the same for one).
 * A corner radius rounds a sharp anchor between straight segments; on a smooth
 * one it waits, applying again if the anchor is made sharp.
 */
function PointControls({
  selection,
  onPointType,
  onPointRadius,
}: {
  selection: PointSelection
  onPointType: (type: PointType) => void
  onPointRadius: (radius: number, gesture?: string) => void
}) {
  const segment = (type: PointType, label: string, title: string) => {
    const active = selection.type === type
    return (
      <button
        type="button"
        title={title}
        aria-pressed={active}
        onClick={() => onPointType(type)}
        style={{
          ...ACTION,
          flex: 1,
          color: active ? 'var(--text-1)' : 'var(--text-2)',
          background: active ? 'var(--bg-3)' : 'var(--bg-2)',
        }}
      >
        {label}
      </button>
    )
  }
  return (
    <Frame flow="vertical" gap={6} w="fill">
      <Label>{selection.count === 1 ? 'POINT' : `${selection.count} POINTS`}</Label>
      <Frame flow="horizontal" gap={4} w="fill">
        {segment('sharp', 'SHARP', 'A corner: no handles (Ctrl+click an anchor to toggle)')}
        {segment('smooth', 'SMOOTH', 'A curve passes through it, with handles (Ctrl+click an anchor to toggle)')}
      </Frame>
      <NumberField
        label="CORNER RADIUS"
        value={selection.radius ?? undefined}
        min={0}
        disabled={selection.type === 'smooth'}
        onChange={(r) => onPointRadius(r, 'radius')}
      />
      {selection.type === 'smooth' && (
        <span style={{ ...MONO, fontSize: 9, color: 'var(--text-3)', lineHeight: 1.5 }}>
          A corner radius rounds sharp points — make it sharp first.
        </span>
      )}
    </Frame>
  )
}

/**
 * Sizing for an image layer (model/imageSizing.ts): its scale against the
 * picture's own size, a reset to 100%, and a fix for a stretched image. The
 * picture's size comes from the fill (recorded at import) or, for an image
 * added before that, is measured by loading it — kept in view state only, so
 * merely selecting an old image never edits the board.
 */
function ImageSizeSection({
  node,
  imageUrl,
  onRectChange,
}: {
  node: CanvasNode
  imageUrl: ImageUrlResolver
  onRectChange: (patch: Partial<CanvasRect>, gesture?: string) => void
}) {
  const fill = imageFillOf(node)
  const [measured, setMeasured] = useState<{ w: number; h: number } | null>(null)
  const url = fill && !fill.natural ? imageUrl(fill.src) : undefined
  useEffect(() => {
    if (!url) return
    let alive = true
    const img = new Image()
    img.onload = () => alive && img.naturalWidth > 0 && setMeasured({ w: img.naturalWidth, h: img.naturalHeight })
    img.src = url
    return () => {
      alive = false
    }
  }, [url])
  const natural = fill?.natural ?? measured ?? undefined
  const percent = scalePercent(node.rect, natural)
  const ratioOff = natural ? Math.abs(node.rect.w / node.rect.h - natural.w / natural.h) > 0.01 : false
  return (
    <Section title="IMAGE">
      <Frame flow="horizontal" gap={6} w="fill" align="end">
        <NumberField
          label="SCALE"
          value={percent ?? undefined}
          suffix="%"
          min={1}
          disabled={!natural}
          onChange={(pct) => natural && onRectChange(rectAtScale(node.rect, natural, pct), 'scale')}
        />
        <button
          style={{ ...ACTION, width: 'auto', flexShrink: 0, opacity: natural ? 1 : 0.4 }}
          disabled={!natural}
          title={natural ? `Back to the picture's own ${natural.w}×${natural.h}` : 'Measuring the picture…'}
          onClick={() => natural && onRectChange(rectAtScale(node.rect, natural, 100))}
        >
          RESET 100%
        </button>
      </Frame>
      {natural && ratioOff && (
        <button style={ACTION} onClick={() => onRectChange(rectAtImageRatio(node.rect, natural))}>
          FIX STRETCHED RATIO
        </button>
      )}
      <span style={{ ...MONO, fontSize: 9, color: 'var(--text-3)', lineHeight: 1.5 }}>
        {natural ? `Picture is ${natural.w}×${natural.h}. ` : ''}Resizing keeps its proportions — hold Shift to stretch.
      </span>
    </Section>
  )
}
