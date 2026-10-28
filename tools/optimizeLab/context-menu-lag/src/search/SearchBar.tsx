import { useState } from 'react'
import type { Item } from '../board/items'
import { searchItems } from './searchIndex'

export function SearchBar({ items }: { items: Item[] }) {
  const [q, setQ] = useState('')
  const hits = q ? searchItems(items, q).slice(0, 5) : []
  return (
    <div>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" />
      {hits.map((h) => (
        <div key={h.id}>{h.label}</div>
      ))}
    </div>
  )
}
