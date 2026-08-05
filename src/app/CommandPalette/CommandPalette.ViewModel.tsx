import { useEffect, useRef, useState } from 'react'
import { getWorkspaceInfo, listWorkspaceDir, listRepoTree, searchRepo, searchWorkspace } from '../../00_planning/api/sleipnirApi'
import type { FileTreeNode, SearchMatch } from '../../00_planning/api/PlatformAPI'
import { fuzzyScore } from '../../utils/fuzzyMatch'

export interface PaletteFile {
  path: string
  scope: 'workspace' | 'repo'
}

// One unified, mode-agnostic result shape so keyboard nav (arrow/Enter) never
// needs to know which mode produced the list — see `results` below.
export type PaletteResultItem =
  | { kind: 'file'; file: PaletteFile }
  | { kind: 'match'; path: string; match: SearchMatch }

const FILE_RESULT_LIMIT = 50
// A compact popup shouldn't pull the backend's full 500-match default (see
// tools/sleipnir-backend.mjs's SEARCH_RESULT_LIMIT) — this caps what's asked
// for, not just what's displayed.
const SEARCH_RESULT_LIMIT = 200
const SEARCH_DEBOUNCE_MS = 250

function flattenFiles(nodes: FileTreeNode[], scope: 'workspace' | 'repo', into: PaletteFile[]) {
  for (const n of nodes) {
    if (n.type === 'file') into.push({ path: n.path, scope })
    if (n.children) flattenFiles(n.children, scope, into)
  }
}

export function useCommandPaletteViewModel(
  open: boolean,
  onJumpToFile: (path: string, opts?: { line?: number; scope?: 'workspace' | 'repo' }) => void,
  onClose: () => void,
) {
  const [query, setQuery] = useState('')
  const [files, setFiles] = useState<PaletteFile[]>([])
  const [filesLoading, setFilesLoading] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  // Resolved once per palette-open (below) — both quick-open and `>` content
  // search reuse this same value rather than each re-calling
  // getWorkspaceInfo(), so they can never disagree mid-session if the
  // Workspace happens to open/close while the palette is up.
  const [scope, setScope] = useState<'workspace' | 'repo'>('repo')

  const [searchGroups, setSearchGroups] = useState<{ path: string; matches: SearchMatch[] }[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [truncated, setTruncated] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const searchRequestIdRef = useRef(0)
  const searchDebounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Refetches the file list every time the palette opens rather than caching
  // across opens — correctness (always reflects the current project's state)
  // over speed; no backend round-trip after this for quick-open, so
  // re-scoring per keystroke stays purely client-side and instant.
  useEffect(() => {
    if (!open) return
    setQuery('')
    setSelectedIndex(0)
    setFilesLoading(true)
    let cancelled = false
    ;(async () => {
      const info = await getWorkspaceInfo()
      const currentScope: 'workspace' | 'repo' = info.root ? 'workspace' : 'repo'
      const { tree } = currentScope === 'workspace' ? await listWorkspaceDir('') : await listRepoTree()
      if (cancelled) return
      const flat: PaletteFile[] = []
      flattenFiles(tree, currentScope, flat)
      setScope(currentScope)
      setFiles(flat)
      setFilesLoading(false)
    })().catch(() => {
      if (!cancelled) setFilesLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [open])

  const trimmed = query.trim()
  // A `>` prefix switches from fuzzy quick-open to project-wide content
  // search (grep) — mirrors VS Code's palette-prefix convention, adapted
  // since Sleipnir has no separate "commands" list for `>` to otherwise mean.
  const isSearchMode = trimmed.startsWith('>')
  const searchQuery = isSearchMode ? trimmed.slice(1).trim() : ''

  // Debounced content search — only does anything in search mode with a
  // non-empty query after the `>`. Ported from the deleted SearchView's own
  // ViewModel: same debounce + stale-response-guard shape.
  useEffect(() => {
    if (searchDebounceTimer.current) clearTimeout(searchDebounceTimer.current)
    if (!open || !isSearchMode || !searchQuery) {
      searchRequestIdRef.current++
      setSearchGroups([])
      setTruncated(false)
      setError(null)
      setSearchLoading(false)
      return
    }

    setSearchLoading(true)
    searchDebounceTimer.current = setTimeout(async () => {
      const requestId = ++searchRequestIdRef.current
      try {
        const result =
          scope === 'workspace'
            ? await searchWorkspace(searchQuery, { limit: SEARCH_RESULT_LIMIT })
            : await searchRepo(searchQuery, { limit: SEARCH_RESULT_LIMIT })
        if (requestId !== searchRequestIdRef.current) return

        const byPath = new Map<string, SearchMatch[]>()
        for (const m of result.matches) {
          const list = byPath.get(m.path)
          if (list) list.push(m)
          else byPath.set(m.path, [m])
        }
        setSearchGroups(Array.from(byPath, ([path, matches]) => ({ path, matches })))
        setTruncated(result.truncated)
        setError(null)
      } catch (e) {
        if (requestId !== searchRequestIdRef.current) return
        setError(e instanceof Error ? e.message : String(e))
        setSearchGroups([])
      } finally {
        if (requestId === searchRequestIdRef.current) setSearchLoading(false)
      }
    }, SEARCH_DEBOUNCE_MS)

    return () => {
      if (searchDebounceTimer.current) clearTimeout(searchDebounceTimer.current)
    }
  }, [open, isSearchMode, searchQuery, scope])

  const fileResults: PaletteFile[] = trimmed
    ? files
        .map((f) => ({ file: f, score: fuzzyScore(trimmed, f.path) }))
        .filter((r): r is { file: PaletteFile; score: number } => r.score !== null)
        .sort((a, b) => b.score - a.score)
        .slice(0, FILE_RESULT_LIMIT)
        .map((r) => r.file)
    : files.slice(0, FILE_RESULT_LIMIT)

  const results: PaletteResultItem[] = isSearchMode
    ? searchGroups.flatMap((g) => g.matches.map((match): PaletteResultItem => ({ kind: 'match', path: g.path, match })))
    : fileResults.map((file): PaletteResultItem => ({ kind: 'file', file }))

  const loading = isSearchMode ? searchLoading : filesLoading
  const mode: 'files' | 'search' = isSearchMode ? 'search' : 'files'

  // Clamp/reset whenever the result set changes shape (new query, or a mode
  // switch) so a stale index from a longer previous list doesn't point past
  // the end.
  useEffect(() => {
    setSelectedIndex(0)
  }, [trimmed])

  const select = (item: PaletteResultItem) => {
    if (item.kind === 'file') onJumpToFile(item.file.path, { scope: item.file.scope })
    else onJumpToFile(item.path, { line: item.match.line, scope })
    onClose()
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((i) => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const target = results[selectedIndex]
      if (target) select(target)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }

  return { query, setQuery, mode, scope, results, loading, truncated, error, selectedIndex, setSelectedIndex, select, onKeyDown }
}
