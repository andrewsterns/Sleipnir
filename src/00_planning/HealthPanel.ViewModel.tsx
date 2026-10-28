import { useMemo, useState } from 'react'
import type { ArchitectureHealth } from './api/PlatformAPI'
import { impactOf } from './graph/healthLens'
import type { WorkspaceScan } from './graph/workspaceScanCache'

export interface HealthPanelProps {
  /** null while the first analysis is running. */
  health: ArchitectureHealth | null
  error: string | null
  /** The live import scan — what a selected file's blast radius is walked over. */
  scan: WorkspaceScan | null
  /** The selected graph node's file, when it is one. */
  selectedPath: string | null
  onSelectPath: (path: string) => void
  onOpenFile?: (path: string) => void
  onRescan: () => void
}

/** One row of a findings list: the file it points at, and what to say about it. */
export interface HealthRow {
  path: string
  /** The line shown — a path, a loop, an import. */
  text: string
  detail?: string
}

/**
 * Which graph mark a finding wears in the panel — the same encoding the graph
 * uses, so a heading's mark points at what to look for: a red glow (loop), a
 * dashed amber link (upward import), a heat glow, a hollow ring (unused).
 * `plain` findings have no mark on the graph.
 */
export type HealthTone = 'danger' | 'warn' | 'heat' | 'unused' | 'plain'

export interface HealthSection {
  id: string
  title: string
  /** What the finding means, as a tooltip on the title. */
  hint: string
  tone: HealthTone
  rows: HealthRow[]
}

// Each list shows this many rows before "…and N more" — the full lists are in
// the copied report.
export const SECTION_ROWS = 8
const IMPACT_ROWS = 12

const short = (path: string) => path.replace(/^src\//, '')

export function useHealthPanelViewModel({ health, scan, selectedPath }: HealthPanelProps) {
  const sections: HealthSection[] = useMemo(() => {
    if (!health) return []
    const pf = health.perFile
    return [
      {
        id: 'cycles',
        title: 'IMPORT LOOPS',
        hint: 'Files that import each other in a circle. They load in an order that depends on who is imported first, and none can change alone. Break each loop by moving the shared piece into a file both can import.',
        tone: 'danger' as const,
        rows: health.cycles.flatMap((c) => c.loops.map((loop) => ({ path: loop[0], text: loop.map(short).join(' → ') }))),
      },
      {
        id: 'upward',
        title: 'IMPORTS UP THE LAYERS',
        hint: 'A lower layer (types, utils, data) importing a higher one (components, pages). Move what it needs down, or pass it in.',
        tone: 'warn' as const,
        rows: health.violations.map((v) => ({ path: v.source, text: `${short(v.source)} → ${short(v.target)}`, detail: `${v.fromRole} → ${v.toRole}` })),
      },
      {
        id: 'pages',
        title: 'PAGES USED AS LIBRARIES',
        hint: 'A page imported by other files, usually for one piece of it. Move that piece into a component.',
        tone: 'plain' as const,
        rows: health.reusedPages.map((p) => ({ path: p.path, text: short(p.path), detail: `imported by ${p.importedBy.length}` })),
      },
      {
        id: 'heavy',
        title: 'HEAVY ON FIRST LOAD',
        hint: 'A large package loaded at startup. If it is only needed later, load it with a dynamic import().',
        tone: 'plain' as const,
        rows: health.heavy.map((h) => ({ path: h.path, text: short(h.path), detail: h.package })),
      },
      {
        id: 'hotspots',
        title: 'HOTSPOTS',
        hint: 'Files that change often and are big or widely imported — where bugs cluster. Worth splitting or covering with tests first.',
        tone: 'heat' as const,
        rows: health.hotspots.map((h) => ({ path: h.path, text: short(h.path), detail: `${h.churn} changes · in ${h.fanIn}` })),
      },
      {
        id: 'hubs',
        title: 'HUBS',
        hint: 'The files most others import. Keep them small and stable: a change here reaches everything that leans on them.',
        tone: 'plain' as const,
        rows: health.hubs.map((f) => ({ path: f, text: short(f), detail: `in ${pf[f]?.fanIn ?? 0}` })),
      },
      {
        id: 'god',
        title: 'DOING TOO MUCH',
        hint: 'Imported widely and importing widely, in a big file. Split it along the lines of who uses which part.',
        tone: 'plain' as const,
        rows: health.godFiles.map((f) => ({ path: f, text: short(f), detail: `in ${pf[f]?.fanIn ?? 0} · out ${pf[f]?.fanOut ?? 0} · ${pf[f]?.lines ?? '?'} lines` })),
      },
      {
        id: 'barrels',
        title: 'BARRELS',
        hint: 'Files that mostly re-export others. Importing one pulls in everything it re-exports.',
        tone: 'plain' as const,
        rows: health.barrels.map((b) => ({ path: b.path, text: short(b.path), detail: `${b.reexports} re-exports · in ${b.importedBy}` })),
      },
      {
        id: 'misplaced',
        title: 'LIVES IN THE WRONG FOLDER',
        hint: 'Used almost entirely from another folder. Moving it there keeps the feature together.',
        tone: 'plain' as const,
        rows: health.misplaced.map((m) => ({ path: m.path, text: short(m.path), detail: `→ ${short(m.suggestedDir)}/` })),
      },
      {
        id: 'unused',
        title: 'UNUSED',
        hint: 'Nothing imports it and it is no entry point. Check for dynamic or string references, then delete it.',
        tone: 'unused' as const,
        rows: health.dead.map((f) => {
          const only = health.unusedWith?.[f] ?? []
          return { path: f, text: short(f), detail: only.length ? `+ ${only.length} only it uses` : undefined }
        }),
      },
    ]
  }, [health])

  const selected = useMemo(() => {
    if (!health || !selectedPath) return null
    const m = health.perFile[selectedPath]
    if (!m) return null
    const { dependents, dependencies } = impactOf(scan, selectedPath)
    const flags: { text: string; tone: HealthTone }[] = []
    if (m.cycle !== null) flags.push({ text: 'In an import loop', tone: 'danger' })
    if (health.violations.some((v) => v.source === selectedPath)) flags.push({ text: 'Imports up the layers', tone: 'warn' })
    if (health.hotspots.some((h) => h.path === selectedPath)) flags.push({ text: 'Hotspot — changes often, widely used', tone: 'heat' })
    if (health.dead.includes(selectedPath)) flags.push({ text: 'Unused', tone: 'unused' })
    if (health.hubs.includes(selectedPath)) flags.push({ text: 'Hub', tone: 'plain' })
    for (const h of health.heavy.filter((x) => x.path === selectedPath)) flags.push({ text: `Loads ${h.package} on first launch`, tone: 'plain' })
    return {
      path: selectedPath,
      metrics: m,
      flags,
      dependents: dependents.slice(0, IMPACT_ROWS),
      dependentsTotal: dependents.length,
      dependencies: dependencies.slice(0, IMPACT_ROWS),
      dependenciesTotal: dependencies.length,
    }
  }, [health, scan, selectedPath])

  // The report an agent reads (see graphCore's formatReport) — copied for
  // pasting into any AI chat or terminal agent.
  const [copied, setCopied] = useState(false)
  const copyReport = async () => {
    if (!health) return
    try {
      await navigator.clipboard.writeText(health.report)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard refused (no focus / permission): nothing to undo.
    }
  }

  return { sections, selected, copied, copyReport, short }
}
