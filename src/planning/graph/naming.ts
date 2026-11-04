// Single source of truth for scaffold naming — the file name a role/language
// pair produces AND the primary symbol exported from it. Both graph/templates
// (which writes the declaration) and graph/importAdapters (which writes the
// import that references it) derive from here, so a file's name, its declared
// symbol, and the import that links to it can never drift out of agreement.

import { LANGUAGES, type LanguageId, type NodeRole } from './architectures'
import { extensionMap, LANGUAGES as LANGUAGE_TABLE } from '../../../tools/agentSkills/vendor/languages.mjs'

// Every extension of every scaffoldable language — .mjs and .cjs too, not just
// the one scaffolds write — mapped first-match like the planning CLI does.
const PLANNING_EXTENSIONS = extensionMap(LANGUAGE_TABLE.filter((l) => l.planning))

export function toPascalCase(label: string): string {
  const words = label.trim().split(/[^a-zA-Z0-9]+/).filter(Boolean)
  return words.map((w) => w[0].toUpperCase() + w.slice(1)).join('') || 'Unnamed'
}

// camelCase (lower first letter) form — the file-name base for the JS family.
// Derived from the Pascal form so multi-word labels ("cool pineapple" ->
// "coolPineapple") stay consistent with the PascalCase type/symbol names.
export function toCamelCase(label: string): string {
  const pascal = toPascalCase(label)
  return pascal[0].toLowerCase() + pascal.slice(1)
}

// snake_case form — the file-name base for C, Rust, Python and Go ("cool
// pineapple view" -> "cool_pineapple_view"), from the camel form so word
// boundaries agree with the symbol names.
export function toSnakeCase(label: string): string {
  return toCamelCase(label)
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
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

// Reverse of extForLanguage: the language whose file extensions include `ext`
// (a leading dot is tolerated, case-insensitive), or null when nothing matches.
// First match in the language table wins, so the shared-extension families
// resolve to their canonical member — `js` → javascript (not jquery), `tsx` →
// react, `mjs` → javascript.
export function languageForExt(ext: string): LanguageId | null {
  const e = ext.toLowerCase().replace(/^\./, '')
  return (PLANNING_EXTENSIONS[e] as LanguageId | undefined) ?? null
}

// Splits a user-typed node/file name into its base and the language its
// trailing extension implies — so naming a node "MyFile.css" both selects the
// CSS filetype AND drops the ".css" from the base, instead of scaffolding a
// redundant "myFileCss.css". Strips repeated recognized extensions (a name
// typed with the extension already doubled, "MyFile.css.css", still reduces to
// "MyFile") and keeps the OUTERMOST recognized extension as the language.
// Only recognized language extensions are stripped: "v1.2" or "app.config"
// pass through untouched. Never strips a name down to nothing.
export function splitLabelExtension(label: string): { base: string; language: LanguageId | null } {
  let base = label.trim()
  let language: LanguageId | null = null
  for (;;) {
    const m = base.match(/^(.+)\.([A-Za-z0-9]+)$/)
    if (!m) break
    const lang = languageForExt(m[2])
    if (!lang || !m[1].trim()) break
    base = m[1].trim()
    language = language ?? lang
  }
  return { base, language }
}

// `<name><Role>.<ext>` in the language's own file-naming convention (the
// language table's `naming`): pineappleViewModel.tsx, pineapple_view_model.rs,
// PineappleViewModel.java — Java requires its file to be named after its class,
// and Rust and Python import modules by snake_case name. `header` picks a C or
// C++ header's extension (.h / .hpp) over the source's.
export function scaffoldFileName(language: LanguageId, role: NodeRole, label: string, { header = false }: { header?: boolean } = {}): string {
  const camel = `${toCamelCase(label)}${ROLE_SUFFIX[role]}`
  const naming = LANGUAGE_TABLE.find((l) => l.id === language)?.naming ?? 'camel'
  const base = naming === 'snake' ? toSnakeCase(camel) : naming === 'pascal' ? camel[0].toUpperCase() + camel.slice(1) : camel
  const ext = header ? (headerExtFor(language) ?? extForLanguage(language)) : extForLanguage(language)
  return `${base}.${ext}`
}

/** Whether `path` is a header of `language` (sensor.h in C, engine.hpp in C++). */
export function isHeaderPath(language: LanguageId, path: string): boolean {
  const ext = path.match(/\.([A-Za-z0-9]+)$/)?.[1]?.toLowerCase() ?? ''
  return !!LANGUAGE_TABLE.find((l) => l.id === language)?.headerExtensions?.includes(ext)
}

/** A C-family language's header extension (.h for C, .hpp for C++); null for languages without headers. */
export function headerExtFor(language: LanguageId): string | null {
  return LANGUAGE_TABLE.find((l) => l.id === language)?.headerExtensions?.[0] ?? null
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
