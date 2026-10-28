import type { Item } from '../board/items'
import type { MenuState } from './ContextMenu'
import { buildMenuItems } from './menuItems'

// The right-click handler. It warms the menu by building every entry
// synchronously before opening — work the menu itself repeats anyway.
export function useContextMenu(items: Item[], onMenu: (m: MenuState) => void) {
  return (e: { preventDefault(): void; clientX: number; clientY: number; target: unknown }) => {
    e.preventDefault()
    const el = e.target as { closest?(sel: string): { getAttribute(n: string): string | null } | null }
    const targetId = el.closest?.('[data-id]')?.getAttribute('data-id') ?? ''
    buildMenuItems(items, targetId)
    onMenu({ x: e.clientX, y: e.clientY, targetId })
  }
}
