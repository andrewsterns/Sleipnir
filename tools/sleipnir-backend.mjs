// Shared backend logic for Sleipnir's local dev-only file API — scaffold
// components, browse/read/write files, manage the archive manifest, and
// re-run tools/generate-graph.mjs. Framework-agnostic plain Node so both the
// Vite dev middleware (vite.config.ts, web transport) and the Electron main
// process (electron/main.cjs, IPC transport) can import and call it
// directly, instead of duplicating this logic per transport.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { isSourceFile } from './source-extensions.mjs'
import { LANGUAGES, DEFAULT_LANGUAGE } from './languages.mjs'

export { previewRefactor, applyRefactor, getCurrentArchitecture } from './refactor-engine.mjs'

export const REPO_ROOT = process.cwd()
export const SRC_ROOT = path.resolve(REPO_ROOT, 'src')

const TIER_DIR = {
  atoms: '01_atoms',
  molecules: '02_molecules',
  organisms: '03_organisms',
  templates: '04_templates',
  pages: '05_pages',
}

const NAME_RE = /^[A-Z][A-Za-z0-9]*$/
const SKIP_RE = /\.(stories|test|spec)\.tsx?$/

// Throws if the resolved path would escape `base` — the one place path
// containment is enforced for every operation below.
function resolveSafe(base, ...segments) {
  const resolved = path.resolve(base, ...segments)
  const relative = path.relative(base, resolved)
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Path escapes allowed root')
  }
  return resolved
}

// Maps each MVVM template file to the "part" it represents — lets callers
// scaffold a subset of the triplet (e.g. View only) instead of always all
// three. Keep in sync with tools/templates/mvvm/*.template's filenames.
const PART_FOR_TEMPLATE = {
  '__name__.tsx.template': 'view',
  '__name__ViewModel.tsx.template': 'viewModel',
  'i__name__.tsx.template': 'interface',
}

export function scaffoldComponent(name, tier, language = DEFAULT_LANGUAGE, parts = ['view', 'viewModel', 'interface']) {
  if (!NAME_RE.test(name)) {
    throw new Error('Name must be PascalCase (letters and digits only, starting with a capital)')
  }
  const lang = LANGUAGES[language]
  if (!lang) {
    throw new Error(`Unknown language "${language}" — expected one of ${Object.keys(LANGUAGES).join(', ')}`)
  }

  if (lang.mvvm) {
    // TypeScript: View/ViewModel/interface triplet (or a chosen subset of it)
    // under the usual atoms/molecules/organisms tiering.
    if (!parts.length) {
      throw new Error('Select at least one file to create (View, ViewModel, or Interface)')
    }
    const tierDir = TIER_DIR[tier]
    if (!tierDir) {
      throw new Error(`Unknown tier "${tier}" — expected one of ${Object.keys(TIER_DIR).join(', ')}`)
    }

    const targetDir = resolveSafe(SRC_ROOT, '02_components', tierDir, name)
    if (fs.existsSync(targetDir)) {
      throw new Error(`${path.relative(REPO_ROOT, targetDir)} already exists`)
    }

    const templatesDir = path.join(REPO_ROOT, 'tools/templates', lang.templateDir)
    fs.mkdirSync(targetDir, { recursive: true })

    const files = fs.readdirSync(templatesDir)
      .filter((file) => parts.includes(PART_FOR_TEMPLATE[file]))
      .map((file) => {
        const content = fs.readFileSync(path.join(templatesDir, file), 'utf8').replace(/{{name}}/g, name)
        const fileName = file.replace(/__name__/g, name).replace('.template', '')
        const outPath = path.join(targetDir, fileName)
        fs.writeFileSync(outPath, content)
        return path.relative(REPO_ROOT, outPath).replace(/\\/g, '/')
      })

    return { path: path.relative(REPO_ROOT, targetDir).replace(/\\/g, '/'), files }
  }

  // Other languages don't fit the atoms/molecules/organisms tiering (that's
  // this app's TSX design-system taxonomy) — scaffold a single file into
  // 03_prototypes instead, alongside this project's other free-form
  // experiments.
  const templatesDir = path.join(REPO_ROOT, 'tools/templates', lang.templateDir)
  const templateFile = fs.readdirSync(templatesDir)[0]
  const content = fs.readFileSync(path.join(templatesDir, templateFile), 'utf8').replace(/{{name}}/g, name)
  const fileName = `${name}.${lang.ext}`
  const outPath = resolveSafe(SRC_ROOT, '03_prototypes', fileName)
  if (fs.existsSync(outPath)) {
    throw new Error(`${path.relative(REPO_ROOT, outPath)} already exists`)
  }
  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  fs.writeFileSync(outPath, content)
  const relOut = path.relative(REPO_ROOT, outPath).replace(/\\/g, '/')
  return { path: relOut, files: [relOut] }
}

function buildTree(absDir, srcRelDir) {
  const entries = fs.readdirSync(absDir, { withFileTypes: true })
  const dirs = entries.filter((e) => e.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))
  const files = entries
    .filter((e) => e.isFile() && isSourceFile(e.name) && !SKIP_RE.test(e.name))
    .sort((a, b) => a.name.localeCompare(b.name))

  const dirNodes = dirs.map((d) => {
    const childSrcRel = `${srcRelDir}/${d.name}`
    const abs = path.join(absDir, d.name)
    return {
      name: d.name,
      path: childSrcRel,
      type: 'dir',
      createdAt: fs.statSync(abs).birthtimeMs,
      children: buildTree(abs, childSrcRel),
    }
  })

  const fileNodes = files.map((f) => ({
    name: f.name,
    path: `${srcRelDir}/${f.name}`,
    type: 'file',
    createdAt: fs.statSync(path.join(absDir, f.name)).birthtimeMs,
  }))

  return [...dirNodes, ...fileNodes]
}

export function listDir(relPath) {
  const dirPath = resolveSafe(SRC_ROOT, relPath || '02_components')
  return { tree: buildTree(dirPath, relPath || '02_components') }
}

export function readFile(relPath) {
  const filePath = resolveSafe(SRC_ROOT, relPath)
  return { content: fs.readFileSync(filePath, 'utf8') }
}

// Unlike createFile, this overwrites an existing file — the code editor's
// save action. Refuses to create a brand-new file (use createFile for that)
// so a typo'd path can't silently scaffold an unintended file.
export function writeFile(relPath, content) {
  const filePath = resolveSafe(SRC_ROOT, relPath)
  if (!fs.existsSync(filePath)) {
    throw new Error(`${relPath} does not exist`)
  }
  fs.writeFileSync(filePath, content)
}

const ARCHIVE_PATH = path.join(REPO_ROOT, 'src/00_planning/graph/archive.json')

function readArchive() {
  if (!fs.existsSync(ARCHIVE_PATH)) return []
  try {
    return JSON.parse(fs.readFileSync(ARCHIVE_PATH, 'utf8'))
  } catch {
    return []
  }
}

function writeArchive(entries) {
  fs.mkdirSync(path.dirname(ARCHIVE_PATH), { recursive: true })
  fs.writeFileSync(ARCHIVE_PATH, JSON.stringify(entries, null, 2))
}

export function createFile(relPath, content) {
  const filePath = resolveSafe(SRC_ROOT, relPath)
  if (fs.existsSync(filePath)) {
    throw new Error(`${relPath} already exists`)
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, content ?? '')
}

export function createDir(relPath) {
  const dirPath = resolveSafe(SRC_ROOT, relPath)
  if (fs.existsSync(dirPath)) {
    throw new Error(`${relPath} already exists`)
  }
  fs.mkdirSync(dirPath, { recursive: true })
}

export function getArchivedPaths() {
  return { entries: readArchive() }
}

export function setArchived(relPath, archived, label) {
  // Also validates relPath stays within SRC_ROOT, even though we only ever
  // store the relative string in the manifest.
  resolveSafe(SRC_ROOT, relPath)
  const entries = readArchive().filter((e) => e.path !== relPath)
  if (archived) {
    entries.push({ path: relPath, label: label ?? relPath, archivedAt: Date.now() })
  }
  writeArchive(entries)
  return { entries }
}

const NOTES_PATH = path.join(REPO_ROOT, 'src/00_planning/graph/notes.json')
const MAP_IDS = new Set(['dsm', 'prototypes', 'research', 'validation', 'todo'])

function readNotes() {
  if (!fs.existsSync(NOTES_PATH)) return []
  try {
    return JSON.parse(fs.readFileSync(NOTES_PATH, 'utf8'))
  } catch {
    return []
  }
}

function writeNotes(notes) {
  fs.mkdirSync(path.dirname(NOTES_PATH), { recursive: true })
  fs.writeFileSync(NOTES_PATH, JSON.stringify(notes, null, 2))
}

export function getNotes() {
  return { notes: readNotes() }
}

// User-created graph nodes with no backing file — plain ideas/tasks tracked
// directly from Planning's "+" flow, distinct from scaffoldComponent's
// atoms/molecules/organisms tiering. Always `kind: 'proposed'` (dashed in
// the graph), matching the same "not yet built" visual language as the
// hand-authored PROPOSED nodes.
export function addNote(map, label, description) {
  if (!MAP_IDS.has(map)) {
    throw new Error(`Unknown map "${map}" — expected one of ${[...MAP_IDS].join(', ')}`)
  }
  if (!label || !label.trim()) {
    throw new Error('Name is required')
  }
  const slug = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
  const node = {
    id: `note/${map}/${slug || 'note'}-${Date.now()}`,
    label: label.trim(),
    kind: 'proposed',
    map,
    type: 'note',
    description: description?.trim() || undefined,
  }
  const notes = readNotes()
  notes.push(node)
  writeNotes(notes)
  return { node }
}

export function regenerateGraph() {
  return new Promise((resolve, reject) => {
    execFile('node', ['tools/generate-graph.mjs'], { cwd: REPO_ROOT }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr || err.message))
      else resolve({ stdout })
    })
  })
}

const RUN_TIMEOUT_MS = 15_000

// Resolves once the process ends, one way or another — never rejects.
// `exitCode` is only ever `number | null` (matches RunResult): non-null for
// a process that actually ran and exited, null when it never got that far
// (command not found, or killed for running past RUN_TIMEOUT_MS).
function runCommand(command, args, options) {
  return new Promise((resolve) => {
    execFile(
      command,
      args,
      { timeout: RUN_TIMEOUT_MS, maxBuffer: 10 * 1024 * 1024, ...options },
      (err, stdout, stderr) => {
        if (!err) {
          resolve({ stdout, stderr, exitCode: 0 })
        } else if (typeof err.code === 'number') {
          resolve({ stdout, stderr, exitCode: err.code })
        } else {
          const reason = err.killed
            ? `Timed out after ${RUN_TIMEOUT_MS}ms and was killed`
            : err.message
          resolve({ stdout, stderr: stderr || reason, exitCode: null })
        }
      },
    )
  })
}

// One local-trusted process/toolchain per language, matching the single
// standalone-file scaffolds in tools/templates/{python,rust,go} — these are
// never the MVVM TypeScript components (those need a React runtime, not a
// standalone interpreter). Keep in sync with the RUNNABLE set that
// CodeEditorView reads to decide whether to show its Run button.
const RUNNERS = {
  py: (absPath) => runCommand('python', [absPath]),
  go: (absPath) => runCommand('go', ['run', absPath]),
  rs: async (absPath) => {
    const outPath = path.join(os.tmpdir(), `sleipnir-run-${Date.now()}${process.platform === 'win32' ? '.exe' : ''}`)
    const build = await runCommand('rustc', [absPath, '-o', outPath])
    if (build.exitCode !== 0) return build
    try {
      return await runCommand(outPath, [])
    } finally {
      fs.rm(outPath, { force: true }, () => {})
    }
  },
}

export function runScript(relPath) {
  const filePath = resolveSafe(SRC_ROOT, relPath)
  if (!fs.existsSync(filePath)) {
    throw new Error(`${relPath} does not exist`)
  }
  const ext = path.extname(filePath).slice(1)
  const runner = RUNNERS[ext]
  if (!runner) {
    throw new Error(`No runner configured for ".${ext}" files`)
  }
  return runner(filePath)
}
