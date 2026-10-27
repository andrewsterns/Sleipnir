// "What can the Play button run in this project?" — a pure filesystem read
// (no spawning) over the project root and its direct child folders, so a
// monorepo's `web/` or a repo's static `website/` show up alongside the root's
// own scripts. electron/preview.cjs does the actual running; this only names
// the candidates. Every target is a command + argv array the runner can spawn
// as-is, plus a `kind` that tells it what to wait for:
//
//   web    — a dev server; the runner waits for a local URL and embeds it.
//   app    — a desktop app / long-running program (Electron, `go run`, …);
//            it opens its own window, so there is no URL to wait for.
//   task   — any other script (build, test, lint); runs to completion.
//   static — a folder of HTML with no build step; served by the runner itself.
const fs = require('node:fs')
const path = require('node:path')

/** Script names a dev server conventionally hides behind, in "which one is THE dev command" order. */
const WEB_SCRIPT_NAMES = ['dev', 'start', 'serve', 'preview', 'develop']
const APP_RE = /\b(electron|tauri|neutralino|nw)\b/i
const WEB_RE = /\b(vite|next|nuxt|astro|remix|react-scripts|webpack-dev-server|webpack\s+serve|parcel|svelte-kit|ng\s+serve|vue-cli-service\s+serve|gatsby\s+develop|http-server|live-server|serve|storybook|eleventy\s+--serve|expo\s+start)\b/i
// npm lifecycle hooks run on their own around install/publish — never
// something a human means to "play".
const LIFECYCLE = new Set(['prepare', 'preinstall', 'install', 'postinstall', 'prepublish', 'prepublishOnly', 'prepack', 'postpack'])
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'out', 'release', 'coverage', 'target', 'vendor', '__pycache__'])
const MAX_CHILD_DIRS = 40
const KIND_ORDER = { web: 0, app: 1, static: 2, task: 3 }

function exists(p) {
  try {
    fs.accessSync(p)
    return true
  } catch {
    return false
  }
}

function readJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'))
  } catch {
    return null
  }
}

/** The package manager a folder's lockfile commits it to — npm when there's none. Checks `dir`, then `root` (a workspace's lockfile lives at the top). */
function packageManager(dir, root = dir) {
  for (const d of dir === root ? [dir] : [dir, root]) {
    if (exists(path.join(d, 'pnpm-lock.yaml'))) return 'pnpm'
    if (exists(path.join(d, 'yarn.lock'))) return 'yarn'
    if (exists(path.join(d, 'bun.lockb')) || exists(path.join(d, 'bun.lock'))) return 'bun'
    if (exists(path.join(d, 'package-lock.json'))) return 'npm'
  }
  return 'npm'
}

// `vite build`, `next lint`, `electron-builder --publish` name a dev tool but
// run to completion — checked before the app/web tests for that reason.
const TASK_RE = /\b(build|builder|test|lint|export|generate|check|typecheck|format|publish|release|dist|pack|package|deploy)\b/i

function classifyScript(name, command) {
  if (WEB_SCRIPT_NAMES.includes(name)) return 'web'
  if (TASK_RE.test(name) || TASK_RE.test(command)) return 'task'
  if (APP_RE.test(name) || APP_RE.test(command)) return 'app'
  if (WEB_RE.test(command)) return 'web'
  return 'task'
}

/** `pre<x>`/`post<x>` hooks that only exist to wrap another script. */
function isHook(name, scripts) {
  const m = /^(pre|post)(.+)$/.exec(name)
  return !!m && m[2] in scripts
}

function scriptTargets(dir, rel, root) {
  const pkg = readJson(path.join(dir, 'package.json'))
  const scripts = pkg && typeof pkg.scripts === 'object' && pkg.scripts ? pkg.scripts : {}
  const pm = packageManager(dir, root)
  return Object.entries(scripts)
    .filter(([name, cmd]) => typeof cmd === 'string' && !LIFECYCLE.has(name) && !isHook(name, scripts))
    .map(([name, cmd]) => ({
      id: `${rel || '.'}:script:${name}`,
      label: name,
      dir: rel,
      kind: classifyScript(name, cmd),
      command: pm,
      args: ['run', name],
      detail: cmd,
      usesPackageManager: true,
    }))
}

function otherTargets(dir, rel) {
  const targets = []
  const add = (key, label, kind, command, args, detail) =>
    targets.push({ id: `${rel || '.'}:${key}`, label, dir: rel, kind, command, args, detail })
  const python = process.platform === 'win32' ? 'python' : 'python3'

  if (exists(path.join(dir, 'manage.py'))) {
    add('django', 'manage.py runserver', 'web', python, ['manage.py', 'runserver'], 'Django dev server')
  }
  for (const file of ['app.py', 'main.py']) {
    if (exists(path.join(dir, file))) add(file, file, 'app', python, [file], `${python} ${file}`)
  }
  if (exists(path.join(dir, 'go.mod'))) add('go', 'go run .', 'app', 'go', ['run', '.'], 'Go module')
  if (exists(path.join(dir, 'Cargo.toml'))) add('cargo', 'cargo run', 'app', 'cargo', ['run'], 'Rust crate')
  // A folder with its own package.json builds its HTML through that, so its
  // index.html is a template, not something to serve raw.
  if (exists(path.join(dir, 'index.html')) && !exists(path.join(dir, 'package.json'))) {
    add('static', 'index.html', 'static', '__static__', [], 'Static site')
  }
  return targets
}

function childDirs(root) {
  try {
    return fs.readdirSync(root, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith('.') && !SKIP_DIRS.has(e.name))
      .map((e) => e.name)
      .sort()
      .slice(0, MAX_CHILD_DIRS)
  } catch {
    return []
  }
}

/**
 * Everything runnable in `root` and its direct child folders — root first,
 * then within a folder dev servers before apps, static sites and tasks, and
 * dev servers in WEB_SCRIPT_NAMES order. `defaultId` is the one a first-time
 * Play should pick.
 */
function detectTargets(root) {
  if (!root || !exists(root)) return { targets: [], defaultId: null }
  const folders = ['', ...childDirs(root)]
  const targets = []
  for (const rel of folders) {
    const dir = path.join(root, rel)
    const found = [...scriptTargets(dir, rel, root), ...otherTargets(dir, rel)]
    found.sort((a, b) => {
      const byKind = KIND_ORDER[a.kind] - KIND_ORDER[b.kind]
      if (byKind !== 0) return byKind
      const rank = (t) => (t.kind === 'web' && WEB_SCRIPT_NAMES.includes(t.label) ? WEB_SCRIPT_NAMES.indexOf(t.label) : 99)
      return rank(a) - rank(b)
    })
    targets.push(...found)
  }
  const preferred = targets.find((t) => t.kind === 'web') ?? targets.find((t) => t.kind === 'app' || t.kind === 'static') ?? targets[0]
  return { targets, defaultId: preferred?.id ?? null }
}

/** A command line the human typed themselves — run through the shell as written, from `rel` (a project-relative folder, '' for the root). */
function customTarget(commandLine, rel = '') {
  return {
    id: `${rel || '.'}:custom`,
    label: commandLine,
    dir: rel,
    kind: 'web',
    command: commandLine,
    args: [],
    detail: 'Custom command',
    shellLine: true,
  }
}

module.exports = { detectTargets, customTarget, packageManager, classifyScript }
