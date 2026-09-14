// AGENTS.md, CLAUDE.md and GEMINI.md are shared with the human: they may already
// exist, full of instructions nobody wants Sleipnir to touch. So Sleipnir owns a
// delimited block inside them and nothing else — create the file if it's absent,
// append the block if the file exists without one, and replace only what's
// between the markers if it's already there.
//
// Contrast with the files Sleipnir owns outright (.sleipnir/*, the slash-command
// files), which scaffold.mjs simply overwrites when their hash changes.
//
// The markers are block-level HTML comments on purpose: Claude Code strips those
// before the file enters the model's context, so they cost nothing to carry.

const BEGIN_RE = /[ \t]*<!--\s*BEGIN SLEIPNIR[\s\S]*?-->/
const END_RE = /[ \t]*<!--\s*END SLEIPNIR\s*-->/

export function beginMarker(version) {
  return `<!-- BEGIN SLEIPNIR v${version} — generated, edits inside are overwritten -->`
}

export const END_MARKER = '<!-- END SLEIPNIR -->'

export function wrapBlock(version, content) {
  return `${beginMarker(version)}\n${content.trim()}\n${END_MARKER}`
}

// Returns the file's full new text, or null when it already says exactly this —
// letting scaffold.mjs skip the write instead of churning the mtime (which, for
// anything under .planning/, would wake electron/planningWatcher.cjs).
export function mergeBlock(existing, version, content) {
  const block = wrapBlock(version, content)
  if (existing === null || existing === undefined) return `${block}\n`

  const begin = existing.match(BEGIN_RE)
  const end = existing.match(END_RE)

  // Only a complete, correctly ordered pair is a block we own. A half-written
  // one (someone deleted the closing marker) is treated as human text and left
  // alone, rather than guessing where our content used to stop.
  if (!begin || !end || end.index < begin.index) {
    const separator = existing.endsWith('\n\n') ? '' : existing.endsWith('\n') ? '\n' : '\n\n'
    const merged = `${existing}${separator}${block}\n`
    return merged === existing ? null : merged
  }

  const before = existing.slice(0, begin.index)
  const after = existing.slice(end.index + end[0].length)
  const merged = `${before}${block}${after}`
  return merged === existing ? null : merged
}

// True when this file carries a Sleipnir block at all — used to report what a
// project already has without rewriting it.
export function hasBlock(existing) {
  if (!existing) return false
  const begin = existing.match(BEGIN_RE)
  const end = existing.match(END_RE)
  return Boolean(begin && end && end.index > begin.index)
}
