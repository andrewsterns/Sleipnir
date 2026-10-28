import type { Item } from '../board/items'

export function searchItems(items: Item[], q: string): Item[] {
  const needle = q.toLowerCase()
  return items.filter((i) => i.label.toLowerCase().includes(needle))
}
