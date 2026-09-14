// Public entry point the rest of the app imports from — unchanged on
// purpose, so none of its existing consumers need to change. Internally it
// picks a PlatformAPI transport (web fetch vs. Electron IPC) at runtime and
// re-exports the same named functions either way.

import type { PlatformAPI, ArchiveEntry } from './PlatformAPI'
import type { GraphNode } from '../graph/types'
import { webApi } from './webApi'
import { getElectronApi } from './electronApi'

export type {
  FileTreeNode,
  ArchiveEntry,
  RunResult,
  GitStatus,
  GitFileStatus,
  GitBranch,
  GitBranchTree,
  GitBranchTreeEntry,
  GitCommitSummary,
  GitCommitNode,
  GitCommitGraph,
  GitCommitFileMap,
  GitOpResult,
  GitIdentity,
  GitStash,
  PreviewConfig,
  PreviewConfigEntry,
  RecentProject,
} from './PlatformAPI'

function getPlatformAPI(): PlatformAPI {
  return getElectronApi() ?? webApi
}

export function regenerateGraph(...args: Parameters<PlatformAPI['regenerateGraph']>) {
  return getPlatformAPI().regenerateGraph(...args)
}

export function readFile(...args: Parameters<PlatformAPI['readFile']>) {
  return getPlatformAPI().readFile(...args)
}

export function writeFile(...args: Parameters<PlatformAPI['writeFile']>) {
  return getPlatformAPI().writeFile(...args)
}

export function listDir(...args: Parameters<PlatformAPI['listDir']>) {
  return getPlatformAPI().listDir(...args)
}

export function listRepoDir(...args: Parameters<PlatformAPI['listRepoDir']>) {
  return getPlatformAPI().listRepoDir(...args)
}

export function readRepoFile(...args: Parameters<PlatformAPI['readRepoFile']>) {
  return getPlatformAPI().readRepoFile(...args)
}

export function writeRepoFile(...args: Parameters<PlatformAPI['writeRepoFile']>) {
  return getPlatformAPI().writeRepoFile(...args)
}

export function createFile(...args: Parameters<PlatformAPI['createFile']>) {
  return getPlatformAPI().createFile(...args)
}

export function createDir(...args: Parameters<PlatformAPI['createDir']>) {
  return getPlatformAPI().createDir(...args)
}

export function getWorkspaceInfo(...args: Parameters<PlatformAPI['getWorkspaceInfo']>) {
  return getPlatformAPI().getWorkspaceInfo(...args)
}

export function listWorkspaceDir(...args: Parameters<PlatformAPI['listWorkspaceDir']>) {
  return getPlatformAPI().listWorkspaceDir(...args)
}

export function readWorkspaceFile(...args: Parameters<PlatformAPI['readWorkspaceFile']>) {
  return getPlatformAPI().readWorkspaceFile(...args)
}

export function writeWorkspaceFile(...args: Parameters<PlatformAPI['writeWorkspaceFile']>) {
  return getPlatformAPI().writeWorkspaceFile(...args)
}

export function createWorkspaceFile(...args: Parameters<PlatformAPI['createWorkspaceFile']>) {
  return getPlatformAPI().createWorkspaceFile(...args)
}

export function createWorkspaceDir(...args: Parameters<PlatformAPI['createWorkspaceDir']>) {
  return getPlatformAPI().createWorkspaceDir(...args)
}

export function deleteWorkspacePath(...args: Parameters<PlatformAPI['deleteWorkspacePath']>) {
  return getPlatformAPI().deleteWorkspacePath(...args)
}

export function renameWorkspacePath(...args: Parameters<PlatformAPI['renameWorkspacePath']>) {
  return getPlatformAPI().renameWorkspacePath(...args)
}

export function copyWorkspacePath(...args: Parameters<PlatformAPI['copyWorkspacePath']>) {
  return getPlatformAPI().copyWorkspacePath(...args)
}

export function searchWorkspace(...args: Parameters<PlatformAPI['searchWorkspace']>) {
  return getPlatformAPI().searchWorkspace(...args)
}

export function detectPreviewConfig(...args: Parameters<PlatformAPI['detectPreviewConfig']>) {
  return getPlatformAPI().detectPreviewConfig(...args)
}

export function getPreviewConfig(...args: Parameters<PlatformAPI['getPreviewConfig']>) {
  return getPlatformAPI().getPreviewConfig(...args)
}

export function setPreviewConfig(...args: Parameters<PlatformAPI['setPreviewConfig']>) {
  return getPlatformAPI().setPreviewConfig(...args)
}

export function getArchivedPaths(...args: Parameters<PlatformAPI['getArchivedPaths']>) {
  return getPlatformAPI().getArchivedPaths(...args)
}

export function setArchived(...args: Parameters<PlatformAPI['setArchived']>) {
  return getPlatformAPI().setArchived(...args)
}

export function getNotes(...args: Parameters<PlatformAPI['getNotes']>) {
  return getPlatformAPI().getNotes(...args)
}

export function addNote(...args: Parameters<PlatformAPI['addNote']>) {
  return getPlatformAPI().addNote(...args)
}

export function scaffoldNodes(...args: Parameters<PlatformAPI['scaffoldNodes']>) {
  return getPlatformAPI().scaffoldNodes(...args)
}

export function createPlanNode(...args: Parameters<PlatformAPI['createPlanNode']>) {
  return getPlatformAPI().createPlanNode(...args)
}

export function proposeFileNode(...args: Parameters<PlatformAPI['proposeFileNode']>) {
  return getPlatformAPI().proposeFileNode(...args)
}

export function setNodeStatus(...args: Parameters<PlatformAPI['setNodeStatus']>) {
  return getPlatformAPI().setNodeStatus(...args)
}

export function setNodeBorrows(...args: Parameters<PlatformAPI['setNodeBorrows']>) {
  return getPlatformAPI().setNodeBorrows(...args)
}

export function updateNote(...args: Parameters<PlatformAPI['updateNote']>) {
  return getPlatformAPI().updateNote(...args)
}

export function deleteNote(...args: Parameters<PlatformAPI['deleteNote']>) {
  return getPlatformAPI().deleteNote(...args)
}

// Not a passthrough like the exports above — a small derived helper built on
// getNotes(), shared by every "delete this file, does a plan node need to go
// too" flow (Workspace's DeletePathModal, the Canvas layers panel). Plan
// nodes are scaffolded with a Workspace-relative filePath (see
// tools/sleipnir-backend.mjs#scaffoldNodes). A file match is exact; a folder
// match is every node whose file lives under it, so deleting a scaffolded
// feature's folder can clear its nodes in one go.
export async function planNodesUnderPath(path: string, isDir: boolean): Promise<GraphNode[]> {
  const { nodes } = await getNotes()
  return nodes.filter((n) =>
    !!n.filePath && (isDir ? n.filePath === path || n.filePath.startsWith(`${path}/`) : n.filePath === path),
  )
}

export function getNodeStages(...args: Parameters<PlatformAPI['getNodeStages']>) {
  return getPlatformAPI().getNodeStages(...args)
}

export function setNodeStage(...args: Parameters<PlatformAPI['setNodeStage']>) {
  return getPlatformAPI().setNodeStage(...args)
}

export function setDefaultNodeStages(...args: Parameters<PlatformAPI['setDefaultNodeStages']>) {
  return getPlatformAPI().setDefaultNodeStages(...args)
}

export function getPlans(...args: Parameters<PlatformAPI['getPlans']>) {
  return getPlatformAPI().getPlans(...args)
}

export function createPlan(...args: Parameters<PlatformAPI['createPlan']>) {
  return getPlatformAPI().createPlan(...args)
}

export function appendPlanGeneratedFiles(...args: Parameters<PlatformAPI['appendPlanGeneratedFiles']>) {
  return getPlatformAPI().appendPlanGeneratedFiles(...args)
}

export function addPlanNodes(...args: Parameters<PlatformAPI['addPlanNodes']>) {
  return getPlatformAPI().addPlanNodes(...args)
}

export function addPlanAssets(...args: Parameters<PlatformAPI['addPlanAssets']>) {
  return getPlatformAPI().addPlanAssets(...args)
}

export function approvePlanNodes(...args: Parameters<PlatformAPI['approvePlanNodes']>) {
  return getPlatformAPI().approvePlanNodes(...args)
}

export function renamePlan(...args: Parameters<PlatformAPI['renamePlan']>) {
  return getPlatformAPI().renamePlan(...args)
}

export function deletePlan(...args: Parameters<PlatformAPI['deletePlan']>) {
  return getPlatformAPI().deletePlan(...args)
}

// Electron-only — no PlatformAPI transport exists for this (see
// electronApi.ts's ElectronBridge comment). Callers get `undefined` when
// running in a plain browser tab (`npm run dev`, no Electron shell) and
// should treat that as "unavailable", e.g. disabling the menu item.
export function openWorkspace() {
  return window.electronAPI?.openWorkspace?.()
}

// Saves the current scratch/unsaved project into a real folder the user picks.
// Electron-only (native folder picker + fs relocation); `undefined` in a plain
// browser tab, where there's no scratch fallback to save.
export function saveScratchToFolder() {
  return window.electronAPI?.saveScratchToFolder?.()
}

// Project switching — also Electron-only, same reasoning as openWorkspace
// above. `undefined` in a plain browser tab; callers should treat that as
// "unavailable" (e.g. disabling the File menu's Open Recent/New Window items).
export function getRecentProjects() {
  return window.electronAPI?.getRecentProjects?.()
}

export function openRecentProject(projectPath: string) {
  return window.electronAPI?.openRecentProject?.(projectPath)
}

// Forgets every entry in File > Open Recent. Doesn't close the open project
// or touch anything on disk — only the stored list.
export function clearRecentProjects() {
  return window.electronAPI?.clearRecentProjects?.()
}

export function newWindow() {
  return window.electronAPI?.newWindow?.()
}

export function renameProject(projectPath: string, name: string) {
  return window.electronAPI?.renameProject?.(projectPath, name)
}

// Electron-only, like the project-switching calls above: the web transport never
// calls openWorkspace (see vite.config.ts), so it never scaffolds a project and
// has nothing to report. Callers feature-detect on an undefined result.
export function getAgentScaffolding() {
  return window.electronAPI?.getAgentScaffolding?.()
}

export function setAgentScaffolding(patch: { commit?: boolean }) {
  return window.electronAPI?.setAgentScaffolding?.(patch)
}

export function runScript(...args: Parameters<PlatformAPI['runScript']>) {
  return getPlatformAPI().runScript(...args)
}

export function getGitStatus(...args: Parameters<PlatformAPI['getGitStatus']>) {
  return getPlatformAPI().getGitStatus(...args)
}

export function getGitDiff(...args: Parameters<PlatformAPI['getGitDiff']>) {
  return getPlatformAPI().getGitDiff(...args)
}

export function stageFiles(...args: Parameters<PlatformAPI['stageFiles']>) {
  return getPlatformAPI().stageFiles(...args)
}

export function unstageFiles(...args: Parameters<PlatformAPI['unstageFiles']>) {
  return getPlatformAPI().unstageFiles(...args)
}

export function discardFiles(...args: Parameters<PlatformAPI['discardFiles']>) {
  return getPlatformAPI().discardFiles(...args)
}

export function commitChanges(...args: Parameters<PlatformAPI['commitChanges']>) {
  return getPlatformAPI().commitChanges(...args)
}

export function getBranches(...args: Parameters<PlatformAPI['getBranches']>) {
  return getPlatformAPI().getBranches(...args)
}

export function getBranchTree(...args: Parameters<PlatformAPI['getBranchTree']>) {
  return getPlatformAPI().getBranchTree(...args)
}

export function getCommitGraph(...args: Parameters<PlatformAPI['getCommitGraph']>) {
  return getPlatformAPI().getCommitGraph(...args)
}

export function getCommitFileMap(...args: Parameters<PlatformAPI['getCommitFileMap']>) {
  return getPlatformAPI().getCommitFileMap(...args)
}

export function checkoutBranch(...args: Parameters<PlatformAPI['checkoutBranch']>) {
  return getPlatformAPI().checkoutBranch(...args)
}

export function createBranch(...args: Parameters<PlatformAPI['createBranch']>) {
  return getPlatformAPI().createBranch(...args)
}

export function renameBranch(...args: Parameters<PlatformAPI['renameBranch']>) {
  return getPlatformAPI().renameBranch(...args)
}

export function gitPush(...args: Parameters<PlatformAPI['gitPush']>) {
  return getPlatformAPI().gitPush(...args)
}

export function gitPull(...args: Parameters<PlatformAPI['gitPull']>) {
  return getPlatformAPI().gitPull(...args)
}

export function gitFetch(...args: Parameters<PlatformAPI['gitFetch']>) {
  return getPlatformAPI().gitFetch(...args)
}

export function gitStashPush(...args: Parameters<PlatformAPI['gitStashPush']>) {
  return getPlatformAPI().gitStashPush(...args)
}

export function gitStashList(...args: Parameters<PlatformAPI['gitStashList']>) {
  return getPlatformAPI().gitStashList(...args)
}

export function gitStashApply(...args: Parameters<PlatformAPI['gitStashApply']>) {
  return getPlatformAPI().gitStashApply(...args)
}

export function gitStashPop(...args: Parameters<PlatformAPI['gitStashPop']>) {
  return getPlatformAPI().gitStashPop(...args)
}

export function gitStashDrop(...args: Parameters<PlatformAPI['gitStashDrop']>) {
  return getPlatformAPI().gitStashDrop(...args)
}

export function gitInit() {
  return getPlatformAPI().gitInit?.()
}

export function gitAddRemote(url: string, name?: string) {
  return getPlatformAPI().gitAddRemote?.(url, name)
}

// Clone a repo from a URL, then open it as this window's project — Electron-only
// (native destination picker), same reasoning as openWorkspace above.
export function cloneRepo(url: string) {
  return window.electronAPI?.cloneRepo?.(url)
}

export function getGitIdentity(...args: Parameters<PlatformAPI['getGitIdentity']>) {
  return getPlatformAPI().getGitIdentity(...args)
}

export function setGitIdentity(...args: Parameters<PlatformAPI['setGitIdentity']>) {
  return getPlatformAPI().setGitIdentity(...args)
}

// A path is archived if it's an exact match, or falls under an archived
// directory prefix (archiving a folder archives its whole
// View/ViewModel/interface "series" as one entry).
export function isArchived(targetPath: string, entries: ArchiveEntry[]): boolean {
  return entries.some((e) => targetPath === e.path || targetPath.startsWith(`${e.path}/`))
}

const LAST_VISIT_KEY = 'sleipnir:browser:lastVisit'

export function getLastVisit(): number {
  const raw = localStorage.getItem(LAST_VISIT_KEY)
  return raw ? Number(raw) : 0
}

export function setLastVisit(timestamp: number): void {
  localStorage.setItem(LAST_VISIT_KEY, String(timestamp))
}
