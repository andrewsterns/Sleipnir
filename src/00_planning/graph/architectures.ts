// Config for the "Add Node" modal's file-scaffolding branch (Planning's
// NODES header) — single source of truth for the modal's Architecture/
// Language dropdown options and its role checkbox list. Self-contained, no
// imports from graph/types.ts (that file imports these ids instead, never
// the reverse).

export type NodeRole = 'node' | 'view' | 'view-model' | 'interface' | 'controller' | 'presenter'
// The JS/TS family (typescript/javascript/react/jquery) differ only by
// extension + scaffold content flavor — they all share one import adapter
// (see importAdapters/index.ts). html/css are architecture-less single files.
export type LanguageId =
  | 'typescript'
  | 'javascript'
  | 'react'
  | 'jquery'
  | 'python'
  | 'rust'
  | 'go'
  | 'html'
  | 'css'
export type ArchitectureId = 'mvvm' | 'mvc' | 'mvp'

export interface RoleDef {
  id: NodeRole
  label: string
  /** Roles this one auto-imports when both are checked in the same scaffold batch — see AddNodeModal.ViewModel's `links` computation. */
  linksTo: NodeRole[]
}

// Always available regardless of architecture — prepended to every
// architecture's own role list by rolesForArchitecture below. Not part of
// the auto-link chain itself (nothing points at or from it by default).
export const NODE_ROLE: RoleDef = { id: 'node', label: 'Node', linksTo: [] }

export interface ArchitectureDef {
  id: ArchitectureId
  label: string
  roles: RoleDef[]
}

export const ARCHITECTURES: ArchitectureDef[] = [
  {
    id: 'mvvm',
    label: 'MVVM',
    roles: [
      { id: 'view', label: 'View', linksTo: ['view-model'] },
      { id: 'view-model', label: 'ViewModel', linksTo: ['interface'] },
      { id: 'interface', label: 'Interface', linksTo: [] },
    ],
  },
  {
    id: 'mvc',
    label: 'MVC',
    roles: [
      { id: 'view', label: 'View', linksTo: ['controller'] },
      { id: 'controller', label: 'Controller', linksTo: [] },
    ],
  },
  {
    id: 'mvp',
    label: 'MVP',
    roles: [
      { id: 'view', label: 'View', linksTo: ['presenter'] },
      { id: 'presenter', label: 'Presenter', linksTo: [] },
    ],
  },
]

export function rolesForArchitecture(id: ArchitectureId): RoleDef[] {
  const architecture = ARCHITECTURES.find((a) => a.id === id)
  return [NODE_ROLE, ...(architecture?.roles ?? [])]
}

export interface LanguageDef {
  id: LanguageId
  label: string
  /** File extension, no leading dot. */
  ext: string
  /** Whether this language participates in the Architecture/role scaffolding. False for html/css, which are always a single file with no role suffix and no Architecture dropdown. */
  architectural: boolean
}

export const LANGUAGES: LanguageDef[] = [
  { id: 'react', label: 'React (TSX)', ext: 'tsx', architectural: true },
  { id: 'typescript', label: 'TypeScript', ext: 'ts', architectural: true },
  { id: 'javascript', label: 'JavaScript', ext: 'js', architectural: true },
  { id: 'jquery', label: 'jQuery', ext: 'js', architectural: true },
  { id: 'python', label: 'Python', ext: 'py', architectural: true },
  { id: 'rust', label: 'Rust', ext: 'rs', architectural: true },
  { id: 'go', label: 'Go', ext: 'go', architectural: true },
  { id: 'html', label: 'HTML', ext: 'html', architectural: false },
  { id: 'css', label: 'CSS', ext: 'css', architectural: false },
]

export function isArchitecturalLanguage(id: LanguageId): boolean {
  return LANGUAGES.find((l) => l.id === id)?.architectural ?? true
}
