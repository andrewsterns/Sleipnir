import { useEffect, useRef, useState } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import type { TerminalProps } from './iTerminal'

export function useTerminalViewModel({ onExit }: Pick<TerminalProps, 'onExit'>) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [exitCode, setExitCode] = useState<number | null>(null)

  // Mounted exactly once for the app's lifetime (see TerminalDock) — this
  // effect spawning one session on mount and killing it on unmount is what
  // makes "survives hiding the panel, dies on app quit" correct, since the
  // component itself is never unmounted just to hide the dock.
  useEffect(() => {
    const container = containerRef.current
    const api = window.terminalAPI
    if (!container || !api) return

    // xterm renders to canvas, so its theme + font need LITERAL values, not CSS
    // vars — read the app's actual tokens so it tracks the theme (and stays
    // legible in light mode, where a hardcoded near-white foreground vanished).
    const style = getComputedStyle(container)
    const bg1 = style.getPropertyValue('--bg-1').trim() || '#080808'
    const fg1 = style.getPropertyValue('--text-1').trim() || '#e8e8e8'

    const term = new XTerm({
      // The literal value of --font-mono — a canvas can't resolve `var(...)`, so
      // the old `var(--font-mono)` silently fell back to a default monospace.
      fontFamily: "'Sometype Mono', 'Courier New', monospace",
      fontSize: 13,
      lineHeight: 1.2,
      cursorBlink: true,
      theme: {
        background: bg1,
        foreground: fg1,
        cursor: fg1,
        selectionBackground: 'rgba(130,130,150,0.4)',
      },
    })

    // xterm ships no copy, and embedded paste is unreliable — wire both, with a
    // synchronous execCommand fallback for when navigator.clipboard is blocked
    // (it silently rejects if the window isn't focused / lacks permission).
    const execCopy = (text: string) => {
      const active = document.activeElement as HTMLElement | null
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.cssText = 'position:fixed;top:-9999px;opacity:0'
      document.body.appendChild(ta)
      ta.select()
      try { document.execCommand('copy') } catch { /* nothing more to try */ }
      document.body.removeChild(ta)
      active?.focus?.()
    }
    const writeClip = (text: string) => {
      if (!text) return
      const p = navigator.clipboard?.writeText(text)
      if (p) p.catch(() => execCopy(text))
      else execCopy(text)
    }
    const pasteFromClip = () => {
      if (navigator.clipboard) navigator.clipboard.readText().then((t) => { if (t) term.paste(t) }).catch(() => {})
    }

    // Copy the moment text is selected — the most foolproof "copy from the
    // terminal", no shortcut to remember. (Selecting always replaces the
    // clipboard, same as Linux terminals / tmux.)
    const selDisposable = term.onSelectionChange(() => {
      const sel = term.getSelection()
      if (sel) writeClip(sel)
    })

    // Ctrl+Shift+C / Cmd+C copy the selection. A bare Ctrl+C copies too WHEN
    // something is selected — suppressing SIGINT so the shell doesn't echo ^C
    // and drop a fresh prompt line — but with no selection it still sends
    // SIGINT, which you need to interrupt a running program (the classic
    // Windows conhost / VS Code behaviour). Ctrl+V / Ctrl+Shift+V paste (Cmd+V
    // is left to xterm's own native paste so it doesn't paste twice on macOS).
    term.attachCustomKeyEventHandler((e) => {
      if (e.type !== 'keydown') return true
      if (e.code === 'KeyC') {
        const bareCtrlC = e.ctrlKey && !e.shiftKey && !e.metaKey && !e.altKey
        const copyChord = (e.ctrlKey && e.shiftKey) || (e.metaKey && !e.ctrlKey)
        if (bareCtrlC || copyChord) {
          const sel = term.getSelection()
          if (sel) {
            // preventDefault stops the browser's own copy of the (empty) hidden
            // textarea from clobbering the clipboard we just wrote. Clearing the
            // selection means a second Ctrl+C — now with nothing selected —
            // falls through to SIGINT.
            e.preventDefault()
            writeClip(sel)
            term.clearSelection()
            return false
          }
          if (bareCtrlC) return true // no selection → let Ctrl+C interrupt (SIGINT)
          return !e.metaKey
        }
        return true
      }
      // Bare Ctrl+V (and Ctrl+Shift+V) paste. Without this, xterm consumes
      // Ctrl+V and sends the literal ^V (0x16) control byte to the shell —
      // Windows/VS Code users expect it to paste. preventDefault() suppresses
      // the browser's own native paste on the hidden textarea so we don't paste
      // twice; the altKey guard leaves AltGr+V (Ctrl+Alt on some layouts) as a
      // normal typed character.
      if (e.code === 'KeyV' && e.ctrlKey && !e.altKey) { e.preventDefault(); pasteFromClip(); return false }
      return true
    })
    // Right-click copies the selection if there is one, otherwise pastes — the
    // classic conhost/PuTTY behaviour.
    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault()
      const sel = term.getSelection()
      if (sel) { writeClip(sel); term.clearSelection() } else { pasteFromClip() }
    }
    container.addEventListener('contextmenu', onContextMenu)

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.open(container)
    fitAddon.fit()
    // Re-fit once the web font has actually loaded so glyph metrics are correct.
    if (document.fonts) document.fonts.ready.then(() => fitAddon.fit()).catch(() => {})

    let sessionId: string | null = null
    let disposed = false

    const dataListenerDisposable = term.onData((data) => {
      if (sessionId) api.write(sessionId, data)
    })

    let unsubData: (() => void) | null = null
    let unsubExit: (() => void) | null = null

    api.spawn(term.cols, term.rows).then(({ id }) => {
      if (disposed) {
        api.kill(id)
        return
      }
      sessionId = id
      unsubData = api.onData(id, (data) => term.write(data))
      unsubExit = api.onExit(id, (code) => setExitCode(code))
    })

    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit()
      if (sessionId) api.resize(sessionId, term.cols, term.rows)
    })
    resizeObserver.observe(container)

    return () => {
      disposed = true
      resizeObserver.disconnect()
      container.removeEventListener('contextmenu', onContextMenu)
      selDisposable.dispose()
      dataListenerDisposable.dispose()
      unsubData?.()
      unsubExit?.()
      if (sessionId) api.kill(sessionId)
      term.dispose()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (exitCode !== null) onExit?.(exitCode)
  }, [exitCode, onExit])

  return { containerRef, exitCode }
}
