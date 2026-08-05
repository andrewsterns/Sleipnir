// Simple subsequence-based fuzzy scorer for quick-open (VS Code style): every
// character of the needle must appear in order within the haystack. Matches
// right after a path-boundary character (/, -, _, ., space) or right after
// the previous match (a consecutive run) score higher; a shorter overall
// haystack wins ties, favoring a more specific match over a longer one that
// happens to contain the same characters. Leftmost-greedy, not globally
// optimal — fine for quick-open, which only needs "good enough" ranking over
// a few hundred file paths/node labels re-scored per keystroke.
const BOUNDARY_CHARS = new Set(['/', '-', '_', '.', ' '])

export function fuzzyScore(needle: string, haystack: string): number | null {
  if (!needle) return 0
  const n = needle.toLowerCase()
  const h = haystack.toLowerCase()

  let searchFrom = 0
  let score = 0
  let prevMatchIndex = -1
  for (const ch of n) {
    const found = h.indexOf(ch, searchFrom)
    if (found === -1) return null
    const atBoundary = found === 0 || BOUNDARY_CHARS.has(h[found - 1])
    const consecutive = prevMatchIndex !== -1 && found === prevMatchIndex + 1
    score += atBoundary ? 10 : 1
    score += consecutive ? 8 : 0
    prevMatchIndex = found
    searchFrom = found + 1
  }
  score -= haystack.length * 0.01
  return score
}
