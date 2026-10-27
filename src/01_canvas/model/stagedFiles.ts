// The `.canvas` invariant: a component on a board ⇔ its file in `.canvas`.
//
// `.canvas` is a staging tier (see paths.ts's DEFAULT_COMPONENT_ROOT), so the
// files in it have no life of their own — each one exists because, and only
// while, a board holds the component it was written from. Every operation that
// takes a component off a board (delete its last instance, flatten it, undo
// its promotion, delete the board) must therefore take the file with it, and
// every operation that puts one back (redo, undo of a delete) must restore it.
//
// Rather than teach each of those operations about files, the ViewModel diffs
// the staged files a board claims before and after every change and converges
// the disk to match (see CanvasView.ViewModel's syncStagedFiles). This module is
// the pure half of that: which paths count as staged, which components a board
// still holds, and what to do about the difference.
//
// Files a component was MOVED out to (promoted into real source) are not
// staged, and nothing here ever touches them: that is project code now, and
// deleting it as a side effect of a canvas edit would be destroying work.

import { extractRegion } from '../emit/region'
import { DEFAULT_COMPONENT_ROOT, isContained, normalizeRelPath } from './paths'
import { isFrameNode, isInstanceNode, type CanvasComponent, type CanvasDoc, type CanvasNode } from './types'

/**
 * True for a component file inside the staging tier.
 *
 * Anything under a dot-folder inside `.canvas` is app storage rather than a
 * component (`.canvas/.boards/` holds the boards themselves). Derived
 * component folders never start with a dot — they are camelCase names, see
 * paths.ts's deriveComponentPath — so the rule can't misfire on one.
 */
export function isStagedPath(filePath: string): boolean {
  if (!isContained(DEFAULT_COMPONENT_ROOT, filePath)) return false
  const normalized = normalizeRelPath(filePath)
  if (normalized === DEFAULT_COMPONENT_ROOT) return false
  const inner = normalized.slice(DEFAULT_COMPONENT_ROOT.length + 1).split('/')
  return !inner.some((segment) => segment.startsWith('.'))
}

/** path → component, for every component on the board whose file is staged. */
export function stagedFilesOf(doc: CanvasDoc): Map<string, CanvasComponent> {
  const staged = new Map<string, CanvasComponent>()
  for (const component of doc.components) {
    if (component.filePath && isStagedPath(component.filePath)) {
      staged.set(normalizeRelPath(component.filePath), component)
    }
  }
  return staged
}

export interface StagedFileDiff {
  /** Staged files the board no longer claims — to be deleted. */
  removed: { path: string; componentId: string }[]
  /** Staged files the board newly claims — to be restored if missing. */
  added: { path: string; component: CanvasComponent }[]
}

/**
 * What changed between two states of one board's staged files.
 *
 * A path that changed hands (one component gave it up and another took it in
 * the same step) counts as both removed and added, so the caller re-checks it
 * rather than assuming the file on disk belongs to the new owner.
 */
export function diffStagedFiles(
  before: Map<string, { id: string }>,
  after: Map<string, CanvasComponent>,
): StagedFileDiff {
  const removed: StagedFileDiff['removed'] = []
  const added: StagedFileDiff['added'] = []
  for (const [path, prev] of before) {
    const next = after.get(path)
    if (!next || next.id !== prev.id) removed.push({ path, componentId: prev.id })
  }
  for (const [path, next] of after) {
    const prev = before.get(path)
    if (!prev || prev.id !== next.id) added.push({ path, component: next })
  }
  return { removed, added }
}

/**
 * Every component the board still uses: placed directly as an instance, or
 * nested inside another used component's variants.
 *
 * Instances only come from promotion and duplication — there is no component
 * library to place one from — so a component nothing reaches is unreachable
 * for good, not parked for later.
 */
export function referencedComponentIds(doc: CanvasDoc): Set<string> {
  const used = new Set<string>()
  const pending: string[] = []
  const visit = (nodes: CanvasNode[]) => {
    for (const node of nodes) {
      if (isInstanceNode(node) && !used.has(node.componentId)) {
        used.add(node.componentId)
        pending.push(node.componentId)
      }
      if (isFrameNode(node)) visit(node.children)
    }
  }
  visit(doc.nodes)
  while (pending.length > 0) {
    const component = doc.components.find((c) => c.id === pending.pop())
    if (component) for (const variant of component.variants) visit([variant.root])
  }
  return used
}

/**
 * Drops every component nothing on the board uses any more.
 *
 * What deleting a component's last instance means: without this, Delete on
 * the board left the definition behind, invisible, still claiming its file.
 * Returns the same doc object when nothing was dropped.
 */
export function pruneUnreferencedComponents(doc: CanvasDoc): CanvasDoc {
  const used = referencedComponentIds(doc)
  const components = doc.components.filter((c) => used.has(c.id))
  if (components.length === doc.components.length) return doc
  return { ...doc, components, updatedAt: Date.now() }
}

/**
 * The component a staged file was written from, read off its layout sentinel,
 * or null for a file the canvas did not write (or one whose region a human
 * removed). Deletion is only ever allowed for a file that names its owner, so
 * a hand-made file dropped into `.canvas` is never collateral.
 */
export function sentinelComponentId(source: string): string | null {
  return extractRegion(source)?.componentId ?? null
}
