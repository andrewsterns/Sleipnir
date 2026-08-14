import React from 'react'
import { Frame } from '../app/UIKit/Frame/Frame'
import { ScrollWindow } from '../app/UIKit/ScrollWindow/ScrollWindow'
import { Search } from '../app/UIKit/Search/Search'
import { SEARCH_SORT_OPTIONS, type SearchSortId } from '../app/UIKit/Search/iSearch'
import { useAnalyticsViewModel } from './AnalyticsView.ViewModel'
import { useAppTheme } from '../00_themes/ThemeController'

const MONO: React.CSSProperties = { fontFamily: 'var(--font-mono)' }

export const AnalyticsView: React.FC = () => {
  const { query, setQuery, sortOrder, setSortOrder, filteredItems } = useAnalyticsViewModel()
  const { theme } = useAppTheme()

  return (
    <Frame theme={theme} h="fill" flow="vertical" fill={{ solid: 'var(--bg-1)' }} style={MONO}>
      <Frame
        flow="horizontal"
        align="center"
        justify="between"
        padding={{ x: 24, y: 10 }}
        stroke={{ bottom: { color: 'var(--border-1)' } }}
      >
        <span style={{ fontSize: 10, letterSpacing: '0.14em', color: 'var(--text-2)', ...MONO }}>
          05 — ANALYTICS
        </span>
        <span style={{ fontSize: 10, letterSpacing: '0.12em', color: 'var(--text-3)', ...MONO }}>
          {filteredItems.length} ITEMS
        </span>
      </Frame>

      {/* No analytics data source yet — blank space below the search bar
          until one exists. */}
      <ScrollWindow axis="y" flow="vertical" grow minH={0} padding={24} gap={12}>
        <Search
          value={query}
          onChange={setQuery}
          placeholder="Search analytics…"
          w="fill"
          // Same sort dropdown as every other left-rail search.
          sort={{
            options: SEARCH_SORT_OPTIONS,
            active: sortOrder,
            onChange: (v) => setSortOrder(v as SearchSortId),
          }}
        />

        {filteredItems.length === 0 && (
          <span style={{ fontSize: 10, letterSpacing: '0.1em', color: 'var(--text-3)', ...MONO }}>
            NO ANALYTICS DATA YET
          </span>
        )}
      </ScrollWindow>
    </Frame>
  )
}
