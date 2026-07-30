import { useMemo, useState } from 'react'
import { useFilteredList } from '../../../utils/useFilteredList'
import { PrototypeRailProps, PrototypeSelection } from './iPrototypeRail'

const FILTER_OPTIONS = [
  { id: 'curated', label: 'Curated' },
  { id: 'scaffolded', label: 'Scaffolded Files' },
]

interface Row {
  key: string
  kind: 'curated' | 'scaffolded'
  label: string
  sub: string
  selection: PrototypeSelection
}

export function usePrototypeRailViewModel({ curated, scaffolded }: PrototypeRailProps) {
  const [query, setQuery] = useState('')
  const [activeFilters, setActiveFilters] = useState<string[]>([])

  const rows = useMemo<Row[]>(() => {
    const curatedRows: Row[] = curated.map((p) => ({
      key: `curated:${p.id}`,
      kind: 'curated',
      label: p.title,
      sub: p.description,
      selection: { kind: 'curated', id: p.id },
    }))
    const scaffoldedRows: Row[] = scaffolded.map((n) => ({
      key: `scaffolded:${n.id}`,
      kind: 'scaffolded',
      label: n.label,
      sub: n.filePath ?? '',
      selection: { kind: 'scaffolded', node: n },
    }))
    return [...curatedRows, ...scaffoldedRows]
  }, [curated, scaffolded])

  const kindFiltered = useMemo(
    () => (activeFilters.length === 0 ? rows : rows.filter((r) => activeFilters.includes(r.kind))),
    [rows, activeFilters],
  )

  const filtered = useFilteredList(kindFiltered, query, (r) => `${r.label} ${r.sub}`)

  return {
    query,
    setQuery,
    activeFilters,
    setActiveFilters,
    filterOptions: FILTER_OPTIONS,
    rows: filtered,
  }
}
