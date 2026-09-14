// Multi-select for the workspace file tree: what a click does to the selection,
// and what a context menu should then act on.
//
// Pure on purpose. The rules are the fiddly part — a shift-range has to run over
// the rows the user can actually SEE, a ctrl-click toggles rather than replaces,
// and opening a menu on a row outside the selection has to abandon that
// selection rather than silently act on it. None of that needs a DOM to state or
// to test, so none of it lives in the component.

/** Rows currently drawn, in the order they are drawn. See `visibleRowPaths`. */
export type VisibleOrder = readonly string[]

export interface SelectionState {
  selected: ReadonlySet<string>
  /**
   * The row a shift-range measures from — the last row picked deliberately,
   * not the last row a range happened to cover. Holding shift and sweeping
   * therefore grows and shrinks one range instead of ratcheting outwards.
   */
  anchor: string | null
}

export const EMPTY_SELECTION: SelectionState = { selected: new Set(), anchor: null }

export interface ClickModifiers {
  ctrlKey?: boolean
  metaKey?: boolean
  shiftKey?: boolean
}

/**
 * True when the click was asking to change the SELECTION rather than to open a
 * file or expand a folder.
 *
 * The caller uses this to suppress a row's normal action, so ctrl-clicking five
 * files does not also open five editor tabs.
 */
export function isMultiSelectClick(e: ClickModifiers): boolean {
  return !!(e.ctrlKey || e.metaKey || e.shiftKey)
}

/** The inclusive run between two paths in visible order, or null if either is gone. */
function rangeBetween(order: VisibleOrder, from: string, to: string): string[] | null {
  const a = order.indexOf(from)
  const b = order.indexOf(to)
  if (a === -1 || b === -1) return null
  return order.slice(Math.min(a, b), Math.max(a, b) + 1)
}

/**
 * The selection after a click on `path`.
 *
 * - shift: replace the selection with the run from the anchor to here. Measured
 *   over `order`, so a range never reaches into a collapsed folder the user
 *   cannot see. With no usable anchor it degrades to a plain click.
 * - ctrl/cmd: toggle this row, keeping the rest. Becomes the new anchor, so a
 *   following shift-click ranges from where you last pointed.
 * - plain: this row alone.
 */
export function selectOnClick(
  state: SelectionState,
  path: string,
  mods: ClickModifiers,
  order: VisibleOrder,
): SelectionState {
  if (mods.shiftKey && state.anchor) {
    const run = rangeBetween(order, state.anchor, path)
    if (run) return { selected: new Set(run), anchor: state.anchor }
  }
  if (mods.ctrlKey || mods.metaKey) {
    const next = new Set(state.selected)
    if (next.has(path)) next.delete(path)
    else next.add(path)
    return { selected: next, anchor: path }
  }
  return { selected: new Set([path]), anchor: path }
}

export interface MenuTarget {
  /** Rows the menu acts on, in visible order — always at least one. */
  paths: string[]
  /** The selection to keep while the menu is open. */
  state: SelectionState
}

/**
 * What a menu opened on `path` should act on.
 *
 * Right-clicking INSIDE a multi-selection acts on the whole thing, which is the
 * entire point of selecting first. Right-clicking outside it means you have
 * moved on: the old selection is dropped and the menu acts on the row you
 * actually pointed at. Doing anything else here is how a bulk delete eats files
 * the user had forgotten were selected.
 */
export function selectionForMenu(
  state: SelectionState,
  path: string,
  order: VisibleOrder,
): MenuTarget {
  if (state.selected.size > 1 && state.selected.has(path)) {
    const ordered = order.filter((p) => state.selected.has(p))
    // A selected row scrolled out of the tree (its folder was collapsed) still
    // belongs to the selection, so fall back to the raw set rather than
    // silently dropping it from the action.
    const paths = ordered.length === state.selected.size ? ordered : [...state.selected]
    return { paths, state }
  }
  return { paths: [path], state: { selected: new Set([path]), anchor: path } }
}

/**
 * Drops paths that no longer exist from a selection — after a delete, a move, or
 * a refresh that pruned the tree.
 *
 * Left alone, a stale path would keep counting towards `selected.size`, which is
 * what decides whether the next menu is a bulk one.
 */
export function pruneSelection(state: SelectionState, alive: ReadonlySet<string>): SelectionState {
  const next = new Set([...state.selected].filter((p) => alive.has(p)))
  if (next.size === state.selected.size) return state
  return { selected: next, anchor: state.anchor && next.has(state.anchor) ? state.anchor : null }
}
