// Path containment for canvas-written component files.
//
// The canvas is structurally incapable of writing outside one directory: every
// write path (approve, emit, live push) resolves through here first, and a path
// that escapes the component root is REFUSED, never silently corrected.
//
// This mirrors resolveSafe() in tools/sleipnir-backend.mjs, but runs in the
// renderer so a bad path never even reaches an API call. Both checks are kept —
// the backend one is the real security boundary for every transport; this one is
// the product guarantee that the Canvas feature can't touch your project outside
// its own folder.
//
// Deliberately pure string work: no fs, no API, so it is exhaustively testable.

import { toCamelCase } from '../../00_planning/graph/naming'

/**
 * Default sandbox for newly created canvas components, relative to the
 * workspace root.
 *
 * A dot-folder ON PURPOSE, and this is the one place that decision is
 * explained. `.canvas` is a STAGING tier, not build input: every frame you
 * promote lands here immediately with no ceremony, which means most of what
 * accumulates is experiments you will throw away. A leading-dot directory sits
 * outside a typical project's tsconfig `include` (TypeScript's default glob
 * skips dot-directories) and outside ESLint's default ignore — so staged
 * components are neither typechecked nor linted, which is exactly right for
 * code that is not part of the app yet.
 *
 * A component becomes real by being MOVED out of here in the Workspace tree,
 * at which point the board relinks it and widens its `componentRoot` to the
 * destination (see model/relink.ts). From then on it lives in a real, tooling-
 * visible source directory and is typechecked like anything else.
 *
 * `componentRoot` is per-component precisely so those two tiers can coexist:
 * anything still staged is contained to `.canvas`, anything promoted is
 * contained to wherever you put it.
 */
export const DEFAULT_COMPONENT_ROOT = '.components'
/** Where the staging tier lived before it was renamed — see store.ts's migrateCanvasFolder. */
export const LEGACY_COMPONENT_ROOT = '.canvas'

export class PathEscapeError extends Error {
  constructor(
    readonly attempted: string,
    readonly root: string,
  ) {
    super(`"${attempted}" escapes the component root "${root}"`)
    this.name = 'PathEscapeError'
  }
}

/**
 * Normalizes a workspace-relative path to forward slashes with no leading,
 * trailing, or repeated separators, and no `.` segments. Does NOT resolve `..`
 * — that is the caller's decision (see isContained, which treats any surviving
 * `..` as an escape rather than resolving it away).
 *
 * Segments are trimmed, and whitespace-only segments are dropped entirely: a
 * path like "   " or "card/  /view.tsx" is meaningless, and letting it through
 * would create directories whose names are invisible in the UI and unopenable
 * on Windows.
 */
export function normalizeRelPath(input: string): string {
  return input
    .replace(/\\/g, '/')
    .split('/')
    .map((segment) => segment.trim())
    .filter((segment) => segment !== '' && segment !== '.')
    .join('/')
}

/** True for a path that is absolute in either POSIX or Windows terms, or a URL-ish scheme. */
export function isAbsoluteLike(input: string): boolean {
  const path = input.replace(/\\/g, '/')
  return path.startsWith('/') || /^[a-zA-Z]:\//.test(path) || /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(path)
}

/**
 * True when `rel` resolves to a location at or beneath `root`.
 *
 * `..` is rejected outright rather than resolved: a path that needs to climb to
 * land inside the root is a caller bug, and resolving it would mean silently
 * accepting `src/components/../components/x` — which works, but the next variant
 * of that string won't, and this needs to be predictable rather than clever.
 */
export function isContained(root: string, rel: string): boolean {
  if (isAbsoluteLike(rel)) return false
  const normalized = normalizeRelPath(rel)
  if (normalized === '') return false
  if (normalized.split('/').includes('..')) return false

  const normalizedRoot = normalizeRelPath(root)
  if (normalizedRoot === '') return true // an empty root means the whole workspace
  return normalized === normalizedRoot || normalized.startsWith(`${normalizedRoot}/`)
}

/**
 * Resolves a component file path, guaranteeing containment.
 *
 * Accepts either a path already rooted at the component root
 * ('src/components/card/cardView.tsx') or one relative to it ('card/cardView.tsx'),
 * so the Create Component modal can show a friendly relative path while callers
 * still get a workspace-relative one back.
 *
 * @throws PathEscapeError if the result would land outside the root.
 */
export function resolveComponentPath(root: string, rel: string): string {
  if (isAbsoluteLike(rel)) throw new PathEscapeError(rel, root)

  const normalizedRoot = normalizeRelPath(root)
  const normalized = normalizeRelPath(rel)
  if (normalized === '') throw new PathEscapeError(rel, root)
  if (normalized.split('/').includes('..')) throw new PathEscapeError(rel, root)

  const full =
    normalizedRoot === '' || normalized === normalizedRoot || normalized.startsWith(`${normalizedRoot}/`)
      ? normalized
      : `${normalizedRoot}/${normalized}`

  if (!isContained(root, full)) throw new PathEscapeError(rel, root)
  return full
}

/** `<camelName>.tsx`, matching naming.ts's file-name convention minus the role. */
export function componentFileName(name: string): string {
  return `${toCamelCase(name)}.tsx`
}

/** Everything above the last segment. `''` for a path with no parent. */
export function parentDir(path: string): string {
  const segments = normalizeRelPath(path).split('/')
  segments.pop()
  return segments.join('/')
}

/**
 * Where a component named `name` lands by default: its own folder beneath the
 * root, holding one same-named file.
 *
 * The single source of truth for that shape. Both the automatic write on
 * promote and the Create Component modal's preview call this, so the path the
 * modal shows can never drift from the path the writer uses.
 *
 * @throws PathEscapeError for a name that slugs to nothing.
 */
export function deriveComponentPath(root: string, name: string): string {
  return resolveComponentPath(root, `${toCamelCase(name)}/${componentFileName(name)}`)
}

/**
 * `deriveComponentPath`, stepped past paths already spoken for.
 *
 * Promotion is automatic now, so duplicate names are routine rather than
 * exceptional — two frames both left as "Frame" would otherwise derive one
 * path and the second write would fail with "already exists". The folder takes
 * the suffix rather than the file, so the file keeps the name that matches its
 * exported symbol: `.canvas/frame/frame.tsx`, then `.canvas/frame-2/frame.tsx`.
 *
 * `taken` is whatever the caller knows about (the board's own components);
 * files present on disk but absent from the board are caught by the caller's
 * retry on a rejected write, not here.
 */
export function deconflictComponentPath(root: string, name: string, taken: Iterable<string>): string {
  const used = new Set(taken)
  const base = deriveComponentPath(root, name)
  if (!used.has(base)) return base

  const slug = toCamelCase(name)
  const fileName = componentFileName(name)
  for (let n = 2; ; n += 1) {
    const candidate = resolveComponentPath(root, `${slug}-${n}/${fileName}`)
    if (!used.has(candidate)) return candidate
  }
}

/** The path relative to the component root, for display. Assumes containment. */
export function relativeToRoot(root: string, path: string): string {
  const normalizedRoot = normalizeRelPath(root)
  const normalized = normalizeRelPath(path)
  if (normalizedRoot === '') return normalized
  if (normalized === normalizedRoot) return ''
  return normalized.startsWith(`${normalizedRoot}/`) ? normalized.slice(normalizedRoot.length + 1) : normalized
}

/**
 * Import specifier from one workspace-relative file to another — always
 * './'-prefixed and extension-less, matching how the repo's own imports are
 * written (see graph/importAdapters).
 */
export function relativeImportPath(fromFile: string, toFile: string): string {
  const from = normalizeRelPath(fromFile).split('/').slice(0, -1)
  const to = normalizeRelPath(toFile).split('/')
  const toFileName = to.pop()!.replace(/\.(tsx|ts|jsx|js)$/, '')

  let shared = 0
  while (shared < from.length && shared < to.length && from[shared] === to[shared]) shared += 1

  const up = from.slice(shared).map(() => '..')
  const down = to.slice(shared)
  const segments = [...up, ...down, toFileName]
  const joined = segments.join('/')
  return joined.startsWith('.') ? joined : `./${joined}`
}
