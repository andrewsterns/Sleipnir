// The components directory — a mirror of the component root's folder structure
// showing ONLY canvas components.
//
// It is derived, not stored: every folder that holds a component comes from that
// component's own filePath, so the tree can never disagree with what is actually
// on disk. The single exception is `doc.componentFolders`, which records folders
// you created before putting anything in them — otherwise "New folder" would
// disappear on reload.
//
// Pure: no React, no fs. Everything here is unit-tested.

import { normalizeRelPath, relativeToRoot } from './paths'
import type { CanvasComponent, CanvasDoc } from './types'

export interface ComponentTreeFolder {
  kind: 'folder'
  /** Path relative to the component root, e.g. 'buttons/primary'. */
  path: string
  name: string
  children: ComponentTreeNode[]
}

export interface ComponentTreeLeaf {
  kind: 'component'
  /** Path relative to the component root, including the file name. */
  path: string
  name: string
  component: CanvasComponent
}

export type ComponentTreeNode = ComponentTreeFolder | ComponentTreeLeaf

/**
 * Where a component sits in the tree.
 *
 * A component with no file yet has nowhere to live on disk, so it is grouped
 * under `unplaced` rather than being invented a folder — showing it at the root
 * would imply a path it does not have.
 */
export function componentDir(component: CanvasComponent): string | null {
  if (!component.filePath) return null
  const relative = relativeToRoot(component.componentRoot, component.filePath)
  const segments = normalizeRelPath(relative).split('/').filter(Boolean)
  segments.pop() // drop the file name
  return segments.join('/')
}

function componentFileName(component: CanvasComponent): string {
  if (!component.filePath) return component.name
  return normalizeRelPath(component.filePath).split('/').pop() ?? component.name
}

/** Inserts `path`'s folder chain into the tree, returning the deepest folder. */
function ensureFolder(root: ComponentTreeFolder, path: string): ComponentTreeFolder {
  const segments = normalizeRelPath(path).split('/').filter(Boolean)
  let current = root
  let accumulated = ''
  for (const segment of segments) {
    accumulated = accumulated ? `${accumulated}/${segment}` : segment
    let next = current.children.find(
      (child): child is ComponentTreeFolder => child.kind === 'folder' && child.name === segment,
    )
    if (!next) {
      next = { kind: 'folder', path: accumulated, name: segment, children: [] }
      current.children.push(next)
    }
    current = next
  }
  return current
}

function sortTree(folder: ComponentTreeFolder): void {
  // Folders before components, then alphabetical — the same ordering the
  // Workspace file tree uses, so the two read the same way.
  folder.children.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1
    return a.name.localeCompare(b.name)
  })
  for (const child of folder.children) {
    if (child.kind === 'folder') sortTree(child)
  }
}

export interface ComponentTree {
  root: ComponentTreeFolder
  /** Components with no file on disk yet, so they belong to no folder. */
  unplaced: ComponentTreeLeaf[]
}

export function buildComponentTree(doc: CanvasDoc): ComponentTree {
  const root: ComponentTreeFolder = { kind: 'folder', path: '', name: '', children: [] }
  const unplaced: ComponentTreeLeaf[] = []

  // Explicit empty folders first, so they exist even with nothing inside.
  for (const folder of doc.componentFolders ?? []) {
    const normalized = normalizeRelPath(folder)
    if (normalized) ensureFolder(root, normalized)
  }

  for (const component of doc.components) {
    const leaf: ComponentTreeLeaf = {
      kind: 'component',
      path: component.filePath ? relativeToRoot(component.componentRoot, component.filePath) : component.name,
      name: componentFileName(component),
      component,
    }
    const dir = componentDir(component)
    if (dir === null) {
      unplaced.push(leaf)
      continue
    }
    const parent = dir === '' ? root : ensureFolder(root, dir)
    parent.children.push(leaf)
  }

  sortTree(root)
  unplaced.sort((a, b) => a.name.localeCompare(b.name))
  return { root, unplaced }
}

/**
 * Adds a folder, returning the updated list.
 *
 * Idempotent, and rejects anything that isn't a clean relative path — this
 * feeds directly into a real filesystem path, so a `..` here would be a way to
 * point the tree outside the sandbox.
 */
export function addComponentFolder(doc: CanvasDoc, path: string): string[] {
  const normalized = normalizeRelPath(path)
  const existing = doc.componentFolders ?? []
  if (!normalized) return existing
  if (normalized.split('/').includes('..')) return existing
  if (existing.includes(normalized)) return existing
  return [...existing, normalized]
}

/**
 * Removes a folder record. Only affects `componentFolders` — a folder that
 * still holds components keeps showing up, because it is derived from those
 * components' paths and removing it here would be a lie.
 */
export function removeComponentFolder(doc: CanvasDoc, path: string): string[] {
  const normalized = normalizeRelPath(path)
  return (doc.componentFolders ?? []).filter((f) => f !== normalized && !f.startsWith(`${normalized}/`))
}

/** Every folder path in the tree, for the "move to folder" autocomplete. */
export function allFolderPaths(tree: ComponentTree): string[] {
  const out: string[] = []
  const walk = (folder: ComponentTreeFolder) => {
    for (const child of folder.children) {
      if (child.kind !== 'folder') continue
      out.push(child.path)
      walk(child)
    }
  }
  walk(tree.root)
  return out.sort()
}
