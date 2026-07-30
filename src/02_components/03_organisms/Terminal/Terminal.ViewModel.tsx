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

    const term = new XTerm({
      fontFamily: 'var(--font-mono)',
      fontSize: 12,
      cursorBlink: true,
      theme: {
        background: '#0b0d11',
        foreground: '#e8e8e8',
        cursor: '#e8e8e8',
      },
    })
    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.open(container)
    fitAddon.fit()

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
