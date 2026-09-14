// Persistence for canvas boards.
//
// Boards live at <workspace>/.planning/canvas/<docId>.json — beside the plans
// they map to, git-committable, travelling with the project, exactly the
// rationale the backend states for .planning/ itself.
//
// Deliberately built on the GENERIC workspace file API rather than dedicated
// PlatformAPI methods. writeWorkspaceFile is an upsert that mkdir -p's its
// parent, and listWorkspaceDir returns { tree: [] } for a directory that
// doesn't exist yet rather than throwing — so boards need no backend work at
// all, and none of the seven-file hand-maintained transport-parity tax
// (ARCHITECTURE.md §1). ResearchView already proves this pattern by rooting the
// same generic API at `.research`.
//
// Add typed getCanvasDoc/putCanvasDoc methods later only if server-side
// validation or an atomic multi-file write is genuinely needed.

import {
  deleteWorkspacePath,
  listWorkspaceDir,
  readWorkspaceFile,
  writeWorkspaceFile,
} from '../../00_planning/api/sleipnirApi'
import { collectImports } from '../emit/react'
import { spliceImports } from '../emit/region'
import { movedComponents, reconcileDeletedPath, relinkAfterMove } from './relink'
import { CANVAS_SCHEMA_VERSION, type CanvasDoc, type CanvasDocId, type CanvasDocSummary } from './types'

export const CANVAS_DIR = '.planning/canvas'

export function canvasDocPath(id: string): string {
  return `${CANVAS_DIR}/${id}.json`
}

/**
 * Content hash of a serialized doc. Used to suppress the watcher self-echo:
 * our own autosave fires planning:changed, and reloading from it would stomp
 * whatever the user typed in the ~200ms since.
 */
export function hashContent(content: string): string {
  // FNV-1a. Not cryptographic — this only needs to detect "same bytes".
  let h = 0x811c9dc5
  for (let i = 0; i < content.length; i += 1) {
    h ^= content.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(36)
}

export function serializeDoc(doc: CanvasDoc): string {
  return JSON.stringify(doc, null, 2)
}

/**
 * Parses and migrates a stored doc forward.
 *
 * Returns null rather than throwing on malformed JSON: one corrupt board must
 * not take down the whole board list. The caller surfaces it as an unreadable
 * entry.
 */
export function parseDoc(content: string): CanvasDoc | null {
  let raw: unknown
  try {
    raw = JSON.parse(content)
  } catch {
    return null
  }
  if (!raw || typeof raw !== 'object') return null
  const doc = raw as Partial<CanvasDoc>
  if (!doc.id || !Array.isArray(doc.nodes)) return null
  return {
    version: doc.version ?? CANVAS_SCHEMA_VERSION,
    id: doc.id,
    name: doc.name ?? 'Untitled',
    nodes: doc.nodes,
    components: doc.components ?? [],
    camera: doc.camera,
    createdAt: doc.createdAt ?? Date.now(),
    updatedAt: doc.updatedAt ?? Date.now(),
  }
}

export async function listDocs(): Promise<CanvasDocSummary[]> {
  const { tree } = await listWorkspaceDir(CANVAS_DIR)
  const files = tree.filter((n) => n.type === 'file' && n.name.endsWith('.json'))
  const summaries = await Promise.all(
    files.map(async (file) => {
      try {
        const { content } = await readWorkspaceFile(file.path)
        const doc = parseDoc(content)
        if (!doc) return null
        return {
          id: doc.id,
          name: doc.name,
          updatedAt: doc.updatedAt,
          componentFilePaths: doc.components.flatMap((c) => (c.filePath ? [c.filePath] : [])),
        }
      } catch {
        return null
      }
    }),
  )
  return summaries
    .filter((s): s is CanvasDocSummary => s !== null)
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

/** filePath -> the board that owns it — for "Show in Canvas" links elsewhere in the app, resolved from the already-loaded doc summaries (see listDocs' componentFilePaths), no extra read. */
export function findBoardForFilePath(docs: CanvasDocSummary[], filePath: string): CanvasDocId | null {
  return docs.find((d) => d.componentFilePaths.includes(filePath))?.id ?? null
}

export async function loadDoc(id: string): Promise<CanvasDoc | null> {
  try {
    const { content } = await readWorkspaceFile(canvasDocPath(id))
    return parseDoc(content)
  } catch {
    return null
  }
}

/** Returns the hash of what was written, for the watcher self-echo guard. */
export async function saveDoc(doc: CanvasDoc): Promise<string> {
  const content = serializeDoc(doc)
  await writeWorkspaceFile(canvasDocPath(doc.id), content)
  return hashContent(content)
}

export async function deleteDoc(id: string): Promise<void> {
  await deleteWorkspacePath(canvasDocPath(id))
}

/**
 * Reattaches every board to a file that just moved in the Workspace tree.
 *
 * This is the I/O half of promote-by-move (the pure half is model/relink.ts).
 * Called after the tree has already moved the bytes, so it never moves a file
 * itself — it updates the boards that were pointing at the old location, and
 * repairs the imports inside the files that moved.
 *
 * Sweeps every board, not just the open one: a component's file can be moved
 * while a different board is on screen, or none at all.
 *
 * Best-effort per board and per file. A board that fails to save, or a moved
 * file that can't be read back, must not abort the boards after it — the tree
 * mutation has already happened and a thrown error here would leave a
 * half-reconciled workspace with no way to retry.
 */
export async function reconcileMove(from: string, to: string): Promise<void> {
  const docs = await listDocs()
  for (const summary of docs) {
    try {
      const doc = await loadDoc(summary.id)
      if (!doc) continue
      const moved = movedComponents(doc, from, to)
      if (moved.length === 0) continue

      const next = relinkAfterMove(doc, from, to)
      // Save the board FIRST: it is the record of where things live now, and a
      // failed import repair below is recoverable (edit the import) in a way a
      // lost relink is not (the component is orphaned with no trace of why).
      await saveDoc(next)

      for (const { component } of moved) {
        const relinked = next.components.find((c) => c.id === component.id)
        if (!relinked?.filePath) continue
        try {
          await rewriteImports(next, relinked.filePath, relinked.id)
        } catch {
          // Unreadable/vanished file — the board is still correct, and the
          // next push surfaces the problem against the real path.
        }
      }
    } catch {
      // Malformed board, or a write that lost a race with the app's own
      // autosave — skip it rather than stall the whole sweep.
    }
  }
}

/**
 * Reconciles every board to a path deleted in the Workspace tree.
 *
 * Without this, deleting a component's file from the tree left the board
 * pointing at it until the next board load — the same class of gap as a move
 * with no relink, just quieter. `isDir` deletions cascade to everything beneath
 * the folder.
 *
 * Best-effort per board, for the same reason reconcileMove is: the file is
 * already gone, and one unreadable board must not stop the rest being fixed.
 */
export async function reconcileDelete(deletedPath: string): Promise<void> {
  const docs = await listDocs()
  for (const summary of docs) {
    try {
      const doc = await loadDoc(summary.id)
      if (!doc) continue
      const next = reconcileDeletedPath(doc, deletedPath)
      if (next === doc) continue
      await saveDoc(next)
    } catch {
      // Malformed board, or a write that lost a race with an autosave.
    }
  }
}

/**
 * Recomputes a component file's import block from where every component lives
 * NOW, and splices it in.
 *
 * Needed because a relative specifier encodes both ends of a relationship: when
 * either the importing file or an imported one moves, the string is stale even
 * though nothing about the design changed. `spliceImports` touches only the
 * leading import run, so the props interface, the canvas region, and every line
 * of hand-written code survive byte for byte.
 */
async function rewriteImports(doc: CanvasDoc, filePath: string, componentId: string): Promise<void> {
  const component = doc.components.find((c) => c.id === componentId)
  if (!component) return

  const imports = collectImports(component, {
    filePath,
    components: doc.components,
    filePathFor: (id) => doc.components.find((c) => c.id === id)?.filePath,
  })

  const { content } = await readWorkspaceFile(filePath)
  const next = spliceImports(content, imports)
  if (next !== content) await writeWorkspaceFile(filePath, next)
}
