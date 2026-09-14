// The name chip that floats above a component instance on the board — Figma's
// component label, plus the variant dropdown and trigger the user asked for.
//
// Rendered in the board's SCREEN-space chrome layer, not inside the transformed
// viewport, so it stays a constant size at any zoom (a label that shrinks to
// nothing at 20% is useless) and so its dropdown is never clipped by a frame's
// clipContent.

import { useEffect, useRef, useState } from 'react'
import { Icon } from '../../app/UIKit/Icon/Icon'
import type { CanvasComponent, CanvasVariant } from '../model/types'

const MONO: React.CSSProperties = { fontFamily: 'var(--font-mono)' }

const SYNC_TITLE: Record<CanvasComponent['sync'], string> = {
  live: 'Live — changes sync both ways',
  paused: 'Paused — neither side is pushing',
  ejected: 'Ejected — the file has code the canvas cannot represent',
  detached: 'Detached — not linked to a file',
}

export interface ComponentLabelProps {
  component: CanvasComponent
  /** Which variant this label's instance is showing. */
  activeVariant: CanvasVariant
  /** Screen-space position of the instance's top-left corner. */
  x: number
  y: number
  selected: boolean
  onSelectVariant: (variantId: string) => void
  /** Steps to the next variant without opening the menu — the quick preview trigger. */
  onTriggerNext: () => void
  onOpenComponent: () => void
}

export function ComponentLabel({
  component,
  activeVariant,
  x,
  y,
  selected,
  onSelectVariant,
  onTriggerNext,
  onOpenComponent,
}: ComponentLabelProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Close on any outside pointerdown. Capture phase, because the board stops
  // propagation on its own handlers and would otherwise swallow the event.
  useEffect(() => {
    if (!open) return
    const close = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('pointerdown', close, true)
    return () => window.removeEventListener('pointerdown', close, true)
  }, [open])

  const hasVariants = component.variants.length > 1

  return (
    <div
      ref={ref}
      onPointerDown={(e) => e.stopPropagation()}
      style={{
        position: 'absolute',
        left: x,
        // Sits just above the instance; 18px clears the label's own height.
        top: y - 18,
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        pointerEvents: 'auto',
        whiteSpace: 'nowrap',
      }}
    >
      <button
        type="button"
        onClick={onOpenComponent}
        title={`${component.name} — ${SYNC_TITLE[component.sync]}`}
        style={{
          ...MONO,
          fontSize: 9,
          lineHeight: 1,
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '3px 5px',
          background: 'transparent',
          border: 'none',
          color: selected ? 'var(--accent, #6fa8dc)' : 'var(--text-2)',
          cursor: 'pointer',
        }}
      >
        <Icon name="component" size={11} />
        {component.name}
      </button>

      {hasVariants && (
        <>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            title="Switch variant"
            style={{
              ...MONO,
              fontSize: 9,
              lineHeight: 1,
              padding: '3px 5px',
              background: 'var(--bg-2)',
              border: '1px solid var(--border-1)',
              borderRadius: 3,
              color: 'var(--text-2)',
              cursor: 'pointer',
            }}
          >
            {activeVariant.name} ▾
          </button>
          <button
            type="button"
            onClick={onTriggerNext}
            title="Preview next variant"
            style={{
              ...MONO,
              fontSize: 9,
              lineHeight: 1,
              width: 16,
              height: 16,
              display: 'grid',
              placeItems: 'center',
              background: 'var(--bg-2)',
              border: '1px solid var(--border-1)',
              borderRadius: 3,
              color: 'var(--text-2)',
              cursor: 'pointer',
              padding: 0,
            }}
          >
            ▶
          </button>
        </>
      )}

      {open && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            marginTop: 2,
            minWidth: 120,
            background: 'var(--bg-1)',
            border: '1px solid var(--border-1)',
            borderRadius: 4,
            boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
            zIndex: 3,
            overflow: 'hidden',
          }}
        >
          {component.variants.map((variant) => (
            <button
              key={variant.id}
              type="button"
              className="srow"
              onClick={() => {
                onSelectVariant(variant.id)
                setOpen(false)
              }}
              style={{
                ...MONO,
                fontSize: 10,
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '5px 8px',
                background: variant.id === activeVariant.id ? 'var(--bg-3)' : 'transparent',
                border: 'none',
                color: 'var(--text-1)',
                cursor: 'pointer',
              }}
            >
              {variant.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
