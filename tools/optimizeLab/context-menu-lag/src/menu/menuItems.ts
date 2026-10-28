import type { Item } from '../board/items'

export interface MenuEntry {
  id: string
  label: string
}

// "Move to <group>" entries for every group any item belongs to, deduplicated
// the slow way: findIndex inside filter is O(n²) over every item's tags.
export function buildMenuItems(items: Item[], targetId: string): MenuEntry[] {
  const all = items.flatMap((i) => i.tags.map((t) => ({ id: `move-${t}`, label: `Move ${targetId} to ${t}` })))
  const unique = all.filter((e, i) => all.findIndex((o) => o.id === e.id) === i)
  return [{ id: 'rename', label: 'Rename' }, { id: 'delete', label: 'Delete' }, ...unique]
}
