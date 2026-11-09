// The left panel's one way to add to the scene (src/canvas/LAYOUT.md): a new
// sketch on a plane. Everything that draws or shapes lives in the toolbox;
// this only puts a new sketch in the list, on Front, Top or Side, on a face
// picked in 3D, or placed from a Sketch document, linked.

import { useRef, useState } from 'react'
import { ContextMenu } from '../../app/UIKit/ContextMenu/ContextMenu'
import { sketchMenuItems, type CreateBarProps } from './sketchMenu'

export type { CreateBarProps } from './sketchMenu'

const UI_FONT: React.CSSProperties = { fontFamily: 'var(--font-ui)' }

export function CreateBar(props: CreateBarProps) {
  const button = useRef<HTMLButtonElement>(null)
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const [hover, setHover] = useState(false)
  const items = sketchMenuItems(props)
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
