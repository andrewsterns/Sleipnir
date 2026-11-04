import { describe, it, expect } from 'vitest'
import { loadPathAliases, expandAlias } from './pathAliases'

describe('pathAliases', () => {
  it('loads paths/baseUrl straight from tsconfig.json', async () => {
    const files: Record<string, string> = {
      'tsconfig.json': JSON.stringify({
        compilerOptions: { baseUrl: '.', paths: { '@atoms/*': ['src/atoms/*'] } },
      }),
    }
    const config = await loadPathAliases(async (p) => {
      if (!(p in files)) throw new Error('not found')
      return files[p]
    })
    expect(config.paths).toEqual({ '@atoms/*': ['src/atoms/*'] })
  })

  it('follows references into a child config, matching a root solution-style tsconfig with no paths of its own', async () => {
    const files: Record<string, string> = {
      'tsconfig.json': JSON.stringify({ references: [{ path: './tsconfig.app.json' }] }),
      'tsconfig.app.json': JSON.stringify({
        compilerOptions: { baseUrl: '.', paths: { '@molecules/*': ['src/molecules/*'] } },
      }),
    }
    const config = await loadPathAliases(async (p) => {
      if (!(p in files)) throw new Error('not found')
      return files[p]
    })
    expect(config.paths).toEqual({ '@molecules/*': ['src/molecules/*'] })
  })

  it('does not mistake a wildcard path pattern\'s literal "/*" for a block comment opener', async () => {
    // Reproduces a real bug: a naive comment-strip regex "opens" a fake
    // block comment at the `/*` inside `"@atoms/*"` (ordinary string
    // content, not a comment) and then greedily eats everything up to the
    // NEXT `*/` it can find — here, the real trailing comment on `include`
    // — deleting the whole `paths` object in between. This exact shape
    // (wildcard paths + a later inline comment) is extremely ordinary for a
    // hand-written tsconfig.json.
    const files: Record<string, string> = {
      'tsconfig.json': [
        '{',
        '  "compilerOptions": {',
        '    "baseUrl": "src",',
        '    "paths": {',
        '      "@atoms/*": ["components/atoms/*"],',
        '      "@molecules/*": ["components/molecules/*"]',
        '    }',
        '  },',
        '  "include": [',
        '    "src/**/*" /* Include all files in the src folder */',
        '  ]',
        '}',
      ].join('\n'),
    }
    const config = await loadPathAliases(async (p) => {
      if (!(p in files)) throw new Error('not found')
      return files[p]
    })
    expect(config.paths).toEqual({
      '@atoms/*': ['components/atoms/*'],
      '@molecules/*': ['components/molecules/*'],
    })
  })

  it('strips a real-world trailing-comment-per-line tsconfig.json (same shape create-react-app templates ship) without corrupting paths', async () => {
    const files: Record<string, string> = {
      'tsconfig.json': [
        '{',
        '  "compilerOptions": {',
        '    "target": "es2016",                             /* Set the JavaScript version to emit */',
        '    "jsx": "react",                                 /* Enable JSX support for React */',
        '    "baseUrl": "src",',
        '    "paths": {',
        '      "@assets/*": ["components/00_assets/*"],',
        '      "@atoms/*": ["components/01_atoms/*"],',
        '      "@pages/*": ["components/05_pages/*"]',
        '    }',
        '  },',
        '  "include": [',
        '    "src/**/*"                                      /* Include all files in the \'src\' folder */',
        '  ],',
        '  "exclude": [',
        '    "node_modules"                                  /* Exclude \'node_modules\' from compilation */',
        '  ]',
        '}',
      ].join('\n'),
    }
    const config = await loadPathAliases(async (p) => {
      if (!(p in files)) throw new Error('not found')
      return files[p]
    })
    expect(config.paths).toEqual({
      '@assets/*': ['components/00_assets/*'],
      '@atoms/*': ['components/01_atoms/*'],
      '@pages/*': ['components/05_pages/*'],
    })
  })

  it('tolerates a missing tsconfig entirely, returning an empty config rather than throwing', async () => {
    const config = await loadPathAliases(async () => {
      throw new Error('no such file')
    })
    expect(config).toEqual({ baseUrl: '', paths: {} })
  })

  it('expandAlias expands a wildcard pattern and prefers the longest matching key', () => {
    const config = {
      baseUrl: '',
      paths: {
        '@molecules/*': ['src/molecules/*'],
        '@molecules/special/*': ['src/special-molecules/*'],
      },
    }
    expect(expandAlias('@molecules/nav-circle/NavCircleView', config)).toEqual(['src/molecules/nav-circle/NavCircleView'])
    expect(expandAlias('@molecules/special/Foo', config)).toEqual(['src/special-molecules/Foo'])
    expect(expandAlias('unrelated/Foo', config)).toEqual([])
  })
})
