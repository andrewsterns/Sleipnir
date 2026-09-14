// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  setWorkspaceRoot,
  renameProject,
  proposeFileNode,
  getWorkspaceInfo,
} from '../../../tools/sleipnir-backend.mjs'

// .planning/ is committed and travels to every machine that clones the repo, so
// nothing written into it may carry a path or name that only means something on
// the machine that wrote it. These are the two places that used to leak.
describe('.planning data portability', () => {
  let root: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'sleipnir-portability-'))
    setWorkspaceRoot(root)
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
    setWorkspaceRoot(null)
  })

  const readMeta = () => JSON.parse(readFileSync(join(root, '.planning', 'project.json'), 'utf8'))
  const readNotes = () => JSON.parse(readFileSync(join(root, '.planning', 'notes.json'), 'utf8'))

  describe('renameProject', () => {
    it('keeps every other key in project.json', () => {
      mkdirSync(join(root, '.planning'), { recursive: true })
      writeFileSync(
        join(root, '.planning', 'project.json'),
        JSON.stringify({ name: 'Old', agentScaffolding: { version: 1, commit: false } }),
      )

      renameProject(root, 'New')

      expect(readMeta()).toEqual({
        name: 'New',
        agentScaffolding: { version: 1, commit: false },
      })
    })

    it('still writes a name when there is no project.json yet', () => {
      renameProject(root, 'Fresh')
      expect(readMeta()).toEqual({ name: 'Fresh' })
    })

    it('does not lose sibling keys when project.json is malformed', () => {
      mkdirSync(join(root, '.planning'), { recursive: true })
      writeFileSync(join(root, '.planning', 'project.json'), '{ not json')

      renameProject(root, 'Recovered')

      expect(readMeta()).toEqual({ name: 'Recovered' })
      expect(getWorkspaceInfo().name).toBe('Recovered')
    })
  })

  describe('proposeFileNode', () => {
    const propose = (filePath: string) =>
      proposeFileNode('demo', 'Step', 'why', filePath, 'content', undefined, undefined)

    // path.resolve returns an absolute second argument unchanged, so resolveSafe's
    // containment check passes for an absolute path inside the root — which is how
    // 'C:\Users\someone\proj\src\Foo.tsx' used to reach notes.json verbatim.
    it('stores an absolute in-root path as workspace-relative', () => {
      propose(join(root, 'src', 'Foo.tsx'))
      expect(readNotes().nodes[0].proposedFile.path).toBe('src/Foo.tsx')
    })

    it('normalizes a leading ./', () => {
      propose('./src/Bar.tsx')
      expect(readNotes().nodes[0].proposedFile.path).toBe('src/Bar.tsx')
    })

    it('leaves an already-relative path alone', () => {
      propose('src/Baz.tsx')
      expect(readNotes().nodes[0].proposedFile.path).toBe('src/Baz.tsx')
    })

    it('still refuses a path that escapes the root', () => {
      expect(() => propose('../outside.tsx')).toThrow(/escapes allowed root/i)
    })

    it('reports the normalized path when refusing an existing file', () => {
      mkdirSync(join(root, 'src'), { recursive: true })
      writeFileSync(join(root, 'src', 'Taken.tsx'), 'already here')

      expect(() => propose(join(root, 'src', 'Taken.tsx'))).toThrow(/^src\/Taken\.tsx already exists/)
    })
  })
})
