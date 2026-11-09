// A Canvas document on disk: where boards live, and how one is read and
// written — parsed, migrated forward and given its kind. Pure (no workspace
// IO), so the app and the agent CLI (.sleipnir/model.mjs, modeling/commands/)
// read and write boards exactly alike. store.ts does the IO around it.

import { DEFAULT_COMPONENT_ROOT, LEGACY_COMPONENT_ROOT } from '../../document/paths'
import { CANVAS_SCHEMA_VERSION, type CanvasDoc } from '../../document/types'
import { migrateLayerSolids } from '../../document/objects'
import { withKind } from '../../document/documentKind'

export const CANVAS_DIR = `${DEFAULT_COMPONENT_ROOT}/.boards`

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
  // A board saved before Objects keeps its solids on the layers; move them (document/objects.ts).
  // One saved before the two kinds says what it is now (document/documentKind.ts).
  return withKind(migrateLayerSolids({
    version: doc.version ?? CANVAS_SCHEMA_VERSION,
    id: doc.id,
    name: doc.name ?? 'Untitled',
    ...(doc.kind === 'sketch' || doc.kind === 'environment' ? { kind: doc.kind } : {}),
    nodes: doc.nodes,
    components: doc.components ?? [],
    // Dropping this silently undid "New folder" on every reload — the one
    // thing componentFolders exists to survive (see types.ts).
    ...(Array.isArray(doc.componentFolders) ? { componentFolders: doc.componentFolders } : {}),
    ...(Array.isArray(doc.objects) && doc.objects.length ? { objects: doc.objects } : {}),
    camera: doc.camera,
    createdAt: doc.createdAt ?? Date.now(),
    updatedAt: doc.updatedAt ?? Date.now(),
  }))
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
