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

export function readFile(...args: Parameters<PlatformAPI['readFile']>) {
  return getPlatformAPI().readFile(...args)
}

export function writeFile(...args: Parameters<PlatformAPI['writeFile']>) {
  return getPlatformAPI().writeFile(...args)
}

export function listDir(...args: Parameters<PlatformAPI['listDir']>) {
  return getPlatformAPI().listDir(...args)
}

export function createFile(...args: Parameters<PlatformAPI['createFile']>) {
  return getPlatformAPI().createFile(...args)
}

export function createDir(...args: Parameters<PlatformAPI['createDir']>) {
  return getPlatformAPI().createDir(...args)
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
