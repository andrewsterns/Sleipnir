import type { Item } from './items'
import { BoardItem } from './BoardItem'
import type { MenuState } from '../menu/ContextMenu'
import { useContextMenu } from '../menu/useContextMenu'

export function Board({ items, menu, onMenu }: { items: Item[]; menu: MenuState | null; onMenu: (m: MenuState) => void }) {
  const onContextMenu = useContextMenu(items, onMenu)
  return (
    <ul onContextMenu={onContextMenu}>
      {items.map((item) => (
        // `menu` is passed to every item only so one of them can show a
        // highlight — and it changes on every right-click.
        <BoardItem key={item.id} item={item} menu={menu} />
      ))}
    </ul>
  )
}
