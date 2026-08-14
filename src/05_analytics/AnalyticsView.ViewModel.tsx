import { useMemo, useState } from 'react'
import { useFilteredList } from '../utils/useFilteredList'
import type { SearchSortId } from '../app/UIKit/Search/iSearch'

interface AnalyticsItem {
  id: string
  label: string
  /** Creation time (ms epoch) — backs the search's "Recently modified" sort once a data source exists. */
  createdAt?: number
}

// No analytics data source exists yet — this stays an empty list until one
// does. The search/list scaffolding is wired up ahead of time so real items
// slot in without further UI changes.
const ITEMS: AnalyticsItem[] = []

export function useAnalyticsViewModel() {
  const [query, setQuery] = useState('')
  // Shares the same sort control as every other left-rail search (see
  // SEARCH_SORT_OPTIONS); a no-op while ITEMS is empty, but keeps the control
  // consistent and ready for real data.
  const [sortOrder, setSortOrder] = useState<SearchSortId>('name')
  const filteredItems = useFilteredList(ITEMS, query, (i) => i.label)
  const sortedItems = useMemo(
    () =>
      [...filteredItems].sort((a, b) =>
        sortOrder === 'name' ? a.label.localeCompare(b.label) : (b.createdAt ?? 0) - (a.createdAt ?? 0),
      ),
    [filteredItems, sortOrder],
  )

  return { query, setQuery, sortOrder, setSortOrder, filteredItems: sortedItems }
}
