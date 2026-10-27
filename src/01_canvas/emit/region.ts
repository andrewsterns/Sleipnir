// The canvas-owned region: sentinel comments delimiting the one part of a
// component file the canvas writes and reads.
//
// This is the load-bearing safety module of the whole sync feature. Everything
// OUTSIDE the sentinels — imports, hooks, handlers, helpers, comments, exports —
// is human-owned and must survive a re-emit byte for byte. A bug here silently
// eats someone's code, so this file is deliberately pure string manipulation
// with no parsing, no regex over the whole document, and exhaustive tests.
//
// Format:
//
//     // <sleipnir:layout component="cmp_7a3f" hash="k2f9x1">
//     …canvas-owned JSX…
//     // </sleipnir:layout>
//
// `hash` is the hash of the inner content as we last wrote it. It is the
// self-echo guard (a watcher event whose region hashes to this is our own write
// coming back) and the drift detector (a mismatch means a human edited it).

export const REGION_OPEN_PREFIX = '// <sleipnir:layout'
export const REGION_CLOSE = '// </sleipnir:layout>'

export interface ExtractedRegion {
  componentId: string
  /** Hash recorded in the sentinel — what the canvas believes it last wrote. */
  hash: string
  /** The region's content, with the region's own indentation removed. */
  inner: string
  /** Leading whitespace of the opening sentinel line, reapplied on splice. */
  indent: string
  /** Character offsets of the full region including both sentinel lines. */
  start: number
  end: number
}

/** Matches only the opening sentinel LINE, anchored per-line, never across the file. */
const OPEN_RE = /^([ \t]*)\/\/ <sleipnir:layout component="([^"]*)"(?:\s+hash="([^"]*)")?>[ \t]*$/
const CLOSE_RE = /^([ \t]*)\/\/ <\/sleipnir:layout>[ \t]*$/

/**
 * Finds the canvas-owned region in a source file.
 *
 * Returns null when there is no region (a hand-written file, or one the user
 * detached) — that is a normal outcome, not an error. Also returns null for a
 * malformed region (an open with no close), because splicing into a region
 * whose bounds we cannot trust is exactly how a file gets corrupted.
 */
export function extractRegion(source: string): ExtractedRegion | null {
  const lines = source.split('\n')

  let openLine = -1
  let componentId = ''
  let hash = ''
  let indent = ''
  for (let i = 0; i < lines.length; i += 1) {
    const match = OPEN_RE.exec(lines[i])
    if (match) {
      // A second opening sentinel means the file is in a state we did not
      // create; refuse rather than guess which one is authoritative.
      if (openLine !== -1) return null
      openLine = i
      indent = match[1]
      componentId = match[2]
      hash = match[3] ?? ''
    }
  }
  if (openLine === -1) return null

  let closeLine = -1
  for (let i = openLine + 1; i < lines.length; i += 1) {
    if (CLOSE_RE.test(lines[i])) {
      closeLine = i
      break
    }
  }
  if (closeLine === -1) return null

  const innerLines = lines.slice(openLine + 1, closeLine)
  const inner = stripIndent(innerLines, indent).join('\n')

  // Character offsets: sum of preceding line lengths plus their newlines.
  const start = offsetOfLine(lines, openLine)
  const end = offsetOfLine(lines, closeLine) + lines[closeLine].length

  return { componentId, hash, inner, indent, start, end }
}

function offsetOfLine(lines: string[], index: number): number {
  let offset = 0
  for (let i = 0; i < index; i += 1) offset += lines[i].length + 1
  return offset
}

/** Removes exactly `indent` from the front of each line that has it. */
function stripIndent(lines: string[], indent: string): string[] {
  if (!indent) return lines
  return lines.map((line) => (line.startsWith(indent) ? line.slice(indent.length) : line))
}

/** Adds `indent` to every non-empty line. Blank lines stay blank, not whitespace. */
function applyIndent(lines: string[], indent: string): string[] {
  if (!indent) return lines
  return lines.map((line) => (line.trim() === '' ? '' : indent + line))
}

/** Renders a complete region block (both sentinels plus content) at `indent`. */
export function buildRegion(
  componentId: string,
  hash: string,
  inner: string,
  indent = '',
): string {
  const body = applyIndent(inner.split('\n'), indent)
  return [
    `${indent}${REGION_OPEN_PREFIX} component="${componentId}" hash="${hash}">`,
    ...body,
    `${indent}${REGION_CLOSE}`,
  ].join('\n')
}

/**
 * Replaces the region in `source` with new content, preserving every byte
 * outside it.
 *
 * Returns null when there is no region to replace — the caller must decide
 * whether that means "write a fresh file" or "this file was detached, leave it
 * alone". Never invents a region in a file that lacks one.
 */
export function spliceRegion(
  source: string,
  componentId: string,
  hash: string,
  inner: string,
): string | null {
  const region = extractRegion(source)
  if (!region) return null
  const replacement = buildRegion(componentId, hash, inner, region.indent)
  return source.slice(0, region.start) + replacement + source.slice(region.end)
}

/** True when the file carries a well-formed region for this component. */
export function hasRegionFor(source: string, componentId: string): boolean {
  const region = extractRegion(source)
  return !!region && region.componentId === componentId
}

// ── Import block ───────────────────────────────────────────────────────────
//
// The region above covers the JSX the canvas owns. The import block is the one
// other part of the file whose correctness depends on where the file LIVES, so
// it needs the same treatment for a different reason: move a component out of
// `.canvas` into `src/components/` and every relative specifier it emitted is
// now wrong. See model/relink.ts.
//
// Same contract as spliceRegion — everything else in the file survives byte for
// byte — but delimited by position rather than sentinels: the block is the run
// of import statements at the top of the file, which is exactly what
// emitComponentFile writes there.

/** Matches a single-line import statement, the only shape emitComponentFile writes. */
const IMPORT_RE = /^import\s.*\sfrom\s+['"][^'"]+['"];?[ \t]*$/

/**
 * Replaces the leading run of import lines with `imports`.
 *
 * "Leading" means: skipping blank lines and comments at the very top (a license
 * header or a file-level doc comment stays put), take every consecutive import
 * line, stop at the first line that is neither. A multi-line import is NOT
 * matched — the canvas never emits one, and a human who reformatted theirs onto
 * several lines is telling us this file is hand-owned. In that case the run
 * ends there and their import survives untouched, which is the safe failure.
 *
 * A file with no imports at all gets the block inserted after the header, so a
 * component that gains its first instance reference still compiles.
 */
export function spliceImports(source: string, imports: string[]): string {
  const lines = source.split('\n')

  // Skip a leading header: blank lines and comments, but stop the moment real
  // code appears so we never scan past the top of the file.
  let start = 0
  while (start < lines.length) {
    const line = lines[start].trim()
    if (line === '' || line.startsWith('//') || line.startsWith('/*') || line.startsWith('*')) {
      start += 1
      continue
    }
    break
  }

  let end = start
  while (end < lines.length && IMPORT_RE.test(lines[end].trim())) end += 1

  // Nothing to replace and nothing to add — leave the file exactly as it is
  // rather than rewriting it to an identical string.
  if (end === start && imports.length === 0) return source

  // Preserve the single blank line emitComponentFile puts after the block, and
  // don't accumulate blanks when replacing an existing block with a shorter one.
  let trailing = end
  while (trailing < lines.length && lines[trailing].trim() === '') trailing += 1

  const rest = lines.slice(trailing)
  const replacement = imports.length > 0 ? [...imports, ''] : []
  return [...lines.slice(0, start), ...replacement, ...rest].join('\n')
}

// ── Declaration ────────────────────────────────────────────────────────────
//
// The third canvas-owned span: the props interface and the arrow-function
// signature that consumes it.
//
// These derive from the component's PROPS, so they go stale the moment a prop
// is added — and under automatic promotion the file is written before any prop
// exists, which made that the normal case rather than the exotic one. Splicing
// only the region would leave a body referencing `state` above a signature that
// still reads `()`: code that doesn't compile.
//
// Everything BETWEEN the signature and the region — hooks, handlers, whatever a
// human put there — is preserved, as is everything after the region's close.

/** `export const Card = ({ … }: CardProps) => {` — the canonical shape emitComponentFile writes. */
const SIGNATURE_RE = /^export const \S+ = \(.*\) => \{[ \t]*$/
/**
 * `export interface CardProps {`, or one of the single-line empty forms:
 * `export type CardProps = Record<string, never>` (what emitPropsInterface
 * writes now) or `export interface CardProps {}` (what it wrote before — still
 * recognized so older files keep splicing).
 */
const PROPS_OPEN_RE = /^export (?:interface \S+Props \{|type \S+Props = Record<string, never>)/
const PROPS_EMPTY_RE = /^export (?:interface \S+Props \{\}|type \S+Props = Record<string, never>;?)[ \t]*$/

/**
 * Replaces the props interface and the component's signature line.
 *
 * Anchored on the region, which is the one landmark in the file we know we
 * wrote: the signature is the LAST signature-shaped line above it, and the
 * props interface the last interface-shaped block above that. Returns the
 * source untouched when either landmark is missing rather than guessing —
 * same refusal-over-corruption rule as spliceRegion.
 */
export function spliceDeclaration(source: string, propsInterface: string, signature: string): string {
  const lines = source.split('\n')

  const regionLine = lines.findIndex((line) => OPEN_RE.test(line))
  if (regionLine === -1) return source

  let sigLine = -1
  for (let i = regionLine - 1; i >= 0; i -= 1) {
    if (SIGNATURE_RE.test(lines[i])) {
      sigLine = i
      break
    }
  }
  if (sigLine === -1) return source

  // The props interface, if the file has one. Absent is fine — the declaration
  // still gets its signature updated.
  let propsStart = -1
  let propsEnd = -1
  for (let i = sigLine - 1; i >= 0; i -= 1) {
    if (!PROPS_OPEN_RE.test(lines[i])) continue
    propsStart = i
    if (PROPS_EMPTY_RE.test(lines[i])) {
      propsEnd = i
    } else {
      // Multi-line: runs to the next line that is exactly a closing brace at
      // column 0, which is how emitPropsInterface writes it.
      propsEnd = -1
      for (let j = i + 1; j < sigLine; j += 1) {
        if (lines[j] === '}') {
          propsEnd = j
          break
        }
      }
      // An interface we can't find the end of is one we didn't write.
      if (propsEnd === -1) return source
    }
    break
  }

  if (propsStart === -1) {
    return [...lines.slice(0, sigLine), signature, ...lines.slice(sigLine + 1)].join('\n')
  }

  return [
    ...lines.slice(0, propsStart),
    ...propsInterface.split('\n'),
    // Whatever separated the interface from the signature (a blank line, as
    // emitted) is preserved verbatim rather than re-invented.
    ...lines.slice(propsEnd + 1, sigLine),
    signature,
    ...lines.slice(sigLine + 1),
  ].join('\n')
}
