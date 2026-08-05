import { useEffect, useMemo, useState } from 'react'
import { installWidget, getWidgetCatalog } from './api/sleipnirApi'
import type { WidgetEntry, WidgetCatalogEntry } from './graph/types'

export interface WidgetStoreViewProps {
  installedWidgets: WidgetEntry[]
  onInstalled: (widget: WidgetEntry) => void
  /** Switches the main content pane to an already-installed widget — same navigation NavRail's onSelect uses. */
  onOpenWidget: (id: string) => void
}

export function useWidgetStoreViewModel({ installedWidgets, onInstalled, onOpenWidget }: WidgetStoreViewProps) {
  // Fetched at runtime, not statically imported — see WidgetCatalogEntry's
  // comment in graph/types.ts. `loaded` (not just an empty array) so an
  // actually-empty catalog and "hasn't arrived yet" render differently.
  const [catalog, setCatalog] = useState<WidgetCatalogEntry[]>([])
  const [loaded, setLoaded] = useState(false)
  const [query, setQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [installingId, setInstallingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getWidgetCatalog()
      .then(({ catalog }) => {
        setCatalog(catalog)
        setSelectedId((current) => current ?? catalog[0]?.id ?? null)
      })
      .catch(() => {})
      .finally(() => setLoaded(true))
  }, [])

  const categoryOptions = useMemo(
    () => Array.from(new Set(catalog.map((c) => c.category))).map((category) => ({ id: category, label: category })),
    [catalog],
  )

  const visibleCatalog = useMemo(() => {
    const q = query.trim().toLowerCase()
    return catalog.filter((c) => {
      const matchesQuery = !q || c.label.toLowerCase().includes(q) || c.description.toLowerCase().includes(q)
      const matchesCategory = categoryFilter.length === 0 || categoryFilter.includes(c.category)
      return matchesQuery && matchesCategory
    })
  }, [catalog, query, categoryFilter])

  const selected = catalog.find((c) => c.id === selectedId)
  const isInstalled = (catalogId: string) => installedWidgets.some((w) => w.id === catalogId)

  // Stays on the store after installing (mirrors VS Code's Extensions view —
  // the item flips to "Installed" in place; opening it is a separate,
  // explicit action) rather than auto-navigating away.
  const install = async (catalogId: string) => {
    const catalogEntry = catalog.find((c) => c.id === catalogId)
    if (!catalogEntry || isInstalled(catalogId)) return
    setInstallingId(catalogId)
    setError(null)
    try {
      const { widget } = await installWidget(catalogEntry.entry)
      onInstalled(widget)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setInstallingId(null)
    }
  }

  return {
    loaded,
    totalCount: catalog.length,
    catalog: visibleCatalog,
    query,
    setQuery,
    categoryOptions,
    categoryFilter,
    setCategoryFilter,
    selectedId,
    setSelectedId,
    selected,
    isInstalled,
    installingId,
    error,
    install,
    onOpenWidget,
  }
}
