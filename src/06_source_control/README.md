# 06_source_control: Source Control

A Git panel, outside the 00–05 pipeline sequence — a standalone utility
reachable from its own nav-rail entry (`GIT`), not a pipeline stage. It's
host-agnostic: it works against whatever remote the current repo actually
has (GitHub, for this repo), by shelling out to the system `git` binary.

## 1. Directory structure
- `SourceControlView.tsx` — Status list (staged/unstaged/untracked/conflicted),
  per-file diff view, stage/unstage, commit, branch list and branch-tree view,
  checkout, create branch, and push/pull/fetch.
- `SourceControlView.ViewModel.tsx` — Fetches/mutates all of the above via
  `PlatformAPI` (`src/00_planning/api/sleipnirApi.ts`), which is backed by
  `tools/git-control.mjs` on both the Electron and web transports.

## 2. Notes
- No git npm dependency — `tools/git-control.mjs` calls the real `git` CLI
  via `execFile`, so behavior matches what you'd see in a terminal.
- First push on a new branch auto-adds `--set-upstream origin <branch>`.
- See the root [`ARCHITECTURE.md`](../../ARCHITECTURE.md) §10 for the backend
  details.
