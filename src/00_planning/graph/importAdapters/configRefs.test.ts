import { describe, it, expect } from 'vitest'
import { buildReferenceIndex } from './assetRefs'
import { detectConfigRefs, isConfigPath } from './configRefs'

const WORKSPACE = [
  'package.json',
  'tsconfig.json',
  'tsconfig.app.json',
  'tsconfig.node.json',
  'vite.config.ts',
  'index.html',
  'README.md',
  'electron/main.cjs',
  'electron/preload.cjs',
  'tools/sleipnir-plan.mjs',
  'src/App.tsx',
  'src/main.tsx',
  'src/00_planning/plans.json',
]

const index = buildReferenceIndex(WORKSPACE)

describe('isConfigPath', () => {
  it('recognizes configs by well-known name and by the .config. convention', () => {
    expect(isConfigPath('package.json')).toBe(true)
    expect(isConfigPath('tsconfig.app.json')).toBe(true)
    expect(isConfigPath('vite.config.ts')).toBe(true)
    expect(isConfigPath('tailwind.config.js')).toBe(true)
    expect(isConfigPath('docker-compose.yml')).toBe(true)
  })

  it('leaves ordinary source and app-data json alone', () => {
    expect(isConfigPath('src/App.tsx')).toBe(false)
    // This repo's own planning stores — full of file paths that would each
    // become an edge from a file nobody thinks of as a dependency.
    expect(isConfigPath('src/00_planning/plans.json')).toBe(false)
    expect(isConfigPath('src/00_planning/notes.json')).toBe(false)
  })
})

describe('detectConfigRefs', () => {
  it('links a package.json to the files it names, and to nothing it merely governs', () => {
    const pkg = JSON.stringify(
      {
        name: 'sleipnir',
        version: '0.0.0',
        main: 'electron/main.cjs',
        repository: { type: 'git', url: 'https://github.com/andrewsterns/Sleipnir.git' },
        scripts: {
          dev: 'vite',
          build: 'tsc -b && vite build',
          'generate:plan': 'node tools/sleipnir-plan.mjs',
        },
        dependencies: { react: '^18.3.1' },
      },
      null,
      2,
    )

    const refs = detectConfigRefs('package.json', pkg, index)

    expect(refs).toEqual(expect.arrayContaining(['electron/main.cjs', 'tools/sleipnir-plan.mjs']))
    // The point of the whole module: package.json governs every source file in
    // the repo and must link to none of them.
    expect(refs).not.toContain('src/App.tsx')
    expect(refs).not.toContain('src/main.tsx')
  })

  it('ignores package names, semver ranges, CLI flags and remote urls', () => {
    const pkg = `{ "dependencies": { "react": "^18.3.1", "vite": "~5.0.0" }, "bugs": "https://github.com/x/y/issues" }`
    expect(detectConfigRefs('package.json', pkg, index)).toEqual([])
  })

  it('links a tsconfig to the sibling configs it references', () => {
    const tsconfig = JSON.stringify({
      files: [],
      references: [{ path: './tsconfig.app.json' }, { path: './tsconfig.node.json' }],
    })
    expect(detectConfigRefs('tsconfig.json', tsconfig, index)).toEqual(
      expect.arrayContaining(['tsconfig.app.json', 'tsconfig.node.json']),
    )
  })

  it('does not turn a directory-only include into an edge', () => {
    // 'src' is a directory, not a file — there is nothing in the pool to point
    // at, and inventing a fan-out to everything under it is exactly what this
    // module refuses to do.
    const tsconfig = JSON.stringify({ include: ['src'], compilerOptions: { outDir: 'dist' } })
    expect(detectConfigRefs('tsconfig.json', tsconfig, index)).toEqual([])
  })

  it('links a vite config to its html entry point', () => {
    const cfg = `import { defineConfig } from 'vite'\nexport default defineConfig({\n  build: { rollupOptions: { input: 'index.html' } },\n})\n`
    expect(detectConfigRefs('vite.config.ts', cfg, index)).toContain('index.html')
  })

  it('normalizes windows-style separators', () => {
    const compose = `services:\n  web:\n    volumes:\n      - electron\\preload.cjs:/app/preload.cjs\n`
    expect(detectConfigRefs('docker-compose.yml', compose, index)).toContain('electron/preload.cjs')
  })

  it('never links a config to itself', () => {
    const pkg = `{ "name": "x", "files": ["package.json"] }`
    expect(detectConfigRefs('package.json', pkg, index)).toEqual([])
  })
})
