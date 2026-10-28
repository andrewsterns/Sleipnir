import type { Item } from '../board/items'
import { MenuItem } from './MenuItem'
import { buildMenuItems } from './menuItems'

export interface MenuState {
  x: number
  y: number
  targetId: string
}

export function ContextMenu({ state, items, onClose }: { state: MenuState; items: Item[]; onClose: () => void }) {
  // Rebuilt on every render, from ALL items, for one target.
  const entries = buildMenuItems(items, state.targetId)
  return (
    <div role="menu" style={{ position: 'fixed', left: state.x, top: state.y }}>
      {entries.map((e) => (
        <MenuItem key={e.id} label={e.label} onSelect={onClose} />
      ))}
    </div>
  )
}
