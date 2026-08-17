import { useCallback, useEffect, useState } from 'react'
import {
  getGitStatus,
  getGitDiff,
  stageFiles,
  unstageFiles,
  discardFiles,
  commitChanges,
  getBranches,
  getBranchTree,
  checkoutBranch,
  createBranch,
  renameBranch,
  gitPush,
  gitPull,
  gitFetch,
  gitInit,
  gitAddRemote,
  gitStashPush,
  gitStashList,
  gitStashApply,
  gitStashPop,
  gitStashDrop,
  type GitStatus,
  type GitFileStatus,
  type GitBranch,
  type GitBranchTree,
  type GitOpResult,
  type GitStash,
} from '../00_planning/api/sleipnirApi'

interface SelectedFile {
  path: string
  staged: boolean
}

export function useSourceControlViewModel() {
  const [status, setStatus] = useState<GitStatus | null>(null)
  const [branches, setBranches] = useState<GitBranch[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [branchTree, setBranchTree] = useState<GitBranchTree | null>(null)
  const [branchTreeLoading, setBranchTreeLoading] = useState(true)

  // Bumped after every status/branch refresh (i.e. after any git op) so the
  // heavier commit-graph view — which fetches its own getCommitGraph() lazily
  // rather than living in this hook — knows to reload without us threading a
  // dedicated refresh through each handler.
  const [dataVersion, setDataVersion] = useState(0)

  const [selected, setSelected] = useState<SelectedFile | null>(null)
  const [diff, setDiff] = useState('')
  const [diffLoading, setDiffLoading] = useState(false)

  const [commitMessage, setCommitMessage] = useState('')
  const [committing, setCommitting] = useState(false)

  const [pushing, setPushing] = useState(false)
  const [pulling, setPulling] = useState(false)
  const [fetching, setFetching] = useState(false)
  const [opResult, setOpResult] = useState<GitOpResult | null>(null)
  const [initializing, setInitializing] = useState(false)
  const [addingRemote, setAddingRemote] = useState(false)

  const [newBranchName, setNewBranchName] = useState('')
  const [switchingBranch, setSwitchingBranch] = useState(false)

  // Name of the branch row currently showing its inline rename input, or
  // null when none is — mirrors newBranchName/submitNewBranch's shape, just
  // scoped per-row instead of one shared "new branch" field.
  const [renamingBranch, setRenamingBranch] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [renamingInFlight, setRenamingInFlight] = useState(false)

  const [stashes, setStashes] = useState<GitStash[]>([])
  const [stashesLoading, setStashesLoading] = useState(false)
  const [stashMessage, setStashMessage] = useState('')
  const [stashing, setStashing] = useState(false)
  // ref of the stash row currently being applied/popped/dropped — per-row
  // loading state, same "one field, not a Set" shape as renamingBranch above.
  const [stashActionRef, setStashActionRef] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const [s, b] = await Promise.all([getGitStatus(), getBranches()])
      setStatus(s)
      setBranches(b)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
      setDataVersion((v) => v + 1)
    }
  }, [])

  const refreshBranchTree = useCallback(async () => {
    setBranchTreeLoading(true)
    try {
      setBranchTree(await getBranchTree())
    } catch {
      // Non-critical — the file-status side of the view still works without it.
    } finally {
      setBranchTreeLoading(false)
    }
  }, [])

  const refreshStashes = useCallback(async () => {
    setStashesLoading(true)
    try {
      setStashes(await gitStashList())
    } catch {
      // Non-critical, same tolerance as refreshBranchTree above.
    } finally {
      setStashesLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
    refreshBranchTree()
  }, [refresh, refreshBranchTree])

  // Re-read git state whenever the app regains focus / becomes visible — the
  // view can't see changes made outside its own buttons (a commit in the
  // in-app terminal, an external editor, the git CLI) until something tells it
  // to look again. This catches the "came back from another app" case; the
  // header's Refresh button covers "committed in the terminal without leaving".
  useEffect(() => {
    const reload = () => { if (!document.hidden) { refresh(); refreshBranchTree() } }
    window.addEventListener('focus', reload)
    document.addEventListener('visibilitychange', reload)
    return () => {
      window.removeEventListener('focus', reload)
      document.removeEventListener('visibilitychange', reload)
    }
  }, [refresh, refreshBranchTree])

  // Keep the diff pane in sync with whichever file is selected — reload it
  // whenever the selection changes, and drop the selection entirely once
  // that file no longer shows up in status (e.g. after a commit).
  useEffect(() => {
    if (!selected) {
      setDiff('')
      return
    }
    if (status && !status.files.some((f) => f.path === selected.path)) {
      setSelected(null)
      return
    }
    let cancelled = false
    setDiffLoading(true)
    getGitDiff(selected.path, selected.staged)
      .then(({ diff: d }) => { if (!cancelled) setDiff(d) })
      .catch((e) => { if (!cancelled) setDiff(`# Failed to load diff: ${e instanceof Error ? e.message : String(e)}`) })
      .finally(() => { if (!cancelled) setDiffLoading(false) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.path, selected?.staged])

  const selectFile = (file: GitFileStatus) => {
    setSelected({ path: file.path, staged: file.staged })
  }

  const clearSelection = () => setSelected(null)

  const toggleStage = async (file: GitFileStatus) => {
    try {
      const next = file.staged ? await unstageFiles([file.path]) : await stageFiles([file.path])
      setStatus(next)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  // Always stages, regardless of current staged state — unlike toggleStage,
  // which flips based on it. A conflicted file's indexStatus is already 'U'
  // (so `staged` reads true), so toggleStage would unstage it instead; `git
  // add` on a conflicted path IS what marks it resolved.
  const resolveConflict = async (file: GitFileStatus) => {
    try {
      setStatus(await stageFiles([file.path]))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  // Destructive — the view confirms before calling this (see DiscardFileModal).
  const discard = async (file: GitFileStatus) => {
    try {
      const next = await discardFiles([file.path])
      setStatus(next)
      setSelected((s) => (s?.path === file.path ? null : s))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const commit = async () => {
    setCommitting(true)
    setError(null)
    try {
      const next = await commitChanges(commitMessage)
      setStatus(next)
      setCommitMessage('')
      setSelected(null)
      refreshBranchTree()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setCommitting(false)
    }
  }

  const doPush = async () => {
    setPushing(true)
    setOpResult(null)
    try {
      const result = await gitPush()
      setOpResult(result)
      await refresh()
    } catch (e) {
      setOpResult({ ok: false, message: e instanceof Error ? e.message : String(e) })
    } finally {
      setPushing(false)
    }
  }

  const doPull = async () => {
    setPulling(true)
    setOpResult(null)
    try {
      const result = await gitPull()
      setOpResult(result)
      await Promise.all([refresh(), refreshBranchTree()])
    } catch (e) {
      setOpResult({ ok: false, message: e instanceof Error ? e.message : String(e) })
    } finally {
      setPulling(false)
    }
  }

  const doFetch = async () => {
    setFetching(true)
    setOpResult(null)
    try {
      const result = await gitFetch()
      setOpResult(result)
      await refresh()
    } catch (e) {
      setOpResult({ ok: false, message: e instanceof Error ? e.message : String(e) })
    } finally {
      setFetching(false)
    }
  }

  // Turn the open folder into a git repo — after this, getGitStatus stops
  // throwing "Not a git repository" and the normal view takes over.
  const doInit = async () => {
    setInitializing(true)
    setError(null)
    try {
      const result = await gitInit()
      if (result && !result.ok) { setError(result.message); return }
      await Promise.all([refresh(), refreshBranchTree()])
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setInitializing(false)
    }
  }

  // Wire an 'origin' so a remote-less repo can Publish.
  const doAddRemote = async (url: string) => {
    setAddingRemote(true)
    setOpResult(null)
    try {
      const result = await gitAddRemote(url.trim())
      if (result) setOpResult(result)
      await refresh()
    } catch (e) {
      setOpResult({ ok: false, message: e instanceof Error ? e.message : String(e) })
    } finally {
      setAddingRemote(false)
    }
  }

  const doStashPush = async () => {
    setStashing(true)
    setError(null)
    try {
      const next = await gitStashPush(stashMessage.trim() || undefined)
      setStatus(next)
      setStashMessage('')
      await refreshStashes()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setStashing(false)
    }
  }

  const doStashApply = async (ref: string) => {
    setStashActionRef(ref)
    setError(null)
    try {
      setStatus(await gitStashApply(ref))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setStashActionRef(null)
    }
  }

  const doStashPop = async (ref: string) => {
    setStashActionRef(ref)
    setError(null)
    try {
      setStatus(await gitStashPop(ref))
      await refreshStashes()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setStashActionRef(null)
    }
  }

  const doStashDrop = async (ref: string) => {
    setStashActionRef(ref)
    setError(null)
    try {
      setStashes(await gitStashDrop(ref))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setStashActionRef(null)
    }
  }

  const switchBranch = async (name: string) => {
    setSwitchingBranch(true)
    setError(null)
    try {
      const next = await checkoutBranch(name)
      setStatus(next)
      setSelected(null)
      await Promise.all([refresh(), refreshBranchTree()])
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSwitchingBranch(false)
    }
  }

  const submitNewBranch = async () => {
    if (!newBranchName.trim()) return
    setSwitchingBranch(true)
    setError(null)
    try {
      const next = await createBranch(newBranchName.trim())
      setStatus(next)
      setNewBranchName('')
      await Promise.all([refresh(), refreshBranchTree()])
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSwitchingBranch(false)
    }
  }

  const startRenameBranch = (name: string) => {
    setRenamingBranch(name)
    setRenameValue(name)
  }

  const cancelRenameBranch = () => {
    setRenamingBranch(null)
    setRenameValue('')
  }

  const submitRenameBranch = async () => {
    const oldName = renamingBranch
    const newName = renameValue.trim()
    if (!oldName || !newName || newName === oldName) {
      cancelRenameBranch()
      return
    }
    setRenamingInFlight(true)
    setError(null)
    try {
      const next = await renameBranch(oldName, newName)
      setStatus(next)
      cancelRenameBranch()
      await Promise.all([refresh(), refreshBranchTree()])
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setRenamingInFlight(false)
    }
  }

  const staged = status?.files.filter((f) => f.staged) ?? []
  const unstaged = status?.files.filter((f) => !f.staged && !f.untracked) ?? []
  const untracked = status?.files.filter((f) => f.untracked) ?? []
  // Always sourced from the live status (refreshed on every refresh(), not
  // just a one-off post-pull snapshot) so it stays accurate if a conflict is
  // resolved outside the app (e.g. in the terminal) and the user hits Refresh.
  const conflicted = status?.files.filter((f) => f.conflicted) ?? []

  return {
    status, branches, loading, error,
    branchTree, branchTreeLoading, dataVersion,
    staged, unstaged, untracked, conflicted,
    selected, diff, diffLoading, selectFile, clearSelection,
    toggleStage, discard, resolveConflict,
    commitMessage, setCommitMessage, committing, commit,
    pushing, pulling, fetching, opResult, doPush, doPull, doFetch,
    initializing, doInit, addingRemote, doAddRemote,
    newBranchName, setNewBranchName, switchingBranch, switchBranch, submitNewBranch,
    renamingBranch, renameValue, setRenameValue, renamingInFlight,
    startRenameBranch, cancelRenameBranch, submitRenameBranch,
    stashes, stashesLoading, stashMessage, setStashMessage, stashing, stashActionRef,
    doStashPush, doStashApply, doStashPop, doStashDrop,
    refresh, refreshBranchTree, refreshStashes,
  }
}
