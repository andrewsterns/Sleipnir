import { useCallback, useEffect, useRef, useState } from 'react'
import type { CanvasDocSummary } from './model/types'

// Open boards as tabs — the same model as Planning's open plans: closing a tab
// never deletes anything, the board stays in the BOARDS list to reopen. Which
// tabs are open (and which is active) is remembered per project on this
// machine, like the camera is.

interface StoredTabs {
  open: string[]
  active: string | null
}

const storageKey = (projectPath: string | null | undefined) => `sleipnir-canvas-tabs:${projectPath ?? ''}`

function readTabs(projectPath: string | null | undefined): StoredTabs {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey(projectPath)) ?? 'null') as StoredTabs | null
    if (parsed && Array.isArray(parsed.open)) return { open: parsed.open.filter((id) => typeof id === 'string'), active: parsed.active ?? null }
  } catch {
    // Unreadable or blocked storage — start with no tabs.
  }
  return { open: [], active: null }
}

export interface BoardTabsVm {
  docs: CanvasDocSummary[]
  doc: { id: string; name: string } | null
  loading: boolean
  openDoc: (id: string) => Promise<unknown>
  closeBoard: () => Promise<void>
}

export function useBoardTabs(vm: BoardTabsVm, projectPath: string | null | undefined) {
  const [stored] = useState(() => readTabs(projectPath))
  const [openIds, setOpenIds] = useState<string[]>(stored.open)
  const activeId = vm.doc?.id ?? null

  // Whatever board is open has a tab — however it was opened (a tab, the
  // BOARDS list, a new board, "Show in Canvas", EDIT MAIN COMPONENT).
  useEffect(() => {
    if (activeId) setOpenIds((prev) => (prev.includes(activeId) ? prev : [...prev, activeId]))
  }, [activeId])

  // Boards deleted (here or on disk) lose their tabs. Only once the list has
  // loaded — before that, every stored tab would look deleted.
  useEffect(() => {
    if (vm.loading) return
    const exists = new Set(vm.docs.map((d) => d.id))
    setOpenIds((prev) => (prev.every((id) => exists.has(id)) ? prev : prev.filter((id) => exists.has(id))))
  }, [vm.docs, vm.loading])

  // The initial load opens the most recently edited board; come back to the
  // tab that was active instead, once.
  const restored = useRef(false)
  useEffect(() => {
    if (vm.loading || restored.current) return
    restored.current = true
    if (stored.active && stored.active !== activeId && vm.docs.some((d) => d.id === stored.active)) {
      void vm.openDoc(stored.active)
    }
  }, [vm, stored.active, activeId])

  useEffect(() => {
    try {
      localStorage.setItem(storageKey(projectPath), JSON.stringify({ open: openIds, active: activeId }))
    } catch {
      // Storage unavailable — tabs just won't survive a reload.
    }
  }, [projectPath, openIds, activeId])

  const activate = useCallback((id: string) => void vm.openDoc(id), [vm])

  /** Closes a tab; closing the active one moves to its neighbor, or to no board at all. */
  const close = useCallback(
    (id: string) => {
      const index = openIds.indexOf(id)
      if (index === -1) return
      const remaining = openIds.filter((t) => t !== id)
      setOpenIds(remaining)
      if (id !== activeId) return
      const neighbor = remaining[index] ?? remaining[index - 1]
      void (neighbor ? vm.openDoc(neighbor) : vm.closeBoard())
    },
    [openIds, activeId, vm],
  )

  const tabs = openIds
    .map((id) => vm.docs.find((d) => d.id === id))
    .filter((d): d is CanvasDocSummary => !!d)
    // The open board's own name, not its summary's — a rename shows before it's saved.
    .map((d) => ({ id: d.id, label: d.id === activeId && vm.doc ? vm.doc.name : d.name, closable: true, icon: 'canvas' as const }))

  return { tabs, activeId, activate, close }
}
