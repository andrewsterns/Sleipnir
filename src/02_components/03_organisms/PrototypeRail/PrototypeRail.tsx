import { Frame } from '../../01_atoms/Frame/Frame'
import { ScrollWindow } from '../../02_molecules/ScrollWindow/ScrollWindow'
import { Search } from '../../02_molecules/Search/Search'
import { PrototypeRailProps, PrototypeSelection } from './iPrototypeRail'
import { usePrototypeRailViewModel } from './PrototypeRailViewModel'

const MONO: React.CSSProperties = { fontFamily: 'var(--font-mono)' }

function isSameSelection(a: PrototypeSelection | null, b: PrototypeSelection): boolean {
  if (!a || a.kind !== b.kind) return false
  return a.kind === 'curated' && b.kind === 'curated' ? a.id === b.id : a.kind === 'scaffolded' && b.kind === 'scaffolded' ? a.node.id === b.node.id : false
}

export const PrototypeRail: React.FC<PrototypeRailProps> = (props) => {
  const { activeSelection, onSelect, width = 240 } = props
  const { query, setQuery, activeFilters, setActiveFilters, filterOptions, rows } = usePrototypeRailViewModel(props)

  return (
    <ScrollWindow axis="y" flow="vertical" gap={0} minH={0} w={width} shrink={0} padding={{ y: 8 }}>
      <Frame flow="horizontal" align="center" justify="between" padding={{ x: 8, bottom: 4 }}>
        <span style={{ fontSize: 9, letterSpacing: '0.12em', color: 'var(--text-3)', ...MONO }}>
          03_PROTOTYPES ({rows.length})
        </span>
      </Frame>
      <Frame padding={{ x: 8, bottom: 8 }}>
        <Search
          value={query}
          onChange={setQuery}
          placeholder="Search prototypes…"
          w="fill"
          filters={{ options: filterOptions, active: activeFilters, onChange: setActiveFilters }}
        />
      </Frame>

      {rows.map((row) => {
        const isActive = isSameSelection(activeSelection, row.selection)
        return (
          <button
            key={row.key}
            onClick={() => onSelect(row.selection)}
            style={{
              display: 'block',
              textAlign: 'left',
              width: '100%',
              background: isActive ? 'rgba(255,255,255,0.08)' : 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: '6px 8px',
              color: isActive ? 'var(--text-1)' : 'var(--text-2)',
              fontSize: 10,
              letterSpacing: '0.02em',
              ...MONO,
            }}
          >
            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.label}</div>
            <div style={{ fontSize: 9, color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {row.sub}
            </div>
          </button>
        )
      })}

      {rows.length === 0 && (
        <span style={{ fontSize: 10, color: 'var(--text-3)', padding: '0 8px', ...MONO }}>— none —</span>
      )}
    </ScrollWindow>
  )
}
