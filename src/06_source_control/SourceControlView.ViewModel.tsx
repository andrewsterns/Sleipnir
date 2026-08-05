import { useCallback, useEffect, useState } from 'react'
import {
  getGitStatus,
  getGitDiff,
  stageFiles,
  unstageFiles,
  commitChanges,
  getBranches,
  getBranchTree,
  checkoutBranch,
  createBranch,
  gitPush,
  gitPull,
  gitFetch,
  type GitStatus,
  type GitFileStatus,
  type GitBranch,
  type GitBranchTree,
  type GitOpResult,
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

  const [selected, setSelected] = useState<SelectedFile | null>(null)
  const [diff, setDiff] = useState('')
  const [diffLoading, setDiffLoading] = useState(false)

  const [commitMessage, setCommitMessage] = useState('')
  const [committing, setCommitting] = useState(false)

  const [pushing, setPushing] = useState(false)
  const [pulling, setPulling] = useState(false)
  const [fetching, setFetching] = useState(false)
  const [opResult, setOpResult] = useState<GitOpResult | null>(null)

  const [newBranchName, setNewBranchName] = useState('')
  const [switchingBranch, setSwitchingBranch] = useState(false)

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

  useEffect(() => {
    refresh()
    refreshBranchTree()
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

  const staged = status?.files.filter((f) => f.staged) ?? []
  const unstaged = status?.files.filter((f) => !f.staged && !f.untracked) ?? []
  const untracked = status?.files.filter((f) => f.untracked) ?? []

  return {
    status, branches, loading, error,
    branchTree, branchTreeLoading,
    staged, unstaged, untracked,
    selected, diff, diffLoading, selectFile, clearSelection,
    toggleStage,
    commitMessage, setCommitMessage, committing, commit,
    pushing, pulling, fetching, opResult, doPush, doPull, doFetch,
    newBranchName, setNewBranchName, switchingBranch, switchBranch, submitNewBranch,
    refresh,
  }
}
