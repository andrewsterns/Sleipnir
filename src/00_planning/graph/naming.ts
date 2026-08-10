// Single source of truth for scaffold naming — the file name a role/language
// pair produces AND the primary symbol exported from it. Both graph/templates
// (which writes the declaration) and graph/importAdapters (which writes the
// import that references it) derive from here, so a file's name, its declared
// symbol, and the import that links to it can never drift out of agreement.

import { LANGUAGES, type LanguageId, type NodeRole } from './architectures'

export function toPascalCase(label: string): string {
  const words = label.trim().split(/[^a-zA-Z0-9]+/).filter(Boolean)
  return words.map((w) => w[0].toUpperCase() + w.slice(1)).join('') || 'Unnamed'
}

// camelCase (lower first letter) form — the file-name base for every language.
// Derived from the Pascal form so multi-word labels ("cool pineapple" ->
// "coolPineapple") stay consistent with the PascalCase type/symbol names.
export function toCamelCase(label: string): string {
  const pascal = toPascalCase(label)
  return pascal[0].toLowerCase() + pascal.slice(1)
}

// PascalCase suffix appended after the name for each role — keeps the
// architecture role visible in the file name and the declared symbol alike.
// 'node' (the always-available plain node) carries no suffix.
export const ROLE_SUFFIX: Record<NodeRole, string> = {
  node: '',
  view: 'View',
  'view-model': 'ViewModel',
  interface: 'Interface',
  controller: 'Controller',
  presenter: 'Presenter',
}

export function extForLanguage(language: LanguageId): string {
  return LANGUAGES.find((l) => l.id === language)?.ext ?? 'txt'
}

// `<camelName><Role>.<ext>` — e.g. pineappleView.rs, pineappleViewModel.tsx,
// pineapple.html (node role → no suffix).
export function scaffoldFileName(language: LanguageId, role: NodeRole, label: string): string {
  return `${toCamelCase(label)}${ROLE_SUFFIX[role]}.${extForLanguage(language)}`
}

// The symbol a rust/python/go file declares and exposes for import:
// `<Pascal><Role>` (node → bare `<Pascal>`).
export function typeExportName(role: NodeRole, label: string): string {
  return `${toPascalCase(label)}${ROLE_SUFFIX[role]}`
}

// The symbol a JS/TS-family file (typescript/javascript/react/jquery) exports.
// View is a component/const (`PascalView`); view-model/controller/presenter are
// hooks (`usePascalViewModel`, React-idiomatic); interface/node are plain
// PascalCase. Matches the declarations graph/templates emits for those roles.
export function jsExportName(role: NodeRole, label: string): string {
  const pascal = toPascalCase(label)
  switch (role) {
    case 'node':
      return pascal
    case 'view':
      return `${pascal}View`
    case 'view-model':
      return `use${pascal}ViewModel`
    case 'controller':
      return `use${pascal}Controller`
    case 'presenter':
      return `use${pascal}Presenter`
    case 'interface':
      return `${pascal}Interface`
  }
}
