// Registry of "how to run this folder's live preview" — one entry per
// prototype folder that's been auto-detected or manually configured (see
// sleipnir-backend.mjs's detectPreviewConfig and electron/preview.cjs's
// spawn logic). Mirrors the same read/write-JSON-manifest pattern as
// tools/widget-registry.mjs/tools/library-registry.mjs rather than
// inventing a new shape. Keyed by repo-relative folder path, not an id —
// there's exactly one config per folder, never a name collision to worry
// about the way widget/library ids need one.
import fs from 'node:fs'
import path from 'node:path'

const REPO_ROOT = process.cwd()
const REGISTRY_PATH = path.join(REPO_ROOT, 'src/00_planning/graph/preview-config.json')

export function readRegistry() {
  if (!fs.existsSync(REGISTRY_PATH)) return []
  try {
    return JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'))
  } catch {
    return []
  }
}

function writeRegistry(entries) {
  fs.mkdirSync(path.dirname(REGISTRY_PATH), { recursive: true })
  fs.writeFileSync(REGISTRY_PATH, JSON.stringify(entries, null, 2))
}

export function getPreviewConfig(folderPath) {
  return readRegistry().find((e) => e.path === folderPath) ?? null
}

// `command`/`args` follow node:child_process's own execFile shape (a
// command name + argv array, never a shell string) — same convention
// tools/git-control.mjs's `git(args)` helper and sleipnir-backend.mjs's
// `runCommand` already use, so electron/preview.cjs can spawn this directly
// without any shell-quoting/injection surface.
export function setPreviewConfig(folderPath, { command, args, port }) {
  if (!folderPath) {
    throw new Error('folderPath is required')
  }
  if (!command) {
    throw new Error('command is required')
  }
  const entries = readRegistry().filter((e) => e.path !== folderPath)
  const entry = { path: folderPath, command, args: args ?? [], port, configuredAt: Date.now() }
  writeRegistry([...entries, entry])
  return entry
}
