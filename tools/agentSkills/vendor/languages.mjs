// Sleipnir's one table of languages — standalone, vendored copy.
//
// Every place Sleipnir needs to know about a language reads it from here:
// Planning (which languages can be scaffolded, by which file names), the
// planning CLI (extension → language), the architecture analyzer (which files
// it can read imports from), and next the editor grammars, language servers,
// build/run/test commands, .gitignore templates and canvas UI targets. Adding
// a language is adding one entry, not editing eight lists that drift.
//
// Pure data and a few lookups, no imports, so it runs anywhere: the app's
// renderer (typed by languages.d.mts), Electron, and the CLIs vendored into a
// project as `.sleipnir/` — analyze.mjs imports it from beside it, and
// tools/syncPlanDoc.mjs inlines the region below into the vendored plan.mjs,
// which may not import anything.

// --- BEGIN LANGUAGES ---
// One entry per language, in priority order: when two list the same extension
// the first wins (.js → javascript, not jquery).
//   extensions  first one is what scaffolds write
//   comment     line prefix and/or block delimiters
//   naming      file-name convention for scaffolded files
//   manifests   files whose presence means "a project in this language"
//   planning    null until Planning has scaffold templates for it
//   imports     the import syntax the analyzer and adapters parse, null if none
//   editor      grammar key for the code editor, null for plain text
//   server      language server for the Workspace editor
//   commands    build / run / test argv when the language has a standard one
//   gitignore   build output and caches a new repo should ignore
export const LANGUAGES = [
  {
    id: 'react',
    label: 'React (TSX)',
    extensions: ['tsx', 'jsx'],
    comment: { line: '//', block: ['/*', '*/'] },
    naming: 'camel',
    manifests: [],
    planning: { architectural: true },
    imports: 'js',
    editor: 'tsx',
    server: { command: 'typescript-language-server', args: ['--stdio'], install: 'npm install -g typescript typescript-language-server' },
    commands: {},
    gitignore: ['node_modules/', 'dist/'],
  },
  {
    id: 'typescript',
    label: 'TypeScript',
    extensions: ['ts', 'mts', 'cts'],
    comment: { line: '//', block: ['/*', '*/'] },
    naming: 'camel',
    manifests: ['tsconfig.json'],
    planning: { architectural: true },
    imports: 'js',
    editor: 'typescript',
    server: { command: 'typescript-language-server', args: ['--stdio'], install: 'npm install -g typescript typescript-language-server' },
    commands: {},
    gitignore: ['node_modules/', 'dist/', '*.tsbuildinfo'],
  },
  {
    id: 'javascript',
    label: 'JavaScript',
    extensions: ['js', 'mjs', 'cjs'],
    comment: { line: '//', block: ['/*', '*/'] },
    naming: 'camel',
    manifests: ['package.json'],
    planning: { architectural: true },
    imports: 'js',
    editor: 'javascript',
    server: { command: 'typescript-language-server', args: ['--stdio'], install: 'npm install -g typescript typescript-language-server' },
    commands: {},
    gitignore: ['node_modules/', 'dist/'],
  },
  {
    // A flavor of JavaScript (scaffold content differs), not its own syntax.
    id: 'jquery',
    label: 'jQuery',
    extensions: ['js'],
    comment: { line: '//', block: ['/*', '*/'] },
    naming: 'camel',
    manifests: [],
    planning: { architectural: true },
    imports: 'js',
    editor: 'javascript',
    server: null,
    commands: {},
    gitignore: ['node_modules/'],
  },
  {
    id: 'python',
    label: 'Python',
    extensions: ['py', 'pyi'],
    comment: { line: '#' },
    naming: 'snake',
    manifests: ['pyproject.toml', 'requirements.txt', 'setup.py', 'setup.cfg', 'Pipfile'],
    planning: { architectural: true },
    imports: 'python',
    editor: 'python',
    server: { command: 'pyright-langserver', args: ['--stdio'], install: 'npm install -g pyright' },
    commands: { test: ['pytest'] },
    gitignore: ['__pycache__/', '*.pyc', '.venv/', 'venv/', '.pytest_cache/'],
  },
  {
    id: 'rust',
    label: 'Rust',
    extensions: ['rs'],
    comment: { line: '//', block: ['/*', '*/'] },
    naming: 'snake',
    manifests: ['Cargo.toml'],
    planning: { architectural: true },
    imports: 'rust',
    editor: 'rust',
    server: { command: 'rust-analyzer', args: [], install: 'rustup component add rust-analyzer' },
    commands: { build: ['cargo', 'build'], run: ['cargo', 'run'], test: ['cargo', 'test'] },
    gitignore: ['target/'],
  },
  {
    id: 'go',
    label: 'Go',
    extensions: ['go'],
    comment: { line: '//', block: ['/*', '*/'] },
    naming: 'snake',
    manifests: ['go.mod'],
    planning: { architectural: true },
    imports: 'go',
    editor: 'go',
    server: { command: 'gopls', args: [], install: 'go install golang.org/x/tools/gopls@latest' },
    commands: { build: ['go', 'build', './...'], run: ['go', 'run', '.'], test: ['go', 'test', './...'] },
    gitignore: ['bin/'],
  },
  {
    id: 'html',
    label: 'HTML',
    extensions: ['html', 'htm'],
    comment: { block: ['<!--', '-->'] },
    naming: 'camel',
    manifests: [],
    planning: { architectural: false },
    imports: 'html',
    editor: 'html',
    server: null,
    commands: {},
    gitignore: [],
  },
  {
    id: 'css',
    label: 'CSS',
    extensions: ['css'],
    comment: { block: ['/*', '*/'] },
    naming: 'camel',
    manifests: [],
    planning: { architectural: false },
    imports: 'css',
    editor: 'css',
    server: null,
    commands: {},
    gitignore: [],
  },
  {
    id: 'c',
    label: 'C',
    extensions: ['c', 'h'],
    headerExtensions: ['h'],
    comment: { line: '//', block: ['/*', '*/'] },
    naming: 'snake',
    manifests: ['CMakeLists.txt', 'Makefile', 'meson.build'],
    planning: { architectural: true },
    imports: 'c',
    editor: 'cpp',
    server: { command: 'clangd', args: [], install: 'Install clangd from LLVM: https://clangd.llvm.org/installation' },
    commands: { build: ['cmake', '--build', 'build'], test: ['ctest', '--test-dir', 'build'] },
    gitignore: ['build/', '*.o', '*.a', '*.so', '*.dylib', '*.exe'],
  },
  {
    id: 'cpp',
    label: 'C++',
    extensions: ['cpp', 'cc', 'cxx', 'hpp', 'hh', 'hxx'],
    headerExtensions: ['hpp', 'hh', 'hxx', 'h'],
    comment: { line: '//', block: ['/*', '*/'] },
    naming: 'snake',
    manifests: ['CMakeLists.txt', 'Makefile', 'meson.build'],
    planning: { architectural: true },
    imports: 'c',
    editor: 'cpp',
    server: { command: 'clangd', args: [], install: 'Install clangd from LLVM: https://clangd.llvm.org/installation' },
    commands: { build: ['cmake', '--build', 'build'], test: ['ctest', '--test-dir', 'build'] },
    gitignore: ['build/', '*.o', '*.a', '*.so', '*.dylib', '*.exe'],
  },
  {
    id: 'java',
    label: 'Java',
    extensions: ['java'],
    comment: { line: '//', block: ['/*', '*/'] },
    naming: 'pascal',
    manifests: ['pom.xml', 'build.gradle', 'build.gradle.kts'],
    planning: { architectural: true },
    imports: 'jvm',
    editor: 'java',
    server: { command: 'jdtls', args: [], install: 'Install Eclipse JDT Language Server: https://github.com/eclipse-jdtls/eclipse.jdt.ls' },
    commands: { test: ['gradle', 'test'] },
    gitignore: ['target/', 'build/', '*.class', '.gradle/'],
  },
  {
    id: 'kotlin',
    label: 'Kotlin',
    extensions: ['kt', 'kts'],
    comment: { line: '//', block: ['/*', '*/'] },
    naming: 'pascal',
    manifests: ['build.gradle.kts', 'build.gradle', 'pom.xml'],
    planning: { architectural: true },
    imports: 'jvm',
    editor: 'kotlin',
    server: { command: 'kotlin-language-server', args: [], install: 'Install kotlin-language-server: https://github.com/fwcd/kotlin-language-server' },
    commands: { test: ['gradle', 'test'] },
    gitignore: ['build/', '*.class', '.gradle/'],
  },
  {
    id: 'swift',
    label: 'Swift',
    extensions: ['swift'],
    comment: { line: '//', block: ['/*', '*/'] },
    naming: 'pascal',
    manifests: ['Package.swift'],
    planning: { architectural: true },
    imports: 'swift',
    editor: 'swift',
    server: { command: 'sourcekit-lsp', args: [], install: 'sourcekit-lsp ships with the Swift toolchain: https://www.swift.org/install' },
    commands: { build: ['swift', 'build'], run: ['swift', 'run'], test: ['swift', 'test'] },
    gitignore: ['.build/', '.swiftpm/'],
  },
  {
    id: 'csharp',
    label: 'C#',
    extensions: ['cs'],
    comment: { line: '//', block: ['/*', '*/'] },
    naming: 'pascal',
    manifests: ['*.csproj', '*.sln'],
    planning: { architectural: true },
    imports: 'csharp',
    editor: 'csharp',
    server: { command: 'csharp-ls', args: [], install: 'dotnet tool install --global csharp-ls' },
    commands: { build: ['dotnet', 'build'], run: ['dotnet', 'run'], test: ['dotnet', 'test'] },
    gitignore: ['bin/', 'obj/'],
  },
  {
    // Not scaffolded by Planning (planning: null) — known to everything else.
    // Single-file components: script imports in JS syntax, markup in HTML.
    id: 'vue',
    label: 'Vue',
    extensions: ['vue'],
    comment: { block: ['<!--', '-->'] },
    naming: 'pascal',
    manifests: [],
    planning: null,
    imports: 'js',
    editor: 'html',
    server: null,
    commands: {},
    gitignore: ['node_modules/', 'dist/'],
  },
  {
    id: 'svelte',
    label: 'Svelte',
    extensions: ['svelte'],
    comment: { block: ['<!--', '-->'] },
    naming: 'pascal',
    manifests: [],
    planning: null,
    imports: 'js',
    editor: 'html',
    server: null,
    commands: {},
    gitignore: ['node_modules/', '.svelte-kit/'],
  },
]

// The UI frameworks a canvas component can be emitted into — a target is a
// language AND a framework, since a box needs something to render into.
//   preview  'exact' when the framework uses CSS (the board renders CSS), else
//            'approximate' (a second layout lowering; see the plan)
//   status   'available' once its emitter exists
export const UI_FRAMEWORKS = [
  { id: 'react', label: 'React', language: 'react', ext: 'tsx', preview: 'exact', status: 'available' },
  { id: 'html', label: 'HTML + CSS', language: 'html', ext: 'html', preview: 'exact', status: 'planned' },
  { id: 'vue', label: 'Vue', language: 'vue', ext: 'vue', preview: 'exact', status: 'planned' },
  { id: 'svelte', label: 'Svelte', language: 'svelte', ext: 'svelte', preview: 'exact', status: 'planned' },
  { id: 'leptos', label: 'Leptos (Rust)', language: 'rust', ext: 'rs', preview: 'exact', status: 'planned' },
  { id: 'dioxus', label: 'Dioxus (Rust)', language: 'rust', ext: 'rs', preview: 'exact', status: 'planned' },
  { id: 'templ', label: 'templ (Go)', language: 'go', ext: 'templ', preview: 'exact', status: 'planned' },
  { id: 'lvgl', label: 'LVGL (C)', language: 'c', ext: 'c', preview: 'approximate', status: 'planned' },
  { id: 'swiftui', label: 'SwiftUI', language: 'swift', ext: 'swift', preview: 'approximate', status: 'planned' },
]

export function languageById(id) {
  return LANGUAGES.find((l) => l.id === id)
}

/** The language a path's extension belongs to (first entry wins), or null. */
export function languageForPath(filePath) {
  const ext = (String(filePath).match(/\.([A-Za-z0-9]+)$/)?.[1] ?? '').toLowerCase()
  return ext ? (LANGUAGES.find((l) => l.extensions.includes(ext)) ?? null) : null
}

/** extension → language id, first entry winning — the shape lookups want. */
export function extensionMap(languages = LANGUAGES) {
  const map = {}
  for (const l of languages) for (const ext of l.extensions) if (!(ext in map)) map[ext] = l.id
  return map
}
// --- END LANGUAGES ---
