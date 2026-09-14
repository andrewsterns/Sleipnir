// Promote-by-move: keeping a board's components attached to their files when
// those files move in the Workspace tree.
//
// This is what makes `.canvas` a staging tier rather than a dead end. A
// component starts life at `.canvas/<name>/<name>.tsx` (see paths.ts's
// DEFAULT_COMPONENT_ROOT) and becomes a real workspace component by being cut
// and pasted somewhere real — no separate "promote" command, because the move
// IS the promotion.
//
// Without this, that move would silently fork: the file would sit in its new
// home while the board kept pointing at the old path, so the next push would
// rewrite the copy you abandoned and your two files would drift apart forever.
//
// Deliberately pure — a doc in, a doc out, no fs and no API — so every move
// shape (file, folder, nested, no-match) is exhaustively testable. The I/O half
// lives in store.ts's reconcileMove.

import { normalizeRelPath, parentDir } from './paths'
import { flattenComponent, isLosslessDowngrade } from './variants'
import type { CanvasComponent, CanvasDoc } from './types'

/**
 * The new path for `filePath` when `from` moved to `to`, or null when this
 * move doesn't touch it.
 *
 * Handles both shapes the Workspace tree can produce: a file moved directly,
 * and a folder moved with the file somewhere inside it. Containment is checked
 * on a segment boundary, so moving `.canvas/card` never captures a sibling
 * `.canvas/card-2/card.tsx` that merely shares a name prefix — the same
 * prefix-bug guard isContained applies.
 */
export function remapPath(filePath: string, from: string, to: string): string | null {
  const file = normalizeRelPath(filePath)
  const source = normalizeRelPath(from)
  const dest = normalizeRelPath(to)
  if (!file || !source || !dest) return null

  if (file === source) return dest
  if (file.startsWith(`${source}/`)) return `${dest}${file.slice(source.length)}`
  return null
}

/**
 * Reattaches every component the move touched, and widens its sandbox to match.
 *
 * `componentRoot` becomes the parent of the moved entry's destination — move
 * `.canvas/card/` into `src/components/` and the component is thereafter
 * contained to `src/components`, free to be renamed or reorganized within it
 * but unable to escape it. Deriving the root from the MOVED ENTRY rather than
 * from the file means a moved folder and a moved file agree: both land on the
 * directory the human actually pasted into.
 *
 * Returns the same doc object when nothing matched, so callers can skip the
 * write with a cheap identity check rather than diffing.
 */
export function relinkAfterMove(doc: CanvasDoc, from: string, to: string): CanvasDoc {
  const nextRoot = parentDir(to)

  let changed = false
  const components = doc.components.map((component) => {
    if (!component.filePath) return component
    const nextPath = remapPath(component.filePath, from, to)
    if (!nextPath) return component
    changed = true
    return {
      ...component,
      filePath: nextPath,
      componentRoot: nextRoot,
      updatedAt: Date.now(),
    } satisfies CanvasComponent
  })

  if (!changed) return doc
  return { ...doc, components, updatedAt: Date.now() }
}

/**
 * Reconciles a board to a file (or folder) that was deleted in the Workspace.
 *
 * Applies the same rule removeComponentFile applies from inside the Canvas, so
 * deleting a component's file gets the same outcome wherever you delete it
 * from: dissolve it back into a frame when nothing would be lost, keep and flag
 * it when something would.
 *
 * Deleting the file is a deliberate act, which is what earns the automatic
 * downgrade here — unlike a file that merely went missing (see
 * markVanishedComponents), where a git checkout or a half-mounted drive looks
 * identical and dissolving would be destructive on a guess.
 *
 * Returns the same doc object when nothing matched, so callers can skip the
 * write with an identity check.
 */
export function reconcileDeletedPath(doc: CanvasDoc, deletedPath: string): CanvasDoc {
  const target = normalizeRelPath(deletedPath)
  if (!target) return doc

  const hit = doc.components.filter((c) => {
    if (!c.filePath) return false
    const file = normalizeRelPath(c.filePath)
    return file === target || file.startsWith(`${target}/`)
  })
  if (hit.length === 0) return doc

  let next = doc
  for (const component of hit) {
    if (isLosslessDowngrade(next, component.id)) {
      next = flattenComponent(next, component.id)
      continue
    }
    next = {
      ...next,
      components: next.components.map((c) =>
        c.id === component.id
          ? {
              ...c,
              filePath: undefined,
              lastWrittenHash: undefined,
              sync: 'detached' as const,
              ejectReason:
                'Its file was deleted. The design is still here — flatten it to a frame, or write it again.',
              updatedAt: Date.now(),
            }
          : c,
      ),
      updatedAt: Date.now(),
    }
  }
  return next
}

/** The components whose files this move relocated, paired with their old paths. */
export function movedComponents(
  doc: CanvasDoc,
  from: string,
  to: string,
): { component: CanvasComponent; fromPath: string; toPath: string }[] {
  const moved: { component: CanvasComponent; fromPath: string; toPath: string }[] = []
  for (const component of doc.components) {
    if (!component.filePath) continue
    const toPath = remapPath(component.filePath, from, to)
    if (toPath) moved.push({ component, fromPath: component.filePath, toPath })
  }
  return moved
}
