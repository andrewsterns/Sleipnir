// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { listWorkspaceDir, searchWorkspace, setWorkspaceRoot } from '../../../tools/sleipnir-backend.mjs'

const hasGit = (() => {
  try {
    execFileSync('git', ['--version'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
})()

interface TreeNode {
  name: string
  path: string
  type: 'file' | 'dir'
  children?: TreeNode[]
}

const paths = (nodes: TreeNode[]): string[] =>
  nodes.flatMap((n) => [n.path, ...(n.children ? paths(n.children) : [])])

// Search and the tree skip what git ignores — the project's own build output
// and caches, which a fixed name list can't know — without hiding the dot-
// folders people open the tree to look at, or Sleipnir's own folders.
describe.skipIf(!hasGit)('workspace walks respect .gitignore', () => {
  let root: string
  const put = (rel: string, content = 'needle\n') => {
    mkdirSync(dirname(join(root, rel)), { recursive: true })
    writeFileSync(join(root, rel), content)
  }

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'sleipnir-ignore-'))
    execFileSync('git', ['init', '-q'], { cwd: root })
    put('.gitignore', 'release/\n.claude/\n.canvas/\n')
    put('src/a.ts')
    put('release/installer.txt')
    put('.claude/settings.json')
    put('.claude/worktrees/feature/src/a.ts')
    put('.components/frame/frame.tsx')
    setWorkspaceRoot(root)
  })

  afterEach(() => {
    setWorkspaceRoot(null)
    rmSync(root, { recursive: true, force: true })
  })

  it('searches only what git tracks or would track, plus Sleipnir’s own folders', () => {
    const hits = [...new Set(searchWorkspace('needle').matches.map((m: { path: string }) => m.path))].sort()
    expect(hits).toEqual(['.components/frame/frame.tsx', 'src/a.ts'])
  })

  it('hides ignored output from the tree but keeps ignored dot-folders, minus worktrees', () => {
    const tree = paths(listWorkspaceDir('').tree as TreeNode[])
    expect(tree).toContain('src/a.ts')
    expect(tree).toContain('.claude/settings.json')
    expect(tree).toContain('.components/frame/frame.tsx')
    expect(tree).not.toContain('release')
    expect(tree.some((p) => p.startsWith('.claude/worktrees'))).toBe(false)
  })
})
