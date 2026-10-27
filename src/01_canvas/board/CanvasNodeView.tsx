// Renders one canvas node, recursively.
//
// Draws with model/toCss.ts — the SAME derivation emit/react.ts writes into the
// generated file. That is what makes WYSIWYG exact by construction rather than
// approximated: there is one style function, so the board and the emitted code
// cannot drift apart. (Stage 1 rendered via UIKit's <Frame>; that was dropped
// once emitting became real, because emitting <Frame> would force the user's own
// project to depend on Sleipnir's UIKit — see toCss.ts's header.)

import { memo } from 'react'
import { paintOverlays, type ImageUrlResolver } from '../model/paint'
import { vectorSvg } from '../model/vector'
import { renderSvgEl } from './svgElements'
import { mergeCss, positionCss, textCss, toCss } from '../model/toCss'
import { resolveVariant } from '../model/variants'
import { normalizeRelPath } from '../model/paths'
import { variantValuesOf } from '../model/clipboard'
import type { LinkedComponents } from '../hooks/useLinkedComponents'
import {
  childrenOf,
  isExternalNode,
  isFrameNode,
  isInstanceNode,
  isTextNode,
  isVectorNode,
  type CanvasComponent,
  type CanvasNode,
  type CanvasStyle,
} from '../model/types'

export interface CanvasNodeViewProps {
  node: CanvasNode
  /** The parent's flow — decides whether this node's rect.x/y is authoritative. */
  parentFlow: CanvasStyle['flow']
  components: CanvasComponent[]
  /** Suppresses self-positioning for a component's own root inside an instance. */
  asRoot?: boolean
  /** Guards against a cyclic instance graph blowing the stack. */
  depth?: number
  /** Loads workspace image fills — see useWorkspaceImages. */
  imageUrl: ImageUrlResolver
  /** Canvas components external nodes point at — see useLinkedComponents. Absent renders every external as a placeholder. */
  linked?: LinkedComponents
}

const MAX_INSTANCE_DEPTH = 12

const PLACEHOLDER_LABEL: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 10,
  color: 'var(--text-2)',
  whiteSpace: 'nowrap',
  textOverflow: 'ellipsis',
  overflow: 'hidden',
  maxWidth: '100%',
}

function Placeholder({ label, sub }: { label: string; sub?: string }) {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
        padding: 6,
        pointerEvents: 'none',
        overflow: 'hidden',
      }}
    >
      <span style={PLACEHOLDER_LABEL}>{label}</span>
      {sub && <span style={{ ...PLACEHOLDER_LABEL, fontSize: 8, color: 'var(--text-3)' }}>{sub}</span>}
    </div>
  )
}

export const CanvasNodeView = memo(function CanvasNodeView({
  node,
  parentFlow,
  components,
  asRoot = false,
  depth = 0,
  imageUrl,
  linked,
}: CanvasNodeViewProps) {
  if (node.hidden) return null

  // A component root inside an instance is placed by the instance wrapper, so it
  // must not position itself — mirroring emit/react.ts's isRoot rule exactly.
  const position = asRoot
    ? { width: '100%', height: '100%' }
    : positionCss(node.rect, parentFlow, node.style)
  // A vector is drawn as SVG, the same element the emitter writes — never as a
  // styled box (see model/vector.ts).
  if (isVectorNode(node)) {
    return renderSvgEl(vectorSvg(node, node.id, imageUrl, position), undefined, {
      'data-canvas-node': node.id,
    })
  }
  const style = mergeCss(toCss(node.style, { imageUrl, text: isTextNode(node) }), position)
  // A fill stack one background can't express (a translucent image) is drawn
  // as layers behind the children — the same layers emit/react.ts writes.
  const paintLayers = paintOverlays(node.style.fills, imageUrl).map((css, i) => (
    <div key={`paint-${i}`} aria-hidden style={css} />
  ))

  const common = {
    style,
    'data-canvas-node': node.id,
  }

  if (isTextNode(node)) {
    return (
      <div {...common} style={mergeCss(style, textCss(node.font), { overflow: 'hidden' })}>
        {paintLayers}
        <span style={{ width: '100%', pointerEvents: 'none', whiteSpace: 'pre-wrap' }}>{node.text}</span>
      </div>
    )
  }

  if (isExternalNode(node)) {
    // A canvas component pasted in from another board (model/clipboard.ts):
    // drawn live from the board that owns it, the way an instance is.
    const link = linked?.get(normalizeRelPath(node.filePath))
    if (link && depth < MAX_INSTANCE_DEPTH) {
      return (
        <div {...common}>
          <CanvasNodeView
            node={resolveVariant(link.component, variantValuesOf(link.component, node.propValues)).root}
            parentFlow="freeform"
            components={link.components}
            asRoot
            depth={depth + 1}
            imageUrl={imageUrl}
            linked={linked}
          />
        </div>
      )
    }
    // Any other workspace component: the pixel is a placeholder; the EMITTED CODE IS REAL (a true import plus a
    // true call site). Live-rendering a foreign project's component needs a
    // transform pipeline, its own dependency graph and a sandbox — a later stage,
    // not a v1 gap.
    return (
      <div
        {...common}
        style={mergeCss(style, {
          border: '1px dashed var(--border-1)',
          background: 'var(--bg-1)',
          position: (style.position as string) ?? 'relative',
        })}
      >
        <Placeholder label={`<${node.exportName} />`} sub={node.filePath} />
      </div>
    )
  }

  if (isInstanceNode(node)) {
    const component = components.find((c) => c.id === node.componentId)
    if (!component) {
      return (
        <div {...common} style={mergeCss(style, { border: '1px dashed #e07a7a', position: 'relative' })}>
          <Placeholder label="Missing component" sub={node.componentId} />
        </div>
      )
    }
    if (depth >= MAX_INSTANCE_DEPTH) {
      return (
        <div {...common} style={mergeCss(style, { border: '1px dashed #e0a040', position: 'relative' })}>
          <Placeholder label="Instance nesting too deep" />
        </div>
      )
    }
    // An instance holds no copy of the component's tree — it renders the
    // resolved variant's root, which is why editing the main component (or
    // switching a variant) updates every instance for free.
    const variant = resolveVariant(component, node.variantValues)
    return (
      <div {...common}>
        <CanvasNodeView
          node={variant.root}
          parentFlow="freeform"
          components={components}
          asRoot
          depth={depth + 1}
          imageUrl={imageUrl}
          linked={linked}
        />
      </div>
    )
  }

  if (isFrameNode(node)) {
    const flow = node.style.flow ?? 'freeform'
    return (
      <div {...common}>
        {paintLayers}
        {childrenOf(node).map((child) => (
          <CanvasNodeView
            key={child.id}
            node={child}
            parentFlow={flow}
              components={components}
            depth={depth}
            imageUrl={imageUrl}
            linked={linked}
          />
        ))}
      </div>
    )
  }

  return null
})
