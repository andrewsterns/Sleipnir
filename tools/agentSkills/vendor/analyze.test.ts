// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { analyzeGraph } from './graphCore.mjs'
import { scanProject } from './analyze.mjs'

let root: string
const write = (rel: string, text: string) => {
  mkdirSync(dirname(join(root, rel)), { recursive: true })
  writeFileSync(join(root, rel), text)
}

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'sleipnir-analyze-'))
  write('src/main.ts', "import { A } from './a'\nconsole.log(A)\n")
  // Only types cross a → b, so b → a closes no runtime loop.
  write('src/a.ts', "import { type B, type C } from './b'\nexport const A = 1\nexport type X = B | C\n")
  write('src/b.ts', "import { A } from './a'\nexport type B = typeof A\nexport type C = string\n")
  // A script run by hand, and one in Python.
  write('tools/gen.mjs', "import fs from 'node:fs'\nfs.writeFileSync('out.txt', 'x')\n")
  write('scripts/run.py', "def go():\n    pass\n\nif __name__ == '__main__':\n    go()\n")
  // Parked on purpose.
  write('src/parked.ts', '// sleipnir-keep: hidden until v2\nexport const parked = 1\n')
  // Unused, and the one file only it uses.
  write('src/old.ts', "import { helper } from './onlyOld'\nexport const old = helper\n")
  write('src/onlyOld.ts', 'export const helper = 1\n')
})

afterAll(() => rmSync(root, { recursive: true, force: true }))

describe('scanProject', () => {
  it('reads an import naming only inline types as a type import', () => {
    const scan = scanProject(root)
    expect(scan.edges.find((e: { source: string }) => e.source === 'src/a.ts')).toMatchObject({ target: 'src/b.ts', kind: 'type' })
    expect(analyzeGraph(scan).cycles).toHaveLength(0)
  })

  it('counts self-running scripts as entry points', () => {
    const { entries } = scanProject(root)
    expect(entries).toEqual(expect.arrayContaining(['tools/gen.mjs', 'scripts/run.py']))
  })

  it('leaves out files marked sleipnir-keep, and names what goes with an unused file', () => {
    const analysis = analyzeGraph(scanProject(root))
    expect(analysis.dead).toEqual(['src/old.ts'])
    expect(analysis.unusedWith).toEqual({ 'src/old.ts': ['src/onlyOld.ts'] })
  })
})
