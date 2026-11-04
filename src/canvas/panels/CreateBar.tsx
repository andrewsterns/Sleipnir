// The left panel's one way to add to the scene (src/canvas/LAYOUT.md): a new
// sketch on a plane. Everything that draws or shapes lives in the toolbox;
// this only puts a new sketch in the list, on Front, Top or Side, or on a
// face picked in 3D.

import { useRef, useState } from 'react'
import { ContextMenu, type ContextMenuItem } from '../../app/UIKit/ContextMenu/ContextMenu'
import type { DefaultPlane, PlaneRef } from '../../document/objects'

const UI_FONT: React.CSSProperties = { fontFamily: 'var(--font-ui)' }

const PLANES: { plane: DefaultPlane; label: string }[] = [
  { plane: 'front', label: 'Front plane' },
  { plane: 'top', label: 'Top plane' },
  { plane: 'side', label: 'Side plane' },
]

export interface CreateBarProps {
  onSketch: (plane: PlaneRef) => void
  /** Starts picking a face in 3D; absent when the board has no objects to pick from. */
  onPickFace?: () => void
}

export function CreateBar({ onSketch, onPickFace }: CreateBarProps) {
  const button = useRef<HTMLButtonElement>(null)
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const [hover, setHover] = useState(false)
  const items: ContextMenuItem[] = [
    ...PLANES.map(({ plane, label }) => ({ label, onSelect: () => onSketch({ kind: 'default', plane }) })),
    { label: onPickFace ? 'On a face…' : 'On a face… (make an object first)', separator: true, disabled: !onPickFace, onSelect: () => onPickFace?.() },
  ]
  return (
    <div style={{ padding: '6px 6px 2px', flexShrink: 0 }}>
      <button
        ref={button}
        type="button"
        data-canvas-create-sketch=""
        title="Add a sketch on a plane or a face"
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onClick={() => {
          const r = button.current?.getBoundingClientRect()
          if (r) setMenu({ x: r.left, y: r.bottom + 4 })
        }}
        style={{
          ...UI_FONT,
          fontSize: 12,
          width: '100%',
          height: 28,
          textAlign: 'left',
          padding: '0 8px',
          color: 'var(--text-1)',
          background: hover || menu ? 'rgba(var(--item-ink, 255,255,255), 0.08)' : 'transparent',
          border: 'none',
          borderRadius: 'var(--radius-control)',
          cursor: 'pointer',
        }}
      >
        + Sketch
      </button>
      {menu && <ContextMenu x={menu.x} y={menu.y} anchorEl={button.current} items={items} onClose={() => setMenu(null)} />}
    </div>
  )
}
