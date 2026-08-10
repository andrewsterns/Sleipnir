import { EditorState, type Extension } from '@codemirror/state'
import { pickedCompletion, type Completion, type CompletionContext, type CompletionResult, type CompletionSource } from '@codemirror/autocomplete'
import { fuzzyScore } from '../../utils/fuzzyMatch'
import { adapterForLanguage, adapterForPath } from '../../00_planning/graph/importAdapters'
import type { GraphNode } from '../../00_planning/graph/types'

const MAX_CANDIDATES = 8
const TRIGGER_RE = /##(\w*)$/

interface GraphLinkCompletion extends Completion {
  node: GraphNode
}

// insertImport only ever splices in one contiguous line (never touches
// existing content otherwise — see tsxAdapter's own doc comment), so the
// first point where old/new content diverge, plus the length delta, is
// exactly the inserted text. Lets the editor apply both the ##token
// replacement AND the import insertion as two independent ranges in one
// atomic CM6 transaction, instead of two separate edits (which would be two
// separate undo steps and risk stale offsets).
function computeInsertedSpan(oldContent: string, newContent: string): { from: number; insert: string } | null {
  if (oldContent === newContent) return null
  const max = Math.min(oldContent.length, newContent.length)
  let start = 0
  while (start < max && oldContent[start] === newContent[start]) start++
  const insertLength = newContent.length - oldContent.length
  return { from: start, insert: newContent.slice(start, start + insertLength) }
}

export interface GraphLinkExtensionOptions {
  /** Called fresh on every completion query — always the live graph, never a stale snapshot taken at mount time. */
  getGraphNodes: () => GraphNode[]
  /** Workspace-relative path of the file this editor instance is showing. */
  fromPath: string
  /** Fired once a `##token` resolves and its import has been spliced into the document — callers reconcile the graph edge (see WorkspaceView's onLinkResolved). */
  onResolved: (target: GraphNode) => void
}

// Obsidian-style "##token" linking — consumed the instant it resolves (per
// the confirmed design: no lingering ## syntax ever reaches disk, only a
// real, valid import statement). Registered via EditorState.languageData
// rather than a second autocompletion() call, which would silently replace
// whatever completion source the TypeScript LSP already registers (see
// CodeEditorView.ViewModel's lspExtension) — languageData is CodeMirror's
// own mechanism for layering multiple independent completion sources
// together instead of one replacing another.
export function graphLinkExtension(opts: GraphLinkExtensionOptions): Extension {
  const adapter = adapterForPath(opts.fromPath)
  if (!adapter) return [] // no adapter for this file's extension at all — inert (every currently-supported language has one)

  const source: CompletionSource = (context: CompletionContext): CompletionResult | null => {
    const match = context.matchBefore(TRIGGER_RE)
    if (!match) return null

    const query = match.text.slice(2)
    // Same-import-family candidates only — picking one always inserts a real
    // import (that's the whole point of ##token), and there's no valid way to
    // import a Python/Rust/Go file into a JS/TS file or vice versa. Matched by
    // *adapter* rather than raw language id, so the JS/TS family
    // (typescript/javascript/react/jquery) — which all share one adapter and
    // can genuinely import each other — stays cross-linkable, while Python/
    // Rust/Go each stay isolated. The node-card link editor allows cross-
    // language links but keeps them graph-only; here, where the pick MUST
    // become code, they're excluded.
    const candidates = opts.getGraphNodes().filter(
      (n) => n.role && n.filePath && n.filePath !== opts.fromPath && !!n.language && adapterForLanguage(n.language) === adapter,
    )
    const scored = candidates
      .map((node) => ({ node, score: fuzzyScore(query, node.label) }))
      .filter((r): r is { node: GraphNode; score: number } => r.score !== null)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_CANDIDATES)

    if (scored.length === 0) return null

    const options: GraphLinkCompletion[] = scored.map(({ node }) => ({
      label: node.label,
      detail: [node.role, node.language].filter(Boolean).join(' · '),
      node,
      apply: (view, completion) => {
        const target = (completion as GraphLinkCompletion).node
        if (!target.filePath) return
        const oldContent = view.state.doc.toString()
        const identifier = adapter.importedIdentifier(opts.fromPath, target.filePath, target.label, target.role)
        const newContent = adapter.insertImport(oldContent, opts.fromPath, target.filePath, target.label, target.role)
        const inserted = computeInsertedSpan(oldContent, newContent)

        const changes: { from: number; to?: number; insert: string }[] = [{ from: match.from, to: match.to, insert: identifier }]
        if (inserted) changes.push({ from: inserted.from, insert: inserted.insert })

        view.dispatch({
          changes,
          annotations: pickedCompletion.of(completion),
        })
        opts.onResolved(target)
      },
    }))

    // We've already scored/sorted with fuzzyScore (a subsequence matcher) —
    // CM6's own default filter/sort is prefix-oriented and would drop
    // legitimate fuzzy matches, so it's disabled here.
    return { from: match.from, options, filter: false }
  }

  return EditorState.languageData.of(() => [{ autocomplete: source }])
}
