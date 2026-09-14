// App-shell keyboard shortcuts, as predicates over a KeyboardEvent.
//
// Kept apart from the handler that acts on them so the rule — which modifiers,
// which key, what must NOT match — can be stated and tested without mounting the
// shell.

/** Command id in 00_keybindings, so Settings can show and remap this. */
export const TERMINAL_TOGGLE_ID = 'terminal.toggle'

/** VS Code's binding, and the one the physical-key match below is written for. */
export const TERMINAL_TOGGLE_DEFAULT_KEY = '`'

/**
 * VS Code's terminal toggle: Ctrl+` (Cmd+` on a Mac).
 *
 * At the default binding this matches the PHYSICAL backquote via `e.code`, so it
 * fires whatever character the active layout produces there — on a French or
 * German layout `e.key` is not "`" at all, and a key-based rule would simply
 * never fire. Once someone remaps it in Settings the comparison switches to the
 * character, because a character is what that panel captured.
 *
 * Alt is excluded throughout so this cannot swallow Ctrl+Alt+`, which layouts
 * reaching backquote through AltGr emit as a real character.
 *
 * Deliberately not gated on the focused element: a chord with Ctrl is never text
 * entry, so it should work from a field, and above all from inside the terminal
 * — the most likely place to press the shortcut that closes it.
 */
export function isTerminalToggle(
  e: KeyboardEvent,
  boundKey: string = TERMINAL_TOGGLE_DEFAULT_KEY,
): boolean {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return false
  return boundKey === TERMINAL_TOGGLE_DEFAULT_KEY
    ? e.code === 'Backquote'
    : e.key.toLowerCase() === boundKey.toLowerCase()
}
