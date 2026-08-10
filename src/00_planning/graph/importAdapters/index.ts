import type { LanguageId } from '../architectures'
import type { ImportAdapter } from './types'
import { tsxAdapter } from './tsxAdapter'
import { pythonAdapter } from './pythonAdapter'
import { rustAdapter } from './rustAdapter'
import { goAdapter } from './goAdapter'

// Every call site (scaffold-time auto-linking, file-save edge detection,
// the "##token" editor extension, the node-card link editor) reaches every
// language purely through this table. The whole JS/TS family shares one
// adapter (ES import syntax); html/css have no import model, so they map to
// null and simply get no auto-linking.
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
}

export function adapterForLanguage(id: LanguageId): ImportAdapter | null {
  return ADAPTERS[id] ?? null
}

// Mirrors src/app/DesignSystem/codeEditorLanguages.ts's own extension ->
// language mapping. `.tsx` -> react and the plain `.js` variants -> javascript
// is arbitrary among the JS/TS family (they all resolve to the same adapter);
// html/css are intentionally absent so adapterForPath returns null for them.
const EXT_LANGUAGE: Record<string, LanguageId> = {
  ts: 'typescript', tsx: 'react', js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
  py: 'python',
  rs: 'rust',
  go: 'go',
}

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
