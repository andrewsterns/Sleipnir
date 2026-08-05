import type { Extension } from '@codemirror/state'
import { javascript } from '@codemirror/lang-javascript'
import { python } from '@codemirror/lang-python'
import { rust } from '@codemirror/lang-rust'
import { go } from '@codemirror/lang-go'
import { markdown } from '@codemirror/lang-markdown'
import { json } from '@codemirror/lang-json'
import { css } from '@codemirror/lang-css'
import { html } from '@codemirror/lang-html'

// Extension → CodeMirror language support. Not exhaustive — unrecognized
// extensions just render as plain text (still editable, no highlighting).
const EXT_LANGUAGE: Record<string, () => Extension> = {
  ts: () => javascript({ typescript: true }),
  tsx: () => javascript({ typescript: true, jsx: true }),
  js: () => javascript(),
  jsx: () => javascript({ jsx: true }),
  mjs: () => javascript(),
  cjs: () => javascript(),
  py: () => python(),
  rs: () => rust(),
  go: () => go(),
  md: () => markdown(),
  json: () => json(),
  css: () => css(),
  html: () => html(),
}

export function languageForPath(filePath: string): Extension[] {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
  const factory = EXT_LANGUAGE[ext]
  return factory ? [factory()] : []
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
