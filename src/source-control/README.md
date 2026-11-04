# source-control: Source Control

A Git panel, reachable from its own nav-rail entry (`Git`). It's
host-agnostic: it works against whatever remote the current repo actually
has (GitHub, for this repo), by shelling out to the system `git` binary.

## 1. Directory structure
- `SourceControlView.tsx` — Status list (staged/unstaged/untracked/conflicted),
  per-file diff view, stage/unstage, commit, branch list and branch-tree view,
  checkout, create branch, and push/pull/fetch.
- `SourceControlView.ViewModel.tsx` — Fetches/mutates all of the above via
  `PlatformAPI` (`src/platform/sleipnirApi.ts`), which is backed by
  `tools/git-control.mjs` on both the Electron and web transports.

## 2. Notes
- No git npm dependency — `tools/git-control.mjs` calls the real `git` CLI
  via `execFile`, so behavior matches what you'd see in a terminal.
- First push on a new branch auto-adds `--set-upstream origin <branch>`.
- See the root [`ARCHITECTURE.md`](../../ARCHITECTURE.md) §10 for the backend
  details.
