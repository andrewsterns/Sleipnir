// Public entry point the rest of the app imports from — unchanged on
// purpose, so none of its existing consumers need to change. Internally it
// picks a PlatformAPI transport (web fetch vs. Electron IPC) at runtime and
// re-exports the same named functions either way.

import type { PlatformAPI, ArchiveEntry } from './PlatformAPI'
import { webApi } from './webApi'
import { getElectronApi } from './electronApi'

export type {
  ComponentTier,
  ScaffoldLanguage,
  ScaffoldPart,
  ScaffoldComponentResult,
  FileTreeNode,
  ArchiveEntry,
  RunResult,
  Architecture,
  RefactorPlan,
  RefactorMove,
  RefactorRewrite,
  RefactorViolation,
  LibraryEntry,
  LibraryKind,
  WidgetEntry,
  WidgetKind,
  NewWidgetInput,
  WidgetCatalogEntry,
  GitStatus,
  GitFileStatus,
  GitBranch,
  GitBranchTree,
  GitBranchTreeEntry,
  GitCommitSummary,
  GitOpResult,
  GitIdentity,
  PreviewConfig,
  PreviewConfigEntry,
} from './PlatformAPI'

function getPlatformAPI(): PlatformAPI {
  return getElectronApi() ?? webApi
}

export function scaffoldComponent(...args: Parameters<PlatformAPI['scaffoldComponent']>) {
  return getPlatformAPI().scaffoldComponent(...args)
}

export function regenerateGraph(...args: Parameters<PlatformAPI['regenerateGraph']>) {
  return getPlatformAPI().regenerateGraph(...args)
}

export function createLibrary(...args: Parameters<PlatformAPI['createLibrary']>) {
  return getPlatformAPI().createLibrary(...args)
}

export function listLibraries(...args: Parameters<PlatformAPI['listLibraries']>) {
  return getPlatformAPI().listLibraries(...args)
}

export function removeLibrary(...args: Parameters<PlatformAPI['removeLibrary']>) {
  return getPlatformAPI().removeLibrary(...args)
}

export function deleteLibrary(...args: Parameters<PlatformAPI['deleteLibrary']>) {
  return getPlatformAPI().deleteLibrary(...args)
}

export function listWidgets(...args: Parameters<PlatformAPI['listWidgets']>) {
  return getPlatformAPI().listWidgets(...args)
}

export function installWidget(...args: Parameters<PlatformAPI['installWidget']>) {
  return getPlatformAPI().installWidget(...args)
}

export function getWidgetCatalog(...args: Parameters<PlatformAPI['getWidgetCatalog']>) {
  return getPlatformAPI().getWidgetCatalog(...args)
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

export function importPath(...args: Parameters<PlatformAPI['importPath']>) {
  return getPlatformAPI().importPath(...args)
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

export function searchRepo(...args: Parameters<PlatformAPI['searchRepo']>) {
  return getPlatformAPI().searchRepo(...args)
}

export function searchWorkspace(...args: Parameters<PlatformAPI['searchWorkspace']>) {
  return getPlatformAPI().searchWorkspace(...args)
}

export function listRepoTree(...args: Parameters<PlatformAPI['listRepoTree']>) {
  return getPlatformAPI().listRepoTree(...args)
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

export function createPlanNode(...args: Parameters<PlatformAPI['createPlanNode']>) {
  return getPlatformAPI().createPlanNode(...args)
}

export function setNodeStatus(...args: Parameters<PlatformAPI['setNodeStatus']>) {
  return getPlatformAPI().setNodeStatus(...args)
}

export function openFileNode(...args: Parameters<PlatformAPI['openFileNode']>) {
  return getPlatformAPI().openFileNode(...args)
}

export function getPlans(...args: Parameters<PlatformAPI['getPlans']>) {
  return getPlatformAPI().getPlans(...args)
}

export function createPlan(...args: Parameters<PlatformAPI['createPlan']>) {
  return getPlatformAPI().createPlan(...args)
}

export function deletePlan(...args: Parameters<PlatformAPI['deletePlan']>) {
  return getPlatformAPI().deletePlan(...args)
}

// Electron-only — no PlatformAPI transport exists for these (see
// electronApi.ts's ElectronBridge comment). Callers get `undefined` when
// running in a plain browser tab (`npm run dev`, no Electron shell) and
// should treat that as "unavailable", e.g. disabling the menu item.
export function openFileDialog() {
  return window.electronAPI?.openFileDialog?.()
}

export function importDialog() {
  return window.electronAPI?.importDialog?.()
}

export function openFolderDialog() {
  return window.electronAPI?.openFolderDialog?.()
}

export function openWorkspace() {
  return window.electronAPI?.openWorkspace?.()
}

export function runScript(...args: Parameters<PlatformAPI['runScript']>) {
  return getPlatformAPI().runScript(...args)
}

export function previewRefactor(...args: Parameters<PlatformAPI['previewRefactor']>) {
  return getPlatformAPI().previewRefactor(...args)
}

export function applyRefactor(...args: Parameters<PlatformAPI['applyRefactor']>) {
  return getPlatformAPI().applyRefactor(...args)
}

export function getCurrentArchitecture(...args: Parameters<PlatformAPI['getCurrentArchitecture']>) {
  return getPlatformAPI().getCurrentArchitecture(...args)
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

export function commitChanges(...args: Parameters<PlatformAPI['commitChanges']>) {
  return getPlatformAPI().commitChanges(...args)
}

export function getBranches(...args: Parameters<PlatformAPI['getBranches']>) {
  return getPlatformAPI().getBranches(...args)
}

export function getBranchTree(...args: Parameters<PlatformAPI['getBranchTree']>) {
  return getPlatformAPI().getBranchTree(...args)
}

export function checkoutBranch(...args: Parameters<PlatformAPI['checkoutBranch']>) {
  return getPlatformAPI().checkoutBranch(...args)
}

export function createBranch(...args: Parameters<PlatformAPI['createBranch']>) {
  return getPlatformAPI().createBranch(...args)
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

export function getGitIdentity(...args: Parameters<PlatformAPI['getGitIdentity']>) {
  return getPlatformAPI().getGitIdentity(...args)
}

export function setGitIdentity(...args: Parameters<PlatformAPI['setGitIdentity']>) {
  return getPlatformAPI().setGitIdentity(...args)
}

// A path is archived if it's an exact match, or falls under an archived
// directory prefix (archiving a component's folder archives its whole
// View/ViewModel/interface "series" as one entry).
export function isArchived(targetPath: string, entries: ArchiveEntry[]): boolean {
  return entries.some((e) => targetPath === e.path || targetPath.startsWith(`${e.path}/`))
}

const LAST_VISIT_KEY = 'sleipnir:library:lastVisit'

export function getLastVisit(): number {
  const raw = localStorage.getItem(LAST_VISIT_KEY)
  return raw ? Number(raw) : 0
}

export function setLastVisit(timestamp: number): void {
  localStorage.setItem(LAST_VISIT_KEY, String(timestamp))
}
