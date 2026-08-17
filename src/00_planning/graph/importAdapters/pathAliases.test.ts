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
