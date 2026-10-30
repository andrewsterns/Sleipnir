// Types for languages.mjs, so the app's TypeScript reads the same table the
// vendored CLIs do.

/** How a language spells an import — what the analyzer and the import adapters parse. */
export type ImportSyntax = 'js' | 'python' | 'go' | 'rust' | 'c' | 'jvm' | 'swift' | 'csharp' | 'html' | 'css'

export interface LanguageServer {
  command: string
  args: string[]
  /** Shown when the server isn't installed. */
  install: string
}

export interface LanguageEntry {
  id: string
  label: string
  /** The first one is what scaffolds write. */
  extensions: string[]
  /** C-family header extensions — the interface half of a source/header pair. */
  headerExtensions?: string[]
  comment: { line?: string; block?: [string, string] }
  naming: 'camel' | 'snake' | 'pascal'
  /** Files whose presence means a project in this language ("*.csproj" globs a name). */
  manifests: string[]
  /** Null until Planning can scaffold it. */
  planning: { architectural: boolean } | null
  imports: ImportSyntax | null
  /** Code editor grammar key, null for plain text. */
  editor: string | null
  server: LanguageServer | null
  commands: { build?: string[]; run?: string[]; test?: string[] }
  gitignore: string[]
}

export interface UiFramework {
  id: string
  label: string
  /** A LanguageEntry id. */
  language: string
  ext: string
  /** 'exact' when it renders through CSS like the board does. */
  preview: 'exact' | 'approximate'
  status: 'available' | 'planned'
}

export const LANGUAGES: LanguageEntry[]
export const UI_FRAMEWORKS: UiFramework[]
export function languageById(id: string): LanguageEntry | undefined
export function languageForPath(filePath: string): LanguageEntry | null
export function extensionMap(languages?: LanguageEntry[]): Record<string, string>
