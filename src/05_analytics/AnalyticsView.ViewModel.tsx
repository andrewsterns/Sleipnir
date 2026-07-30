import { useState } from 'react'
import { useFilteredList } from '../utils/useFilteredList'

interface AnalyticsItem {
  id: string
  label: string
}

// No analytics data source exists yet — this stays an empty list until one
// does. The search/list scaffolding is wired up ahead of time so real items
// slot in without further UI changes.
const ITEMS: AnalyticsItem[] = []

export function useAnalyticsViewModel() {
  const [query, setQuery] = useState('')
  const filteredItems = useFilteredList(ITEMS, query, (i) => i.label)

  return { query, setQuery, filteredItems }
}
