// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SKILLS, SCAFFOLD_VERSION, PLAN_CLI, ARGS_TOKEN } from './registry.mjs'
import { emitAll, emitAgentsMd, emitClaude, emitCodex, emitGemini } from './emitters/index.mjs'
import { mergeBlock, wrapBlock, hasBlock } from './managedBlock.mjs'
import { planScaffold, ensureAgentScaffolding, scaffoldPaths, ownedScaffoldPaths, readState } from './scaffold.mjs'

const byPath = (files: { path: string }[], path: string) => files.find((f) => f.path === path)!

describe('emitters', () => {
  it('emit every file each target agent actually reads', () => {
    expect(emitAll(SKILLS).map((f) => f.path).sort()).toEqual([
      '.claude/commands/plan.md',
      '.codex/prompts/plan.md',
      '.gemini/commands/plan.toml',
      'AGENTS.md',
      'CLAUDE.md',
      'GEMINI.md',
    ])
  })

  it('marks only the files a human also owns as managed', () => {
    const managed = emitAll(SKILLS).filter((f) => f.managed).map((f) => f.path).sort()
    expect(managed).toEqual(['AGENTS.md', 'CLAUDE.md', 'GEMINI.md'])
  })

  // Claude Code reads CLAUDE.md and not AGENTS.md, and skips imports that sit
  // inside code spans or fences — so the import has to be bare text.
  it('bridges CLAUDE.md to AGENTS.md with a bare import', () => {
    const content = byPath(emitClaude(SKILLS), 'CLAUDE.md').content
    expect(content).toMatch(/^@AGENTS\.md$/m)
    expect(content).not.toMatch(/`@AGENTS\.md`/)
  })

  it('puts the real instructions in AGENTS.md rather than a pointer', () => {
    const content = byPath(emitAgentsMd(SKILLS), 'AGENTS.md').content
    expect(content).toContain(`node ${PLAN_CLI} create-plan`)
    expect(content).toContain('nodeIds')
  })

  it('substitutes each target\'s own argument placeholder', () => {
    expect(byPath(emitClaude(SKILLS), '.claude/commands/plan.md').content).toContain('$ARGUMENTS')
    expect(byPath(emitCodex(SKILLS), '.codex/prompts/plan.md').content).toContain('$ARGUMENTS')
    expect(byPath(emitGemini(SKILLS), '.gemini/commands/plan.toml').content).toContain('{{args}}')
  })

  it('leaves no unsubstituted placeholder anywhere', () => {
    for (const file of emitAll(SKILLS)) {
      expect(file.content, file.path).not.toContain(ARGS_TOKEN)
    }
  })

  it('writes YAML frontmatter the slash-command loaders can parse', () => {
    for (const path of ['.claude/commands/plan.md', '.codex/prompts/plan.md']) {
      const content = byPath(emitAll(SKILLS), path).content
      expect(content, path).toMatch(/^---\n(?:[a-z-]+: ".*"\n)+---\n/)
      expect(content, path).toContain('argument-hint: "')
      expect(content, path).toContain('description: "')
    }
  })

  // The one non-Markdown target. A basic ("""...""") string would read the
  // command's trailing backslashes as line-ending escapes and silently swallow
  // the newline plus the following indentation, so it has to be a literal
  // ('''...''') string.
  describe('gemini TOML', () => {
    const content = () => byPath(emitGemini(SKILLS), '.gemini/commands/plan.toml').content

    it('uses a literal multi-line string, not a basic one', () => {
      expect(content()).toContain("prompt = '''")
      expect(content()).not.toContain('prompt = """')
    })

    it('keeps the shell line-continuations intact', () => {
      expect(content()).toMatch(/--plan-id <id> \\\n/)
    })

    it('quotes the description, which contains an apostrophe', () => {
      expect(content()).toMatch(/^description = ".*"$/m)
      expect(content()).toContain("Sleipnir's")
    })

    it('parses back out to the same prompt text', () => {
      const match = content().match(/prompt = '''\n([\s\S]*)\n'''\n$/)
      expect(match).not.toBeNull()
      expect(match![1]).toBe(SKILLS[0].command.split(ARGS_TOKEN).join('{{args}}'))
    })
  })
})

describe('managed block merge', () => {
  const content = 'GENERATED BODY'

  it('creates a file that holds only the block', () => {
    expect(mergeBlock(null, 1, content)).toBe(`${wrapBlock(1, content)}\n`)
  })

  it('appends to a file that has no block, touching nothing else', () => {
    const human = '# My rules\n\nAlways use tabs.\n'
    const merged = mergeBlock(human, 1, content)!
    expect(merged.startsWith(human)).toBe(true)
    expect(merged).toContain(content)
  })

  it('replaces only what is between the markers', () => {
    const before = '# Mine\n\n'
    const after = '\n\n## Also mine\n'
    const existing = `${before}${wrapBlock(1, 'OLD BODY')}${after}`
    const merged = mergeBlock(existing, 1, 'NEW BODY')!

    expect(merged).toBe(`${before}${wrapBlock(1, 'NEW BODY')}${after}`)
    expect(merged).toContain('# Mine')
    expect(merged).toContain('## Also mine')
    expect(merged).not.toContain('OLD BODY')
  })

  it('reports no change when the file already says exactly this', () => {
    const existing = `# Mine\n\n${wrapBlock(1, content)}\n`
    expect(mergeBlock(existing, 1, content)).toBeNull()
  })

  it('rewrites the block when only the version changed', () => {
    const existing = `${wrapBlock(1, content)}\n`
    const merged = mergeBlock(existing, 2, content)!
    expect(merged).toContain('BEGIN SLEIPNIR v2')
    expect(merged).not.toContain('BEGIN SLEIPNIR v1')
  })

  // A half-written block is treated as human text: better to append a second
  // block than to guess where our content used to stop and eat their writing.
  it('leaves a block with a missing end marker alone', () => {
    const broken = '# Mine\n\n<!-- BEGIN SLEIPNIR v1 — generated -->\nstray\n'
    const merged = mergeBlock(broken, 1, content)!
    expect(merged.startsWith(broken)).toBe(true)
    expect(hasBlock(broken)).toBe(false)
  })

  it('recognizes a complete block', () => {
    expect(hasBlock(wrapBlock(1, content))).toBe(true)
    expect(hasBlock('nothing here')).toBe(false)
  })
})

describe('scaffolder', () => {
  let root: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'sleipnir-scaffold-'))
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  const read = (rel: string) => readFileSync(join(root, rel), 'utf8')

  it('writes every file plus the vendored CLI on a first run', () => {
    const { written, skipped } = ensureAgentScaffolding(root)
    expect(skipped).toEqual([])
    expect(written).toContain(PLAN_CLI)
    for (const file of emitAll(SKILLS)) expect(written).toContain(file.path)
  })

  it('writes nothing at all on a second run', () => {
    ensureAgentScaffolding(root)
    expect(ensureAgentScaffolding(root)).toMatchObject({ written: [], skipped: [] })
    expect(planScaffold(root).writes).toEqual([])
  })

  it('vendors a CLI with no machine-specific path in it', () => {
    ensureAgentScaffolding(root)
    const cli = read(PLAN_CLI)
    expect(cli).not.toMatch(/[A-Za-z]:[\\/]Users/)
    expect(cli).not.toContain(process.cwd())
    expect(cli).toContain('#!/usr/bin/env node')
  })

  it('emits nothing containing an absolute path', () => {
    ensureAgentScaffolding(root)
    for (const rel of scaffoldPaths()) {
      if (!existsSync(join(root, rel))) continue
      expect(read(rel), rel).not.toMatch(/[A-Za-z]:[\\/]Users/)
    }
  })

  it('records its version and skills in scaffold.json', () => {
    ensureAgentScaffolding(root)
    expect(readState(root)).toMatchObject({ version: SCAFFOLD_VERSION, skills: ['plan'] })
  })

  it('preserves human content in the shared files', () => {
    writeFileSync(join(root, 'CLAUDE.md'), '# Do not delete me\n')
    ensureAgentScaffolding(root)
    expect(read('CLAUDE.md')).toContain('# Do not delete me')
    expect(read('CLAUDE.md')).toContain('@AGENTS.md')
  })

  it('restores a Sleipnir-owned file the human deleted', () => {
    ensureAgentScaffolding(root)
    rmSync(join(root, PLAN_CLI))
    expect(ensureAgentScaffolding(root).written).toEqual([PLAN_CLI])
  })

  it('overwrites a Sleipnir-owned file the human edited', () => {
    ensureAgentScaffolding(root)
    writeFileSync(join(root, '.claude/commands/plan.md'), 'clobber me')
    expect(ensureAgentScaffolding(root).written).toEqual(['.claude/commands/plan.md'])
    expect(read('.claude/commands/plan.md')).toContain('$ARGUMENTS')
  })

  // Scaffolding runs when a project opens, so a collision has to degrade to
  // "scaffolded less", never to a thrown error that breaks opening the project.
  it('skips a path blocked by a directory instead of throwing', () => {
    mkdirSync(join(root, 'AGENTS.md'), { recursive: true })
    const { skipped, written } = ensureAgentScaffolding(root)
    expect(skipped).toEqual([{ path: 'AGENTS.md', reason: 'a directory exists at this path' }])
    expect(written).toContain('CLAUDE.md')
  })

  it('does nothing when there is no project open', () => {
    expect(ensureAgentScaffolding(null)).toEqual({ written: [], skipped: [], excluded: [] })
  })

  describe('keeping it local', () => {
    it('excludes only the files Sleipnir owns, never the shared ones', () => {
      const owned = ownedScaffoldPaths()
      expect(owned).toContain(PLAN_CLI)
      expect(owned).toContain('.claude/commands/plan.md')
      for (const shared of ['AGENTS.md', 'CLAUDE.md', 'GEMINI.md']) {
        expect(owned, shared).not.toContain(shared)
      }
    })

    it('writes .git/info/exclude and leaves .gitignore alone', () => {
      mkdirSync(join(root, '.git', 'info'), { recursive: true })
      ensureAgentScaffolding(root, { commit: false })

      const exclude = read('.git/info/exclude')
      expect(exclude).toContain(`/${PLAN_CLI}`)
      expect(exclude).not.toContain('/AGENTS.md')
      expect(existsSync(join(root, '.gitignore'))).toBe(false)
    })

    it('replaces its own exclude block rather than stacking copies', () => {
      mkdirSync(join(root, '.git', 'info'), { recursive: true })
      writeFileSync(join(root, '.git', 'info', 'exclude'), '# theirs\n*.log\n')
      ensureAgentScaffolding(root, { commit: false })
      ensureAgentScaffolding(root, { commit: false })

      const exclude = read('.git/info/exclude')
      expect(exclude.match(/BEGIN SLEIPNIR/g)).toHaveLength(1)
      expect(exclude).toContain('*.log')
    })

    it('is a no-op outside a git repo', () => {
      expect(ensureAgentScaffolding(root, { commit: false }).excluded).toEqual([])
      expect(existsSync(join(root, '.git'))).toBe(false)
    })
  })
})
