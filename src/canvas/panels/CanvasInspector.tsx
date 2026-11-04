// The properties panel for the current selection: geometry, layout, paint, and
// (for a frame) the emit-target dropdown.

import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { Frame } from '../../app/UIKit/Frame/Frame'
import { Icon } from '../../app/UIKit/Icon/Icon'
import { CANVAS_TARGETS } from '../emit/targets'
import { effectsOf, type ImageUrlResolver } from '../../document/paint'
import type {
  CanvasComponent,
  CanvasDoc,
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
} from '../../document/types'
import { ACTION, ICON_BUTTON, Label, UI_FONT, NumberField, Section } from './inspectorKit'
import type { PointType } from '../../document/vectorEdit'

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
import { variantValuesOf } from '../io/clipboard'
import { normalizeDegrees } from '../../document/rotation'
import { ArrangeSection, LayoutSection, SpacingSection, type ArrangeProps } from './LayoutSection'
import { imageFillOf, isImageLayer, rectAtImageRatio, rectAtScale, scalePercent } from '../../document/imageSizing'
import { resolveVariant } from '../../document/variants'
import { componentFileName, componentPathIn, resolveComponentPath } from '../../document/paths'
import { ComponentPathField } from './ComponentPathField'
import { IconButton } from '../../app/UIKit/IconButton/IconButton'
import { PlaneSection } from './PlaneSection'
import type { PlaneRef } from '../../document/objects'
import { SolidSection } from './SolidSection'
import type { Placement3D, SolidSpec } from '../../document/sceneTypes'
import { SelectField, TextField } from '../../app/UIKit/Field/TextField'
import { Checkbox } from '../../app/UIKit/Checkbox/Checkbox'

/** Shared, so an unfilled node doesn't hand the memoized fill section a new array every render. */
const NO_FILLS: Fill[] = []

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
  /** Renames the selected component — its file, exported symbol and instances follow. Rejects with a reason to show inline. */
  onRenameComponent: (componentId: string, name: string) => Promise<void>
  /** True when the canvas state has changed since the component's file was last written. */
  isDirty: boolean
  onPush: (componentId: string) => void
  onAddVariant: (name: string) => void
  onRemoveVariant: (variantId: string) => void
  onRenameVariant: (variantId: string, name: string) => void
  onSelectVariant: (variantId: string) => void
  /** Folders the board records under the component root (CanvasDoc.componentFolders) — offered by the FOLDER field alongside the real ones. */
  componentFolders: string[]
  /** Retargets where the component's file lives — a real file move once it has one. Must reject (not throw synchronously) so the panel can show the reason inline. */
  onSetPath: (componentId: string, path: string) => Promise<void>
  /** The open board's folder under the component root — where a component's file goes by default. */
  boardFolder: string | null
  /** Makes the selected instance a plain frame again: flattens the component when this is its only instance, detaches just this one otherwise. */
  onUnmakeComponent: () => void
  /** True when it's the component's only instance — the button then dissolves the component itself. */
  canFlatten: boolean
  /** Set when the selection links to a component on another board (see io/clipboard.ts). */
  linked: LinkedComponent | null
  onLinkedPropChange: (id: NodeId, name: string, value: CanvasPropValue | undefined) => void
  onOpenMainComponent: (filePath: string) => void
  onDetachLinked: () => void
  /**
   * The 3D sections: where a top-level layer's plane stands (3D PLANE) and
   * how its outline becomes a solid (SOLID). Absent hides both.
   */
  space3d?: {
    doc: CanvasDoc
    /** Only a top-level layer has a plane of its own; a child lies in its parent's. */
    topLevel: boolean
    /** Vector layers a sweep can follow — every one but the selection. */
    paths: { id: NodeId; name: string }[]
    onPlacement: (id: NodeId, space: Placement3D | undefined, gesture?: string) => void
    /** Stands the layer on a plane as a sketch (scene3d/planeRefs.ts). */
    onPlane: (id: NodeId, plane: PlaneRef, gesture?: string) => void
    onSolid: (id: NodeId, solid: SolidSpec | undefined, gesture?: string) => void
  }
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

/** The accent a component reads in — the canvas's selection blue. */
const COMPONENT_BLUE = '#6fa8dc'

/** "Variant 2", "Variant 3", … — the first name no variant has yet. */
function nextVariantName(component: CanvasComponent): string {
  const taken = new Set(component.variants.map((v) => v.name.toLowerCase()))
  let n = component.variants.length + 1
  while (taken.has(`variant ${n}`)) n += 1
  return `Variant ${n}`
}

/**
 * Component on/off, as one switch. Off (a frame): a quiet outline — click to
 * make it a component. On (an instance): filled in the component blue, and
 * hovering shows the struck-through mark, since a click turns it back into a
 * frame.
 */
function ComponentToggle({
  active,
  onMake,
  onUnmake,
  unmakeTitle,
}: {
  active: boolean
  onMake: () => void
  onUnmake: () => void
  unmakeTitle: string
}) {
  const [hover, setHover] = useState(false)
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={active ? onUnmake : onMake}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title={active ? unmakeTitle : 'Make component — turn this frame into a reusable component'}
      style={{
        ...ICON_BUTTON,
        width: 24,
        height: 24,
        color: active ? COMPONENT_BLUE : hover ? 'var(--text-1)' : 'var(--text-3)',
        background: active ? 'rgba(111,168,220,0.16)' : hover ? 'rgba(var(--item-ink, 255,255,255), 0.08)' : 'transparent',
        border: `1px solid ${active ? 'rgba(111,168,220,0.55)' : 'transparent'}`,
      }}
    >
      <Icon name={active && hover ? 'component-off' : 'component'} size={13} />
    </button>
  )
}

/**
 * A component's name. Renaming moves real files (the file, the exported
 * symbol), so it's a draft until Enter or leaving the field — never a file move
 * per keystroke. Escape puts it back.
 */
function ComponentNameField({
  component,
  onRename,
}: {
  component: CanvasComponent
  onRename: (componentId: string, name: string) => Promise<void>
}) {
  const [draft, setDraft] = useState(component.name)
  const [error, setError] = useState<string | null>(null)
  const [seen, setSeen] = useState(component.name)
  if (seen !== component.name) {
    setSeen(component.name)
    setDraft(component.name)
  }
  const commit = () => {
    const name = draft.trim()
    if (!name) {
      setDraft(component.name)
      return
    }
    if (name === component.name) return
    setError(null)
    onRename(component.id, name).catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  }
  return (
    <Frame flow="vertical" gap={3} grow style={{ minWidth: 0 }}>
      <TextField size="sm"
        value={draft}
        title="Component name — also its file and exported name"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          if (e.key === 'Escape') setDraft(component.name)
        }}
        style={{ flex: 1, color: COMPONENT_BLUE }}
      />
      {error && <span style={{ ...UI_FONT, fontSize: 10, color: '#e07a7a' }}>{error}</span>}
    </Frame>
  )
}

/**
 * Everything else about the selected component, in the same block as its
 * name: where its file lives, whether that file is current, its variants, and
 * the file actions.
 */
function ComponentDetails({
  component,
  componentFolders,
  activeVariant,
  isDirty,
  onSetPath,
  onPush,
  onRemoveVariant,
  onRenameVariant,
  onSelectVariant,
  boardFolder,
}: {
  component: CanvasComponent
  componentFolders: string[]
  activeVariant: CanvasVariant | null
  isDirty: boolean
  onSetPath: (componentId: string, path: string) => Promise<void>
  onPush: (componentId: string) => void
  onRemoveVariant: (variantId: string) => void
  onRenameVariant: (variantId: string, name: string) => void
  onSelectVariant: (variantId: string) => void
  boardFolder: string | null
}) {
  // With no file (deleted outside Sleipnir), the field starts at where its
  // name would put it, ready for WRITE TO WORKSPACE.
  const homePath = component.filePath ?? componentPathIn(component.componentRoot, component.name, '', boardFolder ?? undefined).path ?? ''
  // The path is a draft until committed, so a half-typed one never moves the file.
  const [path, setPath] = useState(homePath)
  const [pathError, setPathError] = useState<string | null>(null)
  const [seenPath, setSeenPath] = useState(homePath)
  if (seenPath !== homePath) {
    setSeenPath(homePath)
    setPath(homePath)
  }

  const commitPath = () => {
    const typed = path.trim()
    if (!typed || typed === component.filePath) return
    let safe: string
    try {
      safe = resolveComponentPath(component.componentRoot, typed)
    } catch (e) {
      setPathError(e instanceof Error ? e.message : String(e))
      return
    }
    setPathError(null)
    onSetPath(component.id, safe).catch((e: unknown) => setPathError(e instanceof Error ? e.message : String(e)))
  }

  // Whether the file is current is the sync icon's to say; this line is only
  // for what it can't — why a file went missing.
  const status =
    (component.sync === 'ejected' || component.sync === 'detached') && component.ejectReason
      ? { text: component.ejectReason, color: '#e07a7a' }
      : !component.filePath
        ? { text: 'Not in the workspace yet', color: 'var(--text-3)' }
        : null
  const canUpdate = !!component.filePath && isDirty

  return (
    <>
      <Frame flow="horizontal" gap={2} align="center" w="fill">
      <ComponentPathField
        componentRoot={component.componentRoot}
        value={path}
        onChange={(next) => {
          setPath(next)
          setPathError(null)
        }}
        onSubmit={commitPath}
        onCancel={() => setPath(homePath)}
        extraFolders={componentFolders}
        fallbackFileName={componentFileName(component.name)}
        submitOnBlur={!!component.filePath}
      />
        {component.filePath && (
          <button
            type="button"
            disabled={!canUpdate}
            onClick={() => onPush(component.id)}
            aria-label="Update component"
            title={canUpdate ? "Update component — write the canvas's current state into this file" : 'Up to date — the file matches the canvas'}
            style={{
              ...ICON_BUTTON,
              width: 24,
              height: 24,
              position: 'relative',
              color: canUpdate ? '#e0a040' : 'var(--text-3)',
              opacity: canUpdate ? 1 : 0.45,
              cursor: canUpdate ? 'pointer' : 'default',
              border: `1px solid ${canUpdate ? 'rgba(224,160,64,0.5)' : 'transparent'}`,
            }}
          >
            <Icon name="file-sync" size={13} />
            {canUpdate && (
              <span style={{ position: 'absolute', top: 2, right: 2, width: 5, height: 5, borderRadius: '50%', background: '#e0a040' }} />
            )}
          </button>
        )}
      </Frame>
      {pathError && <span style={{ ...UI_FONT, fontSize: 10, color: '#e07a7a' }}>{pathError}</span>}
      {status && <span style={{ ...UI_FONT, fontSize: 10, color: status.color, lineHeight: 1.5 }}>{status.text}</span>}

      {component.variants.length > 1 && <Label>Variants</Label>}
      {component.variants.length > 1 &&
        component.variants.map((variant) => (
          <Frame key={variant.id} flow="horizontal" gap={4} align="center" w="fill">
            <button
              type="button"
              onClick={() => onSelectVariant(variant.id)}
              title="Show this variant"
              style={{
                ...UI_FONT,
                fontSize: 10,
                width: 14,
                height: 14,
                background: variant.id === activeVariant?.id ? COMPONENT_BLUE : 'transparent',
                border: '1px solid var(--border-1)',
                borderRadius: 2,
                cursor: 'pointer',
                padding: 0,
                flexShrink: 0,
              }}
            />
            <TextField size="sm"
              value={variant.name}
              onChange={(e) => onRenameVariant(variant.id, e.target.value)}
              style={{ flex: 1 }}
            />
            <button
              type="button"
              onClick={() => onRemoveVariant(variant.id)}
              title="Remove variant"
              style={{ ...ICON_BUTTON, color: 'var(--text-3)' }}
            >
              ×
            </button>
          </Frame>
        ))}

      {!component.filePath && (
        <button type="button" onClick={commitPath} style={{ ...ACTION, color: 'var(--text-1)', cursor: 'pointer' }}>
          Write to workspace
        </button>
      )}
    </>
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
  onRenameComponent,
  isDirty,
  onPush,
  onAddVariant,
  onRemoveVariant,
  onRenameVariant,
  onSelectVariant,
  componentFolders,
  onSetPath,
  boardFolder,
  onUnmakeComponent,
  canFlatten,
  linked,
  onLinkedPropChange,
  onOpenMainComponent,
  onDetachLinked,
  space3d,
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
        <span style={{ ...UI_FONT, fontSize: 11, color: 'var(--text-3)' }}>
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
      <Section title={component ? 'Component' : 'Name'}>
        <Frame flow="horizontal" gap={2} align="center" w="fill">
          {component ? (
            <ComponentNameField key={component.id} component={component} onRename={onRenameComponent} />
          ) : (
            <TextField size="sm"
              value={node.name}
              onChange={(e) => onRename(node.id, e.target.value)}
              style={{ flex: 1 }}
            />
          )}
          {(canPromote || component) && (
            <ComponentToggle
              active={!!component}
              onMake={onPromote}
              onUnmake={onUnmakeComponent}
              unmakeTitle={
                canFlatten
                  ? 'Component · click to flatten back to a frame (its only instance, so variants and props are dropped)'
                  : 'Component · click to detach just this instance into a frame (the component and its other instances stay)'
              }
            />
          )}
          {component && (
            <IconButton
              icon="variant-add"
              iconSize={13}
              size={24}
              onClick={() => onAddVariant(nextVariantName(component))}
              title="Add variant"
              textColor="var(--text-2)"
              hoverFill="rgba(var(--item-ink, 255,255,255), 0.08)"
            />
          )}
        </Frame>
        {component && (
          <ComponentDetails
            key={component.id}
            component={component}
            componentFolders={componentFolders}
            activeVariant={activeVariant}
            isDirty={isDirty}
            onSetPath={onSetPath}
            onPush={onPush}
            onRemoveVariant={onRemoveVariant}
            onRenameVariant={onRenameVariant}
            onSelectVariant={onSelectVariant}
            boardFolder={boardFolder}
          />
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

      <ArrangeSection {...arrange} />

      <Section title="Position & size">
        <Frame flow="horizontal" gap={6} w="fill">
          <NumberField label="X" value={node.rect.x} disabled={positionOwnedByLayout} onChange={(x) => onRectChange({ x }, 'x')} />
          <NumberField label="Y" value={node.rect.y} disabled={positionOwnedByLayout} onChange={(y) => onRectChange({ y }, 'y')} />
        </Frame>
        <Frame flow="horizontal" gap={6} w="fill">
          <NumberField label="W" value={node.rect.w} onChange={(w) => onRectChange({ w }, 'w')} />
          <NumberField label="H" value={node.rect.h} onChange={(h) => onRectChange({ h }, 'h')} />
        </Frame>
        {/* Rotation, about the layer's own center (document/rotation.ts). Typing
            any angle normalizes it to (-180, 180]; the buttons turn 90°. */}
        <Frame flow="horizontal" gap={6} w="fill" align="end">
          <NumberField
            label="Rotation"
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
          <span style={{ ...UI_FONT, fontSize: 10, color: 'var(--text-3)', lineHeight: 1.5 }}>
            {pathPiece.isCopy
              ? `One of ${pathPiece.runLength} “${pathPiece.templateName}” pieces. Its place on the path and its rotation are its own — drag it along the curve to reorder; any other edit changes every piece.`
              : 'Placed by the path — drag it along the curve to reorder. Rotation adds to the path’s own turn.'}
          </span>
        ) : positionOwnedByLayout && (
          <span style={{ ...UI_FONT, fontSize: 10, color: 'var(--text-3)' }}>
            Position is set by the parent's {parentFlow} layout.
          </span>
        )}
      </Section>

      {isImageLayer(node) && (
        <ImageSizeSection key={node.id} node={node} imageUrl={imageUrl} onRectChange={onRectChange} />
      )}

      {node.kind === 'text' && (
        <Section title="Text">
          <span style={{ ...UI_FONT, fontSize: 10, color: 'var(--text-3)' }}>Double-click the text on the board to edit it.</span>
          <Frame flow="horizontal" gap={6} w="fill">
            <NumberField
              label="Size"
              value={node.font?.size ?? 14}
              min={1}
              onChange={(size) => onFontChange(node.id, { size }, 'font:size')}
            />
            <Frame flow="vertical" gap={2} grow style={{ minWidth: 0 }}>
              <Label>Weight</Label>
              <SelectField size="sm"
                value={node.font?.weight ?? 400}
                onChange={(e) => onFontChange(node.id, { weight: Number(e.target.value) })}
               
              >
                {[100, 200, 300, 400, 500, 600, 700, 800, 900].map((w) => (
                  <option key={w} value={w}>
                    {w}
                  </option>
                ))}
              </SelectField>
            </Frame>
          </Frame>
          <Label>Color</Label>
          <ColorField
            color={node.font?.color ?? 'text-1'}
            gesture="font"
            onColor={(color, g) => onFontChange(node.id, { color }, g)}
          />
        </Section>
      )}

      {paint?.mainComponent && (
        <Frame padding={{ top: 8, bottom: 0, left: 10, right: 10 }} w="fill">
          <span style={{ ...UI_FONT, fontSize: 10, color: 'var(--text-3)', lineHeight: 1.5, display: 'block' }}>
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
          <span style={{ ...UI_FONT, fontSize: 10, color: 'var(--text-3)', lineHeight: 1.5, display: 'block' }}>
            The main component’s paint, for reference — edit it on “{linked.ownerName}”, or DETACH to edit a local copy.
          </span>
        </Frame>
      )}

      <ReadOnly when={!!paint?.readOnly}>
        {paint && <LayerSection style={paint.style} isFrame={paint.isFrame} onStyleChange={paintChange} />}
      </ReadOnly>

      {node.kind === 'frame' && <LayoutSection node={node} onStyleChange={onStyleChange} />}
      <SpacingSection node={node} parentFlow={parentFlow} onStyleChange={onStyleChange} />

      {space3d?.topLevel && <PlaneSection node={node} doc={space3d.doc} onChange={space3d.onPlacement} onPlane={space3d.onPlane} />}
      {space3d && (node.kind === 'frame' || node.kind === 'vector') && (
        <SolidSection node={node} doc={space3d.doc} paths={space3d.paths.filter((p) => p.id !== node.id)} onChange={space3d.onSolid} />
      )}

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
          <Section title="Target">
            {/* The language dropdown. Unavailable targets stay listed and
                disabled with their reason, so "why can't I pick Rust?" is
                answered here rather than in a doc. */}
            <SelectField size="sm"
              defaultValue="react"
             
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
            </SelectField>
            <span style={{ ...UI_FONT, fontSize: 10, color: 'var(--text-3)', lineHeight: 1.5 }}>
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
    <Section title="Layer">
      <Frame flow="horizontal" gap={6} align="end" w="fill">
        <NumberField
          label="Opacity"
          value={Math.round((style.opacity ?? 1) * 100)}
          min={0}
          max={100}
          suffix="%"
          onChange={(n) => onStyleChange({ opacity: n >= 100 ? undefined : n / 100 }, 'layer:opacity')}
        />
        {isFrame && (
          <label
            style={{
              ...UI_FONT,
              fontSize: 10,
              color: 'var(--text-2)',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              paddingBottom: 5,
              flexShrink: 0,
            }}
          >
            <Checkbox checked={!!style.clip} onChange={(checked) => onStyleChange({ clip: checked || undefined })} />
            Clip content
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
        label="Radius"
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
    <Section title={hasRadius ? 'Stroke & radius' : 'Stroke'}>
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
              <SelectField size="sm"
                value={stroke.position ?? 'inside'}
                onChange={(e) => setStroke({ position: e.target.value as StrokeStyle['position'] })}
               
              >
                <option value="inside">Inside</option>
                <option value="center">Center</option>
                <option value="outside">Outside</option>
              </SelectField>
            )}
            <SelectField size="sm"
              value={stroke.style ?? 'solid'}
              onChange={(e) => setStroke({ style: e.target.value as StrokeStyle['style'] })}
             
            >
              <option value="solid">Solid</option>
              <option value="dashed">Dashed</option>
              <option value="dotted">Dotted</option>
            </SelectField>
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
        ...UI_FONT,
        fontSize: 10,
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
      Make SVG component
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
  const label = { rectangle: 'Rectangle', ellipse: 'Ellipse', polygon: 'Polygon', path: 'Path' }[node.shape]
  return (
    <Section title={label}>
      {editingPoints ? (
        <>
          {pointSelection ? (
            <PointControls selection={pointSelection} onPointType={onPointType} onPointRadius={onPointRadius} />
          ) : (
            <span style={{ ...UI_FONT, fontSize: 10, color: 'var(--text-3)', lineHeight: 1.6, display: 'block' }}>
              Select an anchor to set its type and corner radius · Ctrl+click the outline to add a point · Ctrl+click an
              anchor: sharp ↔ smooth · click a handle and Delete to make that side sharp
            </span>
          )}
          <button type="button" onClick={onDoneEditing} style={{ ...ACTION, color: 'var(--text-1)' }}>
            Done (enter)
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => onEditPoints(node.id)}
          title={node.shape === 'path' ? 'Edit this path point by point (or double-click it)' : 'Turn this shape into a path and edit its points (or double-click it)'}
          style={ACTION}
        >
          Edit points
        </button>
      )}
      {node.shape === 'polygon' && (
        <NumberField
          label="Sides"
          value={node.sides ?? 3}
          min={3}
          max={12}
          onChange={(sides) => onVectorChange(node.id, { sides: Math.round(sides) }, 'vector:sides')}
        />
      )}
      {node.shape === 'path' && (
        <Frame flow="horizontal" align="center" justify="between" w="fill">
          <Label>{`${node.points?.length ?? 0} points`}</Label>
          <label style={{ ...UI_FONT, fontSize: 10, color: 'var(--text-2)', display: 'flex', alignItems: 'center', gap: 4 }}>
            <Checkbox checked={!!node.closed} onChange={(checked) => onVectorChange(node.id, { closed: checked })} />
            Closed
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
      <Label>{selection.count === 1 ? 'Point' : `${selection.count} points`}</Label>
      <Frame flow="horizontal" gap={4} w="fill">
        {segment('sharp', 'Sharp', 'A corner: no handles (Ctrl+click an anchor to toggle)')}
        {segment('smooth', 'Smooth', 'A curve passes through it, with handles (Ctrl+click an anchor to toggle)')}
      </Frame>
      <NumberField
        label="Corner radius"
        value={selection.radius ?? undefined}
        min={0}
        disabled={selection.type === 'smooth'}
        onChange={(r) => onPointRadius(r, 'radius')}
      />
      {selection.type === 'smooth' && (
        <span style={{ ...UI_FONT, fontSize: 10, color: 'var(--text-3)', lineHeight: 1.5 }}>
          A corner radius rounds sharp points — make it sharp first.
        </span>
      )}
    </Frame>
  )
}

/**
 * Sizing for an image layer (document/imageSizing.ts): its scale against the
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
    <Section title="Image">
      <Frame flow="horizontal" gap={6} w="fill" align="end">
        <NumberField
          label="Scale"
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
          Reset 100%
        </button>
      </Frame>
      {natural && ratioOff && (
        <button style={ACTION} onClick={() => onRectChange(rectAtImageRatio(node.rect, natural))}>
          Fix stretched ratio
        </button>
      )}
      <span style={{ ...UI_FONT, fontSize: 10, color: 'var(--text-3)', lineHeight: 1.5 }}>
        {natural ? `Picture is ${natural.w}×${natural.h}. ` : ''}Resizing keeps its proportions — hold Shift to stretch.
      </span>
    </Section>
  )
}
