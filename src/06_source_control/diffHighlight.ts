// Syntax colors for diff lines — the same grammar and palette the code editor
// uses (codeEditorLanguages, tacticalHighlightStyle), applied statically: a
// diff is read, not edited, so it gets a parse and a highlight pass rather than
// an editor instance per hunk. Lines of one hunk side are parsed together so a
// multi-line string or comment colors the way it does in the file.
import { highlightTree, tagHighlighter, type Tag } from '@lezer/highlight'
import type { Extension } from '@codemirror/state'
import { Language, LanguageSupport } from '@codemirror/language'
import { loadLanguageForPath } from '../app/DesignSystem/codeEditorLanguages'
import { tacticalHighlightStyle } from '../app/DesignSystem/codeEditorTheme'

export interface DiffToken {
  text: string
  style?: { color?: string; fontStyle?: string; textDecoration?: string }
}

// The editor's palette as a highlighter: each style spec's index is its class.
const SPECS = tacticalHighlightStyle.specs
const highlighter = tagHighlighter(
  SPECS.flatMap((spec, i) => (Array.isArray(spec.tag) ? (spec.tag as Tag[]) : [spec.tag as Tag]).map((tag) => ({ tag, class: String(i) }))),
)
const styleOfClass = (cls: string): DiffToken['style'] => {
  const spec = SPECS[Number(cls.split(' ')[0])]
  if (!spec) return undefined
  return { color: spec.color as string | undefined, fontStyle: spec.fontStyle as string | undefined, textDecoration: spec.textDecoration as string | undefined }
}

function languageOf(support: Extension[]): Language | null {
  for (const ext of support) {
    if (ext instanceof LanguageSupport) return ext.language
    if (ext instanceof Language) return ext
  }
  return null
}

/** The file a unified diff is about: its `+++ b/` path, else the `diff --git` one. */
export function diffPath(diff: string): string | null {
  return diff.match(/^\+\+\+ b\/(.+)$/m)?.[1] ?? diff.match(/^diff --git a\/.+ b\/(.+)$/m)?.[1] ?? null
}

/** Each line as colored tokens; plain text when the file has no grammar. */
export async function highlightLines(filePath: string, lines: string[]): Promise<DiffToken[][]> {
  const language = languageOf(await loadLanguageForPath(filePath))
  if (!language || !lines.length) return lines.map((text) => [{ text }])
  const doc = lines.join('\n')
  const ranges: { from: number; to: number; cls: string }[] = []
  highlightTree(language.parser.parse(doc), highlighter, (from, to, cls) => ranges.push({ from, to, cls }))

  const out: DiffToken[][] = []
  let offset = 0
  let r = 0
  for (const line of lines) {
    const start = offset
    const end = offset + line.length
    const tokens: DiffToken[] = []
    let at = start
    while (r < ranges.length && ranges[r].to <= start) r += 1
    for (let i = r; i < ranges.length && ranges[i].from < end; i += 1) {
      const from = Math.max(ranges[i].from, start)
      const to = Math.min(ranges[i].to, end)
      if (from > at) tokens.push({ text: doc.slice(at, from) })
      if (to > from) tokens.push({ text: doc.slice(from, to), style: styleOfClass(ranges[i].cls) })
      at = Math.max(at, to)
    }
    if (at < end) tokens.push({ text: doc.slice(at, end) })
    out.push(tokens.length ? tokens : [{ text: '' }])
    offset = end + 1
  }
  return out
}

// Lockfiles and generated output: long, machine-written, rarely worth reading
// line by line. Their diffs start collapsed.
const COLLAPSED = /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?|Cargo\.lock|go\.sum|poetry\.lock|Pipfile\.lock|uv\.lock|Gemfile\.lock|composer\.lock|Package\.resolved|packages\.lock\.json|gradle\.lockfile)$|(^|\/)(dist|build|out|target)\//

export function collapsedByDefault(filePath: string | null): boolean {
  return !!filePath && COLLAPSED.test(filePath)
}
