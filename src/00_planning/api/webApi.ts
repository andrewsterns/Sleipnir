// Web transport: talks to the local dev-only file API backed by
// vite.config.ts's sleipnir-api middleware. Only meaningful under `vite dev`
// — there's no server to call in a production web build.

import type {
  PlatformAPI,
  ComponentTier,
  ScaffoldLanguage,
  ScaffoldPart,
  ScaffoldComponentResult,
  FileTreeNode,
  ArchiveEntry,
  RunResult,
  Architecture,
  RefactorPlan,
} from './PlatformAPI'
import type { GraphNode } from '../graph/types'

async function asJson<T>(res: Response): Promise<T> {
  const data = await res.json()
  if (!res.ok || data.success === false) {
    throw new Error(data.error ?? `Request failed with status ${res.status}`)
  }
  return data as T
}

export const webApi: PlatformAPI = {
  scaffoldComponent(
    name: string,
    tier: ComponentTier,
    language?: ScaffoldLanguage,
    parts?: ScaffoldPart[],
  ): Promise<ScaffoldComponentResult> {
    return fetch('/api/sleipnir/scaffold-component', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, tier, language, parts }),
    }).then((res) => asJson<ScaffoldComponentResult>(res))
  },

  regenerateGraph(): Promise<{ stdout: string }> {
    return fetch('/api/sleipnir/regenerate-graph', { method: 'POST' }).then((res) =>
      asJson<{ stdout: string }>(res),
    )
  },

  readFile(path: string): Promise<{ content: string }> {
    return fetch(`/api/sleipnir/read-file?path=${encodeURIComponent(path)}`).then((res) =>
      asJson<{ content: string }>(res),
    )
  },

  writeFile(path: string, content: string): Promise<void> {
    return fetch('/api/sleipnir/write-file', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, content }),
    }).then((res) => asJson<void>(res))
  },

  listDir(path: string): Promise<{ tree: FileTreeNode[] }> {
    return fetch(`/api/sleipnir/list-dir?path=${encodeURIComponent(path)}`).then((res) =>
      asJson<{ tree: FileTreeNode[] }>(res),
    )
  },

  createFile(path: string, content?: string): Promise<void> {
    return fetch('/api/sleipnir/create-file', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, content }),
    }).then((res) => asJson<void>(res))
  },

  createDir(path: string): Promise<void> {
    return fetch('/api/sleipnir/create-dir', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
    }).then((res) => asJson<void>(res))
  },

  getArchivedPaths(): Promise<{ entries: ArchiveEntry[] }> {
    return fetch('/api/sleipnir/archive').then((res) => asJson<{ entries: ArchiveEntry[] }>(res))
  },

  setArchived(path: string, archived: boolean, label?: string): Promise<{ entries: ArchiveEntry[] }> {
    return fetch('/api/sleipnir/archive', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, archived, label }),
    }).then((res) => asJson<{ entries: ArchiveEntry[] }>(res))
  },

  getNotes(): Promise<{ notes: GraphNode[] }> {
    return fetch('/api/sleipnir/notes').then((res) => asJson<{ notes: GraphNode[] }>(res))
  },

  addNote(map: string, label: string, description?: string): Promise<{ node: GraphNode }> {
    return fetch('/api/sleipnir/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ map, label, description }),
    }).then((res) => asJson<{ node: GraphNode }>(res))
  },

  runScript(path: string): Promise<RunResult> {
    return fetch('/api/sleipnir/run-script', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
    }).then((res) => asJson<RunResult>(res))
  },

  previewRefactor(architecture: Architecture): Promise<RefactorPlan> {
    return fetch('/api/sleipnir/refactor/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ architecture }),
    }).then((res) => asJson<RefactorPlan>(res))
  },

  applyRefactor(architecture: Architecture): Promise<{ plan: RefactorPlan }> {
    return fetch('/api/sleipnir/refactor/apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ architecture }),
    }).then((res) => asJson<{ plan: RefactorPlan }>(res))
  },

  getCurrentArchitecture(): Promise<{ current: Architecture }> {
    return fetch('/api/sleipnir/refactor/current').then((res) => asJson<{ current: Architecture }>(res))
  },
}
