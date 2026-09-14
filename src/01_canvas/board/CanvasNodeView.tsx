// Renders one canvas node, recursively.
//
// Draws with model/toCss.ts — the SAME derivation emit/react.ts writes into the
// generated file. That is what makes WYSIWYG exact by construction rather than
// approximated: there is one style function, so the board and the emitted code
// cannot drift apart. (Stage 1 rendered via UIKit's <Frame>; that was dropped
// once emitting became real, because emitting <Frame> would force the user's own
// project to depend on Sleipnir's UIKit — see toCss.ts's header.)

import { memo } from 'react'
import { mergeCss, positionCss, textCss, toCss } from '../model/toCss'
import { resolveVariant } from '../model/variants'
import {
  childrenOf,
  isExternalNode,
  isFrameNode,
  isInstanceNode,
  isTextNode,
  type CanvasComponent,
  type CanvasNode,
  type CanvasStyle,
  type NodeId,
} from '../model/types'

export interface CanvasNodeViewProps {
  node: CanvasNode
  /** The parent's flow — decides whether this node's rect.x/y is authoritative. */
  parentFlow: CanvasStyle['flow']
  selectedIds: Set<NodeId>
  components: CanvasComponent[]
  /** Suppresses self-positioning for a component's own root inside an instance. */
  asRoot?: boolean
  /** Guards against a cyclic instance graph blowing the stack. */
  depth?: number
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
  selectedIds,
  components,
  asRoot = false,
  depth = 0,
}: CanvasNodeViewProps) {
  if (node.hidden) return null

  // A component root inside an instance is placed by the instance wrapper, so it
  // must not position itself — mirroring emit/react.ts's isRoot rule exactly.
  const position = asRoot
    ? { width: '100%', height: '100%' }
    : positionCss(node.rect, parentFlow, node.style)
  const style = mergeCss(toCss(node.style), position)

  const common = {
    style,
    'data-canvas-node': node.id,
    'data-selected': selectedIds.has(node.id) ? 'true' : undefined,
  }

  if (isTextNode(node)) {
    return (
      <div {...common} style={mergeCss(style, textCss(node.font), { overflow: 'hidden' })}>
        <span style={{ width: '100%', pointerEvents: 'none', whiteSpace: 'pre-wrap' }}>{node.text}</span>
      </div>
    )
  }

  if (isExternalNode(node)) {
    // The pixel is a placeholder; the EMITTED CODE IS REAL (a true import plus a
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
          selectedIds={selectedIds}
          components={components}
          asRoot
          depth={depth + 1}
        />
      </div>
    )
  }

  if (isFrameNode(node)) {
    const flow = node.style.flow ?? 'freeform'
    return (
      <div {...common}>
        {childrenOf(node).map((child) => (
          <CanvasNodeView
            key={child.id}
            node={child}
            parentFlow={flow}
            selectedIds={selectedIds}
            components={components}
            depth={depth}
          />
        ))}
      </div>
    )
  }

  return null
})
