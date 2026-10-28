export interface Item {
  id: string
  label: string
  tags: string[]
}

export function makeItems(n: number): Item[] {
  return Array.from({ length: n }, (_, i) => ({ id: `item-${i}`, label: `Item ${i}`, tags: [`group-${i % 40}`, `kind-${i % 7}`] }))
}
