// Config for the "Add Node" modal's file-scaffolding branch (Planning's
// NODES header) — the modal's Architecture/Language dropdown options and its
// role checkbox list. Languages themselves come from the one language table
// (tools/agentSkills/vendor/languages.mjs); this is the slice of it Planning
// can scaffold. No imports from graph/types.ts (that file imports these ids
// instead, never the reverse).
import { LANGUAGES as LANGUAGE_TABLE } from '../../../tools/agentSkills/vendor/languages.mjs'

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
  | 'c'
  | 'cpp'
  | 'java'
  | 'kotlin'
  | 'swift'
  | 'csharp'
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

// Every language the table marks as scaffoldable, in its order (which is also
// languageForExt's first-match order). A table entry joins this list — and
// LanguageId — when Planning gets templates for it.
export const LANGUAGES: LanguageDef[] = LANGUAGE_TABLE.flatMap((l) =>
  l.planning ? [{ id: l.id as LanguageId, label: l.label, ext: l.extensions[0], architectural: l.planning.architectural }] : [],
)

// The Add Node popup's language dropdown: every language Planning scaffolds,
// except jQuery (a flavor of JavaScript, reachable by typing "cart.js").
export const ADD_NODE_LANGUAGES: LanguageId[] = LANGUAGES.map((l) => l.id).filter((id) => id !== 'jquery')

// Architecture-free role list for the Add Node popup: every role is always
// offered, and the links are the union of what MVVM/MVC/MVP imply (a View
// imports whichever of ViewModel/Controller/Presenter exists; a ViewModel
// imports its Interface). 'node' here is the Markdown doc for the name.
export const ROLE_OPTIONS: RoleDef[] = [
  { id: 'node', label: 'Node', linksTo: [] },
  { id: 'view', label: 'View', linksTo: ['view-model', 'controller', 'presenter'] },
  { id: 'view-model', label: 'ViewModel', linksTo: ['interface'] },
  { id: 'interface', label: 'Interface', linksTo: [] },
  { id: 'controller', label: 'Controller', linksTo: [] },
  { id: 'presenter', label: 'Presenter', linksTo: [] },
]

export function isArchitecturalLanguage(id: LanguageId): boolean {
  return LANGUAGES.find((l) => l.id === id)?.architectural ?? true
}
