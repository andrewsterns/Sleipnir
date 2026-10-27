import { describe, it, expect } from 'vitest'
import { stripJsonComments } from '../../00_planning/graph/importAdapters/pathAliases'
import { pickBaseTsconfig, renderStagingTsconfig } from './stagingTsconfig'

const fsOf = (files: Record<string, string>) => async (path: string) => {
  if (!(path in files)) throw new Error(`ENOENT ${path}`)
  return files[path]
}

describe('pickBaseTsconfig', () => {
  it('returns null for a project with no tsconfig', async () => {
    expect(await pickBaseTsconfig(fsOf({}))).toBeNull()
  })

  it('uses the root config when it sets jsx itself', async () => {
    expect(await pickBaseTsconfig(fsOf({ 'tsconfig.json': '{ "compilerOptions": { "jsx": "react-jsx" } }' }))).toBe('tsconfig.json')
  })

  it('follows a solution-style root to the referenced config that sets jsx', async () => {
    const read = fsOf({
      'tsconfig.json': '{ "files": [], "references": [{ "path": "./tsconfig.node.json" }, { "path": "./packages/web" }] }',
      'tsconfig.node.json': '{ "compilerOptions": {} }',
      'packages/web/tsconfig.json': '/* web */ { "compilerOptions": { "jsx": "preserve" } }',
    })
    expect(await pickBaseTsconfig(read)).toBe('packages/web/tsconfig.json')
  })

  it('falls back to the root when no reference sets jsx', async () => {
    const read = fsOf({ 'tsconfig.json': '{ "references": [{ "path": "./tsconfig.node.json" }] }', 'tsconfig.node.json': '{}' })
    expect(await pickBaseTsconfig(read)).toBe('tsconfig.json')
  })
})

describe('renderStagingTsconfig', () => {
  const parse = (text: string) => JSON.parse(stripJsonComments(text))

  it('extends the project config from inside .components, without ever emitting', () => {
    expect(parse(renderStagingTsconfig('tsconfig.app.json'))).toEqual({
      extends: '../tsconfig.app.json',
      compilerOptions: { noEmit: true },
      include: ['**/*'],
    })
  })

  it('stands alone for a project with no tsconfig, so .tsx still opens clean', () => {
    const config = parse(renderStagingTsconfig(null))
    expect(config.extends).toBeUndefined()
    expect(config.compilerOptions.jsx).toBe('react-jsx')
    expect(config.compilerOptions.noEmit).toBe(true)
  })
})
