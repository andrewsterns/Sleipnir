import type { Extension } from '@codemirror/state'
import { StreamLanguage, type StreamParser } from '@codemirror/language'
import { languageForPath as tableLanguageForPath } from '../../../tools/agentSkills/vendor/languages.mjs'

// File → CodeMirror language support. Which grammar a source file gets comes
// from the language table (tools/agentSkills/vendor/languages.mjs, its
// `editor` key); a few non-code formats are mapped here. Unrecognized files
// render as plain text — still editable, no highlighting.
//
// Every grammar is a dynamic import, loaded the first time a file needs it
// and cached after: a dozen parsers would otherwise all ride along on the
// app's first load, whatever the project is written in.

// A CodeMirror 5-era mode, for languages with no Lezer grammar package.
const legacy = (load: () => Promise<StreamParser<unknown>>) => async (): Promise<Extension[]> => [StreamLanguage.define(await load())]

const GRAMMARS: Record<string, () => Promise<Extension[]>> = {
  typescript: async () => [(await import('@codemirror/lang-javascript')).javascript({ typescript: true })],
  tsx: async () => [(await import('@codemirror/lang-javascript')).javascript({ typescript: true, jsx: true })],
  javascript: async () => [(await import('@codemirror/lang-javascript')).javascript({ jsx: true })],
  python: async () => [(await import('@codemirror/lang-python')).python()],
  rust: async () => [(await import('@codemirror/lang-rust')).rust()],
  go: async () => [(await import('@codemirror/lang-go')).go()],
  // lang-cpp parses C as well — C is (near enough) a subset.
  cpp: async () => [(await import('@codemirror/lang-cpp')).cpp()],
  java: async () => [(await import('@codemirror/lang-java')).java()],
  kotlin: legacy(async () => (await import('@codemirror/legacy-modes/mode/clike')).kotlin),
  csharp: legacy(async () => (await import('@codemirror/legacy-modes/mode/clike')).csharp),
  swift: legacy(async () => (await import('@codemirror/legacy-modes/mode/swift')).swift),
  html: async () => [(await import('@codemirror/lang-html')).html()],
  css: async () => [(await import('@codemirror/lang-css')).css()],
  markdown: async () => [(await import('@codemirror/lang-markdown')).markdown()],
  json: async () => [(await import('@codemirror/lang-json')).json()],
  toml: legacy(async () => (await import('@codemirror/legacy-modes/mode/toml')).toml),
  yaml: legacy(async () => (await import('@codemirror/legacy-modes/mode/yaml')).yaml),
  shell: legacy(async () => (await import('@codemirror/legacy-modes/mode/shell')).shell),
  cmake: legacy(async () => (await import('@codemirror/legacy-modes/mode/cmake')).cmake),
  dockerfile: legacy(async () => (await import('@codemirror/legacy-modes/mode/dockerfile')).dockerFile),
}

// Formats that aren't languages in the table but read better highlighted.
const EXT_GRAMMAR: Record<string, string> = {
  md: 'markdown',
  markdown: 'markdown',
  json: 'json',
  toml: 'toml',
  yaml: 'yaml',
  yml: 'yaml',
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  cmake: 'cmake',
}
const NAME_GRAMMAR: Record<string, string> = { 'CMakeLists.txt': 'cmake', Dockerfile: 'dockerfile' }

/** Which grammar a file gets, or null for plain text. */
export function grammarKeyForPath(filePath: string): string | null {
  const name = filePath.slice(filePath.lastIndexOf('/') + 1)
  if (NAME_GRAMMAR[name]) return NAME_GRAMMAR[name]
  const ext = name.includes('.') ? (name.split('.').pop()?.toLowerCase() ?? '') : ''
  return tableLanguageForPath(filePath)?.editor ?? EXT_GRAMMAR[ext] ?? null
}

const loaded = new Map<string, Promise<Extension[]>>()

/** The language support for a file, loading its grammar on first use. Resolves to [] for plain text. */
export function loadLanguageForPath(filePath: string): Promise<Extension[]> {
  const key = grammarKeyForPath(filePath)
  const load = key ? GRAMMARS[key] : undefined
  if (!key || !load) return Promise.resolve([])
  let pending = loaded.get(key)
  if (!pending) {
    pending = load().catch(() => {
      // A failed chunk load shouldn't stick: the next file retries.
      loaded.delete(key)
      return []
    })
    loaded.set(key, pending)
  }
  return pending
}

// Standalone scripts runScript() knows how to execute — keep in sync with
// the RUNNERS map in tools/sleipnir-backend.mjs. Deliberately excludes
// ts/tsx: those are MVVM React components (need a React runtime), not
// standalone interpretable scripts.
const RUNNABLE_EXTENSIONS = new Set(['py', 'rs', 'go'])

export function isRunnablePath(filePath: string): boolean {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
  return RUNNABLE_EXTENSIONS.has(ext)
}
