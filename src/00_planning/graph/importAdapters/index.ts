import type { LanguageId } from '../architectures'
import type { ImportAdapter } from './types'
import { tsxAdapter } from './tsxAdapter'
import { pythonAdapter } from './pythonAdapter'
import { rustAdapter } from './rustAdapter'
import { goAdapter } from './goAdapter'
import { cAdapter, cppAdapter } from './cAdapter'
import { javaAdapter, kotlinAdapter } from './jvmAdapter'
import { extensionMap, LANGUAGES } from '../../../../tools/agentSkills/vendor/languages.mjs'

// Every call site (scaffold-time auto-linking, file-save edge detection,
// the "##token" editor extension, the node-card link editor) reaches every
// language purely through this table. The whole JS/TS family shares one
// adapter (ES import syntax); html/css have no import model, so they map to
// null and simply get no auto-linking. Swift and C# don't import files at all
// (a module or namespace sees all its types), so there is nothing per-file to
// detect or write.
const ADAPTERS: Record<LanguageId, ImportAdapter | null> = {
  typescript: tsxAdapter,
  javascript: tsxAdapter,
  react: tsxAdapter,
  jquery: tsxAdapter,
  python: pythonAdapter,
  rust: rustAdapter,
  go: goAdapter,
  html: null,
  css: null,
  c: cAdapter,
  cpp: cppAdapter,
  java: javaAdapter,
  kotlin: kotlinAdapter,
  swift: null,
  csharp: null,
}

export function adapterForLanguage(id: LanguageId): ImportAdapter | null {
  return ADAPTERS[id] ?? null
}

// Extension -> language from the language table, over the languages that have
// an adapter: `.tsx` -> react, `.js` -> javascript, `.h` -> c, `.hpp` -> cpp.
// html/css are absent (no adapter), so adapterForPath returns null for them.
const EXT_LANGUAGE = extensionMap(LANGUAGES.filter((l) => l.planning && ADAPTERS[l.id as LanguageId])) as Record<string, LanguageId>

export function adapterForPath(filePath: string): ImportAdapter | null {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
  const lang = EXT_LANGUAGE[ext]
  return lang ? adapterForLanguage(lang) : null
}

// The LanguageId a file's extension maps to, or null for an unsupported
// extension — used to keep language-crossing links out of the "##token"
// completion pool (see graphLinkExtension), since there's no valid way to
// `import`/`use` one language's file from another.
export function languageForPath(filePath: string): LanguageId | null {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
  return EXT_LANGUAGE[ext] ?? null
}

export type { ImportAdapter, ImportSpecifier } from './types'
