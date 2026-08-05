import { Frame } from '../app/UIKit/Frame/Frame'
import { Text } from '../app/UIKit/Text/Text'
import { Icon } from '../app/UIKit/Icon/Icon'
import { Button } from '../app/UIKit/Button/Button'
import { Chip } from '../app/UIKit/Chip/Chip'
import { Search } from '../app/UIKit/Search/Search'
import { ScrollWindow } from '../app/UIKit/ScrollWindow/ScrollWindow'
import { useWidgetStoreViewModel, type WidgetStoreViewProps } from './WidgetStore.ViewModel'

const MONO: React.CSSProperties = { fontFamily: 'var(--font-mono)' }

// Full-page "+" destination — a searchable, filterable widget marketplace
// modeled on VS Code's Extensions view (search + category filter chips over
// a list, click an item for its full detail + Install/Open action), not a
// transient popup. Lives as a normal NavRail mode (see App.tsx's
// ADD_WIDGET_ID) so it behaves like every other page: navigate to it and
// away from it via the rail, and installing something doesn't yank you
// elsewhere. The catalog itself is fetched (see WidgetStore.ViewModel.tsx),
// not bundled — this view never needs to change as the catalog grows.
export function WidgetStoreView(props: WidgetStoreViewProps) {
  const vm = useWidgetStoreViewModel(props)

  return (
    <Frame theme="tactical" flow="horizontal" h="fill" w="fill" fill={{ solid: 'bg-1' }}>
      <Frame flow="vertical" w={340} shrink={0} gap={0} minH={0} stroke={{ right: { color: 'border-1' } }}>
        <Frame flow="vertical" gap={8} padding={{ x: 12, top: 10, bottom: 8 }}>
          <Text variant="xs" color="text-3" tracking="widest" mono>
            Widget Store{vm.loaded ? ` (${vm.totalCount})` : ''}
          </Text>
          <Search
            value={vm.query}
            onChange={vm.setQuery}
            placeholder="Search widgets…"
            w="fill"
            filters={
              vm.categoryOptions.length > 0
                ? { options: vm.categoryOptions, active: vm.categoryFilter, onChange: vm.setCategoryFilter }
                : undefined
            }
          />
        </Frame>

        <ScrollWindow axis="y" flow="vertical" gap={0} minH={0} grow padding={{ y: 4 }}>
          {!vm.loaded ? (
            <Frame padding={12}>
              <Text variant="small" color="text-3" mono>
                Loading catalog…
              </Text>
            </Frame>
          ) : vm.catalog.length === 0 ? (
            <Frame padding={12}>
              <Text variant="small" color="text-3" mono>
                No widgets match your search.
              </Text>
            </Frame>
          ) : (
            vm.catalog.map((c) => {
              const active = c.id === vm.selectedId
              const installed = vm.isInstalled(c.id)
              return (
                <Frame
                  as="button"
                  key={c.id}
                  onClick={() => vm.setSelectedId(c.id)}
                  flow="horizontal"
                  align="start"
                  gap={10}
                  w="fill"
                  variant="none"
                  fill={{ solid: active ? 'rgba(255,255,255,0.08)' : 'transparent' }}
                  hoverFill="bg-3"
                  cursor="pointer"
                  padding={{ x: 12, y: 10 }}
                  textColor={active ? 'var(--text-1)' : 'var(--text-2)'}
                  style={{ textAlign: 'left', ...MONO }}
                >
                  <span style={{ display: 'flex', flexShrink: 0, marginTop: 2 }}>
                    <Icon name={c.icon} size={16} />
                  </span>
                  <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span
                        style={{
                          fontSize: 12,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {c.label}
                      </span>
                      {installed && <Chip variant="default">Installed</Chip>}
                    </span>
                    <span
                      style={{
                        fontSize: 11,
                        color: 'var(--text-3)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {c.description}
                    </span>
                  </span>
                </Frame>
              )
            })
          )}
        </ScrollWindow>
      </Frame>

      <Frame flow="vertical" grow minW={0} padding={24} gap={16}>
        {vm.selected ? (
          <>
            <Frame flow="horizontal" align="center" gap={10}>
              <Icon name={vm.selected.icon} size={22} />
              <Text variant="h5" color="text-1" mono>
                {vm.selected.label}
              </Text>
              <Chip variant="default">{vm.selected.category}</Chip>
              {vm.isInstalled(vm.selected.id) && <Chip variant="default">Installed</Chip>}
            </Frame>

            <Text variant="small" color="text-2" mono>
              {vm.selected.description}
            </Text>

            {vm.error && <span style={{ fontSize: 12, color: '#e07a7a', ...MONO }}>{vm.error}</span>}

            <Frame flow="horizontal" gap={8}>
              {vm.isInstalled(vm.selected.id) ? (
                <Button variant="primary" size="sm" onClick={() => vm.onOpenWidget(vm.selected!.id)}>
                  Open Widget
                </Button>
              ) : (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => vm.install(vm.selected!.id)}
                  disabled={vm.installingId === vm.selected.id}
                  isLoading={vm.installingId === vm.selected.id}
                >
                  {vm.installingId === vm.selected.id ? 'Installing…' : 'Install'}
                </Button>
              )}
            </Frame>
          </>
        ) : (
          <Text variant="small" color="text-3" mono>
            {vm.loaded ? 'Select a widget from the list.' : 'Loading…'}
          </Text>
        )}
      </Frame>
    </Frame>
  )
}
