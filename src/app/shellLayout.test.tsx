// The bottom dock has to stay out of the way of two things: dialogs, which it
// used to paint over, and the app's own content, which it only avoids while the
// strip reclaimed for it matches its height.

import { describe, it, expect } from 'vitest'
import { useState } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { TerminalDock } from './TerminalDock/TerminalDock'
import { ProblemsDock } from './ProblemsDock/ProblemsDock'
import { DOCK_PANEL_HEIGHT, LAYER, STATUS_BAR_HEIGHT } from './shellLayout'
import { StatusBar, type DockId } from './StatusBar/StatusBar'
import { isTerminalToggle, TERMINAL_TOGGLE_DEFAULT_KEY, TERMINAL_TOGGLE_ID } from './shortcuts'
import { DEFAULT_KEYBINDINGS } from '../00_keybindings'

describe('shell stacking order', () => {
  // The bug: the dock painted at 999 while every modal and popover sits at 200,
  // so an open terminal took a 320px bite out of the bottom of any dialog —
  // including the buttons needed to dismiss it.
  it('puts the dock below dialogs, and dialogs below the palette and menus', () => {
    expect(LAYER.viewChrome).toBeLessThan(LAYER.dock)
    expect(LAYER.dock).toBeLessThan(LAYER.dialog)
    expect(LAYER.dialog).toBeLessThan(LAYER.palette)
    expect(LAYER.palette).toBeLessThan(LAYER.titleBarMenu)
  })

  // Modals across the app pass this literal as `z={200}` (DeletePathModal,
  // RenamePathModal, AddNodeModal, …). If the tier and the
  // literal ever drift apart, the dock starts covering dialogs again.
  it('matches the z the app’s modals actually pass', () => {
    expect(LAYER.dialog).toBe(200)
  })
})

describe('dock panel geometry', () => {
  /** The fixed, full-width panel an open dock renders. */
  const panel = () => document.querySelector('[style*="position: fixed"]') as HTMLElement

  it('sizes the terminal panel from the shared constants and sits it on the status bar', () => {
    render(<TerminalDock open onOpenChange={() => {}} />)
    expect(panel().style.height).toBe(`${DOCK_PANEL_HEIGHT}px`)
    expect(panel().style.bottom).toBe(`${STATUS_BAR_HEIGHT}px`)
    expect(panel().style.zIndex).toBe(String(LAYER.dock))
  })

  it('tiers a sibling dock identically, so none of them outranks a dialog', () => {
    render(<ProblemsDock open onOpenChange={() => {}} browserRefs={{ current: new Map() }} />)
    expect(panel().style.height).toBe(`${DOCK_PANEL_HEIGHT}px`)
    expect(panel().style.bottom).toBe(`${STATUS_BAR_HEIGHT}px`)
    expect(panel().style.zIndex).toBe(String(LAYER.dock))
  })

  it('builds no panel until the dock is first opened', () => {
    render(<TerminalDock open={false} onOpenChange={() => {}} />)
    expect(panel()).toBeNull()
  })
})

describe('status bar', () => {
  const summary = { total: 0, text: null, color: null, rest: 0 }

  function Shell() {
    const [active, setActive] = useState<DockId | null>(null)
    return <StatusBar activeDock={active} onToggleDock={(id) => setActive((cur) => (cur === id ? null : id))} problems={summary} />
  }

  it('toggles a dock from its tab and marks the open one', () => {
    render(<Shell />)
    const terminal = screen.getByRole('button', { name: /Terminal/ })
    expect(terminal.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(terminal)
    expect(terminal.getAttribute('aria-pressed')).toBe('true')
    // Opening another switches the active tab — one panel at a time.
    fireEvent.click(screen.getByRole('button', { name: /AI/ }))
    expect(terminal.getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByRole('button', { name: /AI/ }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: /AI/ }))
    expect(screen.getByRole('button', { name: /AI/ }).getAttribute('aria-pressed')).toBe('false')
  })

  it('shows the problem count and the first problem', () => {
    render(
      <StatusBar
        activeDock={null}
        onToggleDock={() => {}}
        problems={{ total: 3, text: 'src/a.ts: 2 problems', color: '#e0a040', rest: 1 }}
      />,
    )
    expect(screen.getByText('src/a.ts: 2 problems')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Problems/ })).toHaveTextContent('3')
  })
})

describe('the terminal toggle shortcut', () => {
  const press = (init: KeyboardEventInit) => new KeyboardEvent('keydown', init)

  it('matches Ctrl+` and Cmd+`', () => {
    expect(isTerminalToggle(press({ code: 'Backquote', ctrlKey: true }))).toBe(true)
    expect(isTerminalToggle(press({ code: 'Backquote', metaKey: true }))).toBe(true)
  })

  it('ignores the bare key, other keys, and the AltGr combo', () => {
    expect(isTerminalToggle(press({ code: 'Backquote' }))).toBe(false)
    expect(isTerminalToggle(press({ code: 'KeyJ', ctrlKey: true }))).toBe(false)
    // Layouts that reach the backquote through AltGr must still be able to type it.
    expect(isTerminalToggle(press({ code: 'Backquote', ctrlKey: true, altKey: true }))).toBe(false)
  })

  it('matches on the physical key, not the character the layout produces', () => {
    // On a French layout this key emits neither "`" nor anything stable, so a
    // `key`-based rule would simply not fire.
    expect(isTerminalToggle(press({ code: 'Backquote', key: 'ò', ctrlKey: true }))).toBe(true)
  })

  it('follows a remap onto the character Settings captured', () => {
    // Settings records `e.key`, so a remapped binding is compared as a
    // character — the physical-key rule only applies to the backquote default.
    expect(isTerminalToggle(press({ code: 'KeyJ', key: 'j', ctrlKey: true }), 'j')).toBe(true)
    expect(isTerminalToggle(press({ code: 'Backquote', ctrlKey: true }), 'j')).toBe(false)
  })

  it('is registered so Settings can show and remap it', () => {
    const entry = DEFAULT_KEYBINDINGS.find((b) => b.id === TERMINAL_TOGGLE_ID)
    expect(entry?.key).toBe(TERMINAL_TOGGLE_DEFAULT_KEY)
    expect(entry?.label).toBeTruthy()
  })
})
