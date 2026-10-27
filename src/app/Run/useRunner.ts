import { useCallback, useEffect, useRef, useState } from 'react'
import { isActivePhase, isRunAvailable, type RunStatus, type RunTarget } from './iRun'

/** The picker's "type your own command" entry — not a detected target id. */
export const CUSTOM_TARGET_ID = '__custom__'
const OUTPUT_CAP = 200_000
const IDLE: RunStatus = { targetId: null, phase: 'idle' }

interface SavedChoice {
  selectedId: string | null
  custom: string
}

// The last-picked target is per project and per machine, like VS Code's
// launch selection — a convenience, so a failed read just means "use the
// detected default".
const storageKey = (projectPath: string) => `sleipnir-run:${projectPath}`

function loadChoice(projectPath: string): SavedChoice {
  try {
    const raw = localStorage.getItem(storageKey(projectPath))
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SavedChoice>
      return { selectedId: parsed.selectedId ?? null, custom: parsed.custom ?? '' }
    }
  } catch {
    // unavailable or corrupt — fall through to the default
  }
  return { selectedId: null, custom: '' }
}

function saveChoice(projectPath: string, choice: SavedChoice) {
  try {
    localStorage.setItem(storageKey(projectPath), JSON.stringify(choice))
  } catch {
    // best-effort
  }
}

export type Runner = ReturnType<typeof useRunner>

// Shared by the title bar's Play control and the Run dock — App.tsx owns the
// one instance so both read the same status and output. One run per window
// (see electron/preview.cjs), against that window's own project.
export function useRunner(projectPath: string | null | undefined) {
  const available = isRunAvailable()
  const [targets, setTargets] = useState<RunTarget[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [custom, setCustom] = useState('')
  const [status, setStatus] = useState<RunStatus>(IDLE)
  const [output, setOutput] = useState('')
  const [scanning, setScanning] = useState(false)
  // Bumped on every start, so the Run dock can tell a fresh run (switch to
  // its preview once ready) from a status update within the same one.
  const [runId, setRunId] = useState(0)
  const projectRef = useRef(projectPath)
  projectRef.current = projectPath

  const rescan = useCallback(async () => {
    if (!available || !projectPath) {
      setTargets([])
      return
    }
    setScanning(true)
    try {
      const { targets: found, defaultId } = await window.runAPI!.detect()
      if (projectRef.current !== projectPath) return
      setTargets(found)
      const saved = loadChoice(projectPath)
      setCustom(saved.custom)
      setSelectedId((cur) => {
        const keep = (id: string | null) => id === CUSTOM_TARGET_ID || found.some((t) => t.id === id)
        if (keep(cur)) return cur
        if (keep(saved.selectedId)) return saved.selectedId
        return defaultId
      })
    } finally {
      setScanning(false)
    }
  }, [available, projectPath])

  // A different project in this window: whatever was running belonged to the
  // old one, so stop it rather than leave a stranger's server on the button.
  useEffect(() => {
    setSelectedId(null)
    setOutput('')
    setStatus(IDLE)
    rescan()
    return () => {
      window.runAPI?.stop()
    }
  }, [rescan])

  useEffect(() => {
    if (!available) return
    const offStatus = window.runAPI!.onStatus(setStatus)
    const offOutput = window.runAPI!.onOutput((text) => setOutput((prev) => (prev + text).slice(-OUTPUT_CAP)))
    return () => {
      offStatus()
      offOutput()
    }
  }, [available])

  const select = useCallback((id: string) => {
    setSelectedId(id)
    if (projectPath) saveChoice(projectPath, { selectedId: id, custom })
  }, [projectPath, custom])

  const setCustomCommand = useCallback((line: string) => {
    setCustom(line)
    setSelectedId(CUSTOM_TARGET_ID)
    if (projectPath) saveChoice(projectPath, { selectedId: CUSTOM_TARGET_ID, custom: line })
  }, [projectPath])

  const selected = targets.find((t) => t.id === selectedId) ?? null
  const canPlay = available && !!projectPath && (selectedId === CUSTOM_TARGET_ID ? custom.trim() !== '' : !!selected)

  /** Starts the selected target — or restarts it, if something is already running. */
  const play = useCallback(() => {
    if (!canPlay) return
    setOutput('')
    setRunId((n) => n + 1)
    setStatus({ targetId: selectedId, phase: 'starting' })
    window.runAPI!.start(selectedId === CUSTOM_TARGET_ID ? { custom } : { targetId: selectedId! })
  }, [canPlay, selectedId, custom])

  const stop = useCallback(() => window.runAPI?.stop(), [])

  const openExternal = useCallback((url: string) => {
    window.runAPI?.openExternal(url)
  }, [])

  return {
    available,
    targets,
    selectedId,
    selected,
    custom,
    status,
    active: isActivePhase(status.phase),
    output,
    runId,
    scanning,
    canPlay,
    select,
    setCustomCommand,
    rescan,
    play,
    stop,
    openExternal,
    clearOutput: () => setOutput(''),
  }
}
