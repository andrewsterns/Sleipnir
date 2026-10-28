import type { Item } from './items'
import type { MenuState } from '../menu/ContextMenu'

// Not memoized, and does real work on every render.
export function BoardItem({ item, menu }: { item: Item; menu: MenuState | null }) {
  const summary = item.tags
    .map((t) => t.toUpperCase())
    .sort()
    .join(' · ')
  const active = menu?.targetId === item.id
  return (
    <li data-id={item.id} style={{ outline: active ? '1px solid' : undefined }}>
      {item.label} <small>{summary}</small>
    </li>
  )
}
