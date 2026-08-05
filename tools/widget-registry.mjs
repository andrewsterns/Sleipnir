// Registry of NavRail widgets (e.g. the "Utils" folder browser) — one level
// above tools/library-registry.mjs's libraries: a library only ever adds a
// tab *inside* the existing Components/Prototypes rail items, a widget adds
// a whole new top-level rail entry. Mirrors that same read/write-JSON-
// manifest pattern (and the sibling archive.json/notes.json ones in
// sleipnir-backend.mjs) rather than inventing a new shape.
import fs from 'node:fs'
import path from 'node:path'

const REPO_ROOT = process.cwd()
const REGISTRY_PATH = path.join(REPO_ROOT, 'src/00_planning/graph/widgets.json')

const ID_RE = /^[a-z][a-z0-9-]*$/
const KINDS = new Set(['folder', 'tool'])

export function readRegistry() {
  if (!fs.existsSync(REGISTRY_PATH)) return []
  try {
    return JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'))
  } catch {
    return []
  }
}

export function writeRegistry(entries) {
  fs.mkdirSync(path.dirname(REGISTRY_PATH), { recursive: true })
  fs.writeFileSync(REGISTRY_PATH, JSON.stringify(entries, null, 2))
}

export function getWidget(id) {
  return readRegistry().find((w) => w.id === id)
}

export function listWidgets() {
  return readRegistry()
}

export function addWidget({ id, kind, label, tag, icon, root, rootScope, previewStrategy, readOnly, extraFiles, toolId }) {
  if (!ID_RE.test(id)) {
    throw new Error('Widget id must be lowercase, starting with a letter (letters, digits, hyphens only)')
  }
  if (!KINDS.has(kind)) {
    throw new Error(`Unknown widget kind "${kind}" — expected "folder" or "tool"`)
  }
  // A folder widget needs *something* to show — either a real backing
  // directory (root) or a curated file list (extraFiles), e.g. Nx's
  // nx.json/project.json splice with no single owning folder.
  if (kind === 'folder' && !root && !(extraFiles && extraFiles.length)) {
    throw new Error('Folder widgets require a "root" path and/or "extraFiles"')
  }
  if (kind === 'tool' && toolId !== 'docker' && toolId !== 'nx') {
    throw new Error('Tool widgets require a toolId of "docker" or "nx"')
  }
  const entries = readRegistry()
  if (entries.some((w) => w.id === id)) {
    throw new Error(`A widget with id "${id}" already exists`)
  }
  const entry = {
    id,
    kind,
    label,
    tag,
    icon,
    createdAt: Date.now(),
    ...(kind === 'folder'
      ? { root: root ?? '', rootScope: rootScope ?? 'src', previewStrategy: previewStrategy ?? 'none', readOnly: !!readOnly, extraFiles: extraFiles ?? [] }
      : { toolId }),
  }
  writeRegistry([...entries, entry])
  return entry
}
