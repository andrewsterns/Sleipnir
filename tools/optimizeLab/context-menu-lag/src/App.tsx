import { useState } from 'react'
import { Board } from './board/Board'
import { ContextMenu, type MenuState } from './menu/ContextMenu'
import { SettingsPanel } from './settings/SettingsPanel'
import { SearchBar } from './search/SearchBar'
import { makeItems } from './board/items'

const ITEMS = makeItems(3000)

// The menu's open/position state lives HERE, at the top of the app, and is
// passed down through the board to every item — so opening the menu
// re-renders all 3000 items. The lag a user feels on right-click.
export function App() {
  const [menu, setMenu] = useState<MenuState | null>(null)
  return (
    <main onClick={() => setMenu(null)}>
      <SearchBar items={ITEMS} />
      <Board items={ITEMS} menu={menu} onMenu={setMenu} />
      {menu && <ContextMenu state={menu} items={ITEMS} onClose={() => setMenu(null)} />}
      <SettingsPanel />
    </main>
  )
}
