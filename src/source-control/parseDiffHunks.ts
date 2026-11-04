export interface DiffLine {
  num: number
  text: string
  type: 'context' | 'add' | 'remove'
}

export interface DiffRow {
  left: DiffLine | null
  right: DiffLine | null
}

export interface DiffHunk {
  header: string
  rows: DiffRow[]
}

const HUNK_HEADER_RE = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/

// Parses a unified diff (as produced by `git diff`) into hunks of paired
// old/new rows, for a side-by-side view. Consecutive runs of removed/added
// lines within a hunk are zipped pairwise by position — not a real
// line-level diff (no Myers matching), just good enough to read as "this
// changed to that" without pulling in a diff-matching library for a
// read-only view. Preamble lines (diff --git/index/---/+++) are dropped —
// the caller already shows the filename separately.
export function parseUnifiedDiff(diff: string): DiffHunk[] {
  const lines = diff.split('\n')
  const hunks: DiffHunk[] = []
  let current: DiffHunk | null = null
  let oldNum = 0
  let newNum = 0
  let pendingRemoved: DiffLine[] = []
  let pendingAdded: DiffLine[] = []

  const flushPending = () => {
    if (!current) return
    const max = Math.max(pendingRemoved.length, pendingAdded.length)
    for (let i = 0; i < max; i++) {
      current.rows.push({ left: pendingRemoved[i] ?? null, right: pendingAdded[i] ?? null })
    }
    pendingRemoved = []
    pendingAdded = []
  }

  for (const line of lines) {
    const headerMatch = HUNK_HEADER_RE.exec(line)
    if (headerMatch) {
      flushPending()
      oldNum = Number(headerMatch[1])
      newNum = Number(headerMatch[2])
      current = { header: line, rows: [] }
      hunks.push(current)
      continue
    }
    if (!current) continue // preamble, before the first hunk header
    if (line.startsWith('-') && !line.startsWith('---')) {
      pendingRemoved.push({ num: oldNum++, text: line.slice(1), type: 'remove' })
    } else if (line.startsWith('+') && !line.startsWith('+++')) {
      pendingAdded.push({ num: newNum++, text: line.slice(1), type: 'add' })
    } else if (line.startsWith(' ')) {
      flushPending()
      current.rows.push({
        left: { num: oldNum++, text: line.slice(1), type: 'context' },
        right: { num: newNum++, text: line.slice(1), type: 'context' },
      })
    }
    // Anything else (e.g. '\ No newline at end of file') carries no line
    // number on either side — not represented as a row.
  }
  flushPending()
  return hunks
}
