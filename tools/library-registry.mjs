// Registry of "libraries" — component libraries (like the default
// 02_components) and prototype libraries (like the default 03_prototypes).
// Turns what used to be two hardcoded folder names into an open, growable
// set: adding a library means adding an entry here, not editing every tool
// that used to assume exactly one of each. Mirrors the read/write-JSON-
// manifest pattern already used for archive.json/notes.json in
// sleipnir-backend.mjs.
import fs from 'node:fs'
import path from 'node:path'

const REPO_ROOT = process.cwd()
const REGISTRY_PATH = path.join(REPO_ROOT, 'src/00_planning/graph/libraries.json')

const ID_RE = /^[a-z][a-z0-9-]*$/

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

export function getLibrary(id) {
  return readRegistry().find((lib) => lib.id === id)
}

export function listLibraries(kind) {
  const all = readRegistry()
  return kind ? all.filter((lib) => lib.kind === kind) : all
}

export function addLibrary({ id, kind, label, root, architecture, language }) {
  if (!ID_RE.test(id)) {
    throw new Error('Library id must be lowercase, starting with a letter (letters, digits, hyphens only)')
  }
  if (kind !== 'component' && kind !== 'prototype') {
    throw new Error(`Unknown library kind "${kind}" — expected "component" or "prototype"`)
  }
  const entries = readRegistry()
  if (entries.some((lib) => lib.id === id)) {
    throw new Error(`A library with id "${id}" already exists`)
  }
  if (entries.some((lib) => lib.root === root)) {
    throw new Error(`A library already uses root "${root}"`)
  }
  const entry = { id, kind, label, root, architecture, language, createdAt: Date.now() }
  writeRegistry([...entries, entry])
  return entry
}

// Registry-only — never touches the filesystem. Callers that also need to
// delete the library's files (tools/sleipnir-backend.mjs#deleteLibrary) do
// that separately, since this module has no notion of SRC_ROOT/resolveSafe.
export function removeLibraryEntry(id) {
  const entries = readRegistry()
  if (!entries.some((lib) => lib.id === id)) {
    throw new Error(`No library with id "${id}"`)
  }
  writeRegistry(entries.filter((lib) => lib.id !== id))
}

export function setLibraryArchitecture(id, architecture) {
  const entries = readRegistry()
  const entry = entries.find((lib) => lib.id === id)
  if (!entry) throw new Error(`No library with id "${id}"`)
  entry.architecture = architecture
  writeRegistry(entries)
  return entry
}

// Replaces the old hardcoded `id.startsWith('03_prototypes')` (generate-
// graph.mjs's typeForId) / `id.startsWith('02_components')` (this file's own
// cross-map borrow check) single-library assumptions — checks against every
// registered root of the given kind instead of one literal string.
export function isUnderAnyRoot(id, kind) {
  return listLibraries(kind).some((lib) => id === lib.root || id.startsWith(`${lib.root}/`))
}

export function isUnderAnyComponentRoot(id) {
  return isUnderAnyRoot(id, 'component')
}

export function isUnderAnyPrototypeRoot(id) {
  return isUnderAnyRoot(id, 'prototype')
}

// Which registered component library (if any) owns this id — used to tag
// cross-map borrow edges with the *actual* owning library instead of always
// assuming 'dsm'.
export function componentLibraryForId(id) {
  return listLibraries('component').find((lib) => id === lib.root || id.startsWith(`${lib.root}/`))
}
