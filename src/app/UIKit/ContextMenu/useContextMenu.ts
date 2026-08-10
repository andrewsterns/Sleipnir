import { useCallback, useState } from 'react'

// Open-state for a right-click / ⋯ menu anchored at a viewport point. `data`
// carries whatever the caller needs to build the menu items for the row that
// was clicked (a file node, a graph node, a git file, …).
export interface ContextMenuState<T> {
  x: number
  y: number
  anchorEl: HTMLElement
  data: T
}

// Centralizes the boilerplate every list surface would otherwise hand-roll for
// a right-click + hover-⋯ menu: both entry points resolve to the same {x, y,
// anchorEl, data} state, which the caller feeds straight into <ContextMenu>.
export function useContextMenu<T>() {
  const [menu, setMenu] = useState<ContextMenuState<T> | null>(null)
  const close = useCallback(() => setMenu(null), [])

  // Right-click a row: anchor exactly where the pointer landed.
  const openFromEvent = useCallback((e: React.MouseEvent, data: T) => {
    e.preventDefault()
    e.stopPropagation()
    setMenu({ x: e.clientX, y: e.clientY, anchorEl: e.currentTarget as HTMLElement, data })
  }, [])

  // Click the hover-revealed ⋯ button: anchor at the button's bottom-left so
  // the menu drops beneath it rather than under the cursor mid-row.
  const openFromButton = useCallback((e: React.MouseEvent, data: T) => {
    e.preventDefault()
    e.stopPropagation()
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setMenu({ x: rect.left, y: rect.bottom + 2, anchorEl: e.currentTarget as HTMLElement, data })
  }, [])

  return { menu, close, openFromEvent, openFromButton }
}
