// Persistence for canvas boards.
//
// Boards live at <workspace>/.canvas/.boards/<docId>.json — beside the
// component files they stage (.canvas/<name>/…), git-committable, travelling
// with the project. Never under .planning/: that folder is Planning's alone.
// The dot-prefixed `.boards` can't collide with a derived component folder
// (those are camelCase names — see paths.ts's deriveComponentPath).
//
// Boards used to live at .planning/canvas/; listDocs moves any found there
// (see migrateLegacyBoards).
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
  renameWorkspacePath,
  searchWorkspace,
  writeWorkspaceFile,
} from '../../00_planning/api/sleipnirApi'
import { collectImports } from '../emit/react'
import { spliceImports } from '../emit/region'
import type { FileTreeNode } from '../../00_planning/api/PlatformAPI'
import { DEFAULT_COMPONENT_ROOT, LEGACY_COMPONENT_ROOT, normalizeRelPath, parentDir } from './paths'
import { movedComponents, reconcileDeletedPath, relinkAfterMove } from './relink'
import { isStagedPath, sentinelComponentId } from './stagedFiles'
import { CANVAS_SCHEMA_VERSION, type CanvasDoc, type CanvasDocId, type CanvasDocSummary } from './types'

export const CANVAS_DIR = `${DEFAULT_COMPONENT_ROOT}/.boards`
const LEGACY_CANVAS_DIR = '.planning/canvas'

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
    raw = JSON.parse(renameLegacyPaths(content))
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
    // Dropping this silently undid "New folder" on every reload — the one
    // thing componentFolders exists to survive (see types.ts).
    ...(Array.isArray(doc.componentFolders) ? { componentFolders: doc.componentFolders } : {}),
    camera: doc.camera,
    createdAt: doc.createdAt ?? Date.now(),
    updatedAt: doc.updatedAt ?? Date.now(),
  }
}

/**
 * A board written before `.canvas` became `.components` names paths inside it
 * — components' componentRoot and filePath, image fills' src — under the old
 * folder. Every one is a JSON string starting with that folder, so they are
 * rewritten as strings, before parsing. A no-op on any current board.
 */
export function renameLegacyPaths(content: string): string {
  if (!content.includes(`"${LEGACY_COMPONENT_ROOT}`)) return content
  return content
    .split(`"${LEGACY_COMPONENT_ROOT}/`).join(`"${DEFAULT_COMPONENT_ROOT}/`)
    .split(`"${LEGACY_COMPONENT_ROOT}"`).join(`"${DEFAULT_COMPONENT_ROOT}"`)
}

/**
 * One-time rename of a project's `.canvas` folder to `.components` — boards,
 * staged component files and pasted images all move together, so every
 * relative import between them still resolves. Skipped when `.components`
 * already exists (never merged over); boards' own paths are rewritten as they
 * load (renameLegacyPaths).
 */
async function migrateCanvasFolder(): Promise<void> {
  const { tree } = await listWorkspaceDir('').catch(() => ({ tree: [] as { name: string; type: string }[] }))
  const has = (name: string) => tree.some((n) => n.name === name && n.type !== 'file')
  if (!has(LEGACY_COMPONENT_ROOT) || has(DEFAULT_COMPONENT_ROOT)) return
  try {
    await renameWorkspacePath(LEGACY_COMPONENT_ROOT, DEFAULT_COMPONENT_ROOT)
  } catch {
    // Locked or already moved — the next listDocs retries.
  }
}

/**
 * One-time move of boards from the old .planning/canvas/ location into
 * CANVAS_DIR, then removes the emptied folder so .planning carries no canvas
 * files. A board already present at the new location is never overwritten.
 * Best-effort per file — a failed move leaves that board where it was, to be
 * retried on the next listDocs.
 */
async function migrateLegacyBoards(): Promise<void> {
  const { tree: legacy } = await listWorkspaceDir(LEGACY_CANVAS_DIR).catch(() => ({ tree: [] as { type: string; name: string; path: string }[] }))
  const legacyBoards = legacy.filter((n) => n.type === 'file' && n.name.endsWith('.json'))
  if (legacyBoards.length === 0) return

  const { tree: current } = await listWorkspaceDir(CANVAS_DIR).catch(() => ({ tree: [] as { name: string }[] }))
  const existing = new Set(current.map((n) => n.name))
  for (const file of legacyBoards) {
    try {
      if (!existing.has(file.name)) {
        const { content } = await readWorkspaceFile(file.path)
        await writeWorkspaceFile(`${CANVAS_DIR}/${file.name}`, content)
      }
      await deleteWorkspacePath(file.path)
    } catch {
      // Leave it in place; the next listDocs retries.
    }
  }
  try {
    const { tree: rest } = await listWorkspaceDir(LEGACY_CANVAS_DIR)
    if (rest.length === 0) await deleteWorkspacePath(LEGACY_CANVAS_DIR)
  } catch {
    // Already gone, or not empty — nothing to clean up.
  }
}

export async function listDocs(): Promise<CanvasDocSummary[]> {
  await migrateCanvasFolder()
  await migrateLegacyBoards()
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
 * Removes `folder` if taking a component's file out of it left it empty.
 *
 * Promotion gives every component its own folder, so without this each removed
 * or relocated component leaves a hollow directory behind — one per discarded
 * experiment, in a tier built for experiments. Checked rather than
 * force-removed: a folder someone put their own files in is theirs.
 *
 * Never throws. An empty folder is cosmetic, and is not worth failing the
 * removal or rename that the human actually asked for.
 */
export async function pruneEmptyFolder(folder: string): Promise<void> {
  if (!folder) return
  try {
    const { tree } = await listWorkspaceDir(folder)
    if (tree.length === 0) await deleteWorkspacePath(folder)
  } catch {
    // Listing or removing failed — leave the folder; nothing depends on it.
  }
}

/**
 * Deletes one staged component file — but only if it is still the file the
 * canvas wrote for `componentId`.
 *
 * The sentinel check is what makes automatic deletion safe: a path the board
 * gave up may since have been reused by hand, or never have been written at
 * all, and neither of those is the canvas's to delete. Refuses anything
 * outside the staging tier outright (see stagedFiles.ts's isStagedPath).
 *
 * Returns the content it removed, so the caller can put it back byte for byte
 * on undo, or null when it left the path alone. Never throws: the board change
 * that asked for this has already happened.
 */
export async function deleteStagedFile(filePath: string, componentId: string): Promise<string | null> {
  if (!isStagedPath(filePath)) return null
  let content: string
  try {
    content = (await readWorkspaceFile(filePath)).content
  } catch {
    return null // already gone — nothing to do
  }
  if (sentinelComponentId(content) !== componentId) return null
  try {
    await deleteWorkspacePath(filePath)
  } catch {
    return null
  }
  await pruneEmptyFolder(parentDir(filePath))
  return content
}

const SENTINEL_NEEDLE = '<sleipnir:layout component="'
const SENTINEL_LINE_RE = /^[ \t]*\/\/ <sleipnir:layout component="([^"]*)"/

/**
 * Where the files for `ids` live now, found by the layout sentinel each one
 * carries — for components whose file was moved outside Sleipnir.
 *
 * The sentinel names its component, so this is a lookup rather than a guess:
 * a component is relocated only when exactly ONE file in the workspace claims
 * it. Two claimants (a copy, a worktree checkout) is ambiguous and left alone
 * for the human, never resolved by picking one. One workspace search covers
 * every id. Never throws — a failed search just finds nothing.
 */
export async function findRelocatedComponentFiles(ids: Iterable<string>): Promise<Map<string, string>> {
  const wanted = new Set(ids)
  const found = new Map<string, string>()
  if (wanted.size === 0) return found

  let matches: { path: string; lineText: string }[]
  try {
    matches = (await searchWorkspace(SENTINEL_NEEDLE, { limit: 5000 })).matches
  } catch {
    return found
  }

  const claimants = new Map<string, Set<string>>()
  for (const match of matches) {
    const id = SENTINEL_LINE_RE.exec(match.lineText)?.[1]
    if (!id || !wanted.has(id)) continue
    const path = normalizeRelPath(match.path)
    if (!claimants.has(id)) claimants.set(id, new Set())
    claimants.get(id)!.add(path)
  }
  for (const [id, paths] of claimants) {
    if (paths.size === 1) found.set(id, [...paths][0])
  }
  return found
}

/** Every file beneath `dir`, whether the listing came back nested or flat. */
async function walkFiles(dir: string): Promise<FileTreeNode[]> {
  const { tree } = await listWorkspaceDir(dir)
  const out: FileTreeNode[] = []
  const visit = async (nodes: FileTreeNode[]) => {
    for (const node of nodes) {
      if (node.type === 'file') out.push(node)
      else await visit(node.children ?? (await listWorkspaceDir(node.path)).tree)
    }
  }
  await visit(tree)
  return out
}

const SOURCE_FILE_RE = /\.(tsx?|jsx?|vue|svelte)$/i

/** A file this young may belong to a promotion whose board hasn't autosaved yet (another window's, say). */
const ORPHAN_MIN_AGE_MS = 60_000

/**
 * Deletes staged component files that no board owns any more — the drift left
 * behind before every board change kept `.canvas` in step (deleting a
 * component's last instance, flattening, undoing a promotion and deleting a
 * board all used to strand their file).
 *
 * Conservative on every axis, because it runs unprompted when a project opens:
 *
 *   - Aborts entirely if any board fails to parse. A board it can't read might
 *     own any of these files, and "unreadable" must never mean "unowned".
 *   - Deletes only files carrying a layout sentinel, so a hand-made file in
 *     `.canvas` is never touched, and only when NO board holds the component
 *     the sentinel names — a file a component merely lost track of (moved in
 *     another editor) is left for that component to be relinked to.
 *   - Skips anything created in the last minute.
 *
 * On Electron the delete goes to the OS trash, so even a wrong call is
 * recoverable. Returns the paths it removed.
 */
export async function sweepOrphanStagedFiles(): Promise<string[]> {
  let boardFiles: FileTreeNode[]
  try {
    boardFiles = (await listWorkspaceDir(CANVAS_DIR)).tree.filter((n) => n.type === 'file' && n.name.endsWith('.json'))
  } catch {
    return []
  }

  const ownedPaths = new Set<string>()
  const ownedIds = new Set<string>()
  for (const file of boardFiles) {
    let doc: CanvasDoc | null = null
    try {
      doc = parseDoc((await readWorkspaceFile(file.path)).content)
    } catch {
      doc = null
    }
    if (!doc) return []
    for (const component of doc.components) {
      ownedIds.add(component.id)
      if (component.filePath) ownedPaths.add(normalizeRelPath(component.filePath))
    }
  }

  let candidates: FileTreeNode[]
  try {
    candidates = await walkFiles(DEFAULT_COMPONENT_ROOT)
  } catch {
    return []
  }

  const removed: string[] = []
  const now = Date.now()
  for (const file of candidates) {
    const path = normalizeRelPath(file.path)
    if (!isStagedPath(path) || ownedPaths.has(path)) continue
    // Only source files carry a sentinel; reading `.canvas/assets/` images as
    // text would be slow and could never match.
    if (!SOURCE_FILE_RE.test(path)) continue
    if (file.createdAt && now - file.createdAt < ORPHAN_MIN_AGE_MS) continue
    let owner: string | null = null
    try {
      owner = sentinelComponentId((await readWorkspaceFile(path)).content)
    } catch {
      continue
    }
    if (!owner || ownedIds.has(owner)) continue
    if ((await deleteStagedFile(path, owner)) !== null) removed.push(path)
  }
  return removed
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
