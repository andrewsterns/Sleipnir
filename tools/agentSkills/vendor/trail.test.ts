// @vitest-environment node
// The agent trail: what agents are about to do, one line per tool call, written
// outside the model — by Claude Code's hook running the vendored trail.mjs, and
// by the in-app agent through electron/agentTrail.cjs.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { appendTrail, entryFor, KEEP_LINES, MAX_TRAIL_BYTES, TRAIL_FILE } from './trail.mjs'
import { ensureTrailHook, TRAIL_SETTINGS } from '../scaffold.mjs'
import * as backend from '../../sleipnir-backend.mjs'

const require = createRequire(import.meta.url)
const { inAppEntry } = require('../../../electron/agentTrail.cjs')
const HOOK = join(__dirname, 'trail.mjs')

let root: string
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'sleipnir-trail-'))
  mkdirSync(join(root, '.planning'))
})
afterEach(() => {
  rmSync(root, { recursive: true, force: true })
  backend.setWorkspaceRoot(null)
})

const lines = () => readFileSync(join(root, TRAIL_FILE), 'utf8').trim().split('\n').map((l) => JSON.parse(l))
const hook = (event: Record<string, unknown>) =>
  execFileSync('node', [HOOK], { input: JSON.stringify(event), env: { ...process.env, CLAUDE_PROJECT_DIR: root }, encoding: 'utf8' })

describe('entryFor', () => {
  it('reads, edits, searches, runs and tests, in workspace paths', () => {
    const at = 1
    expect(entryFor({ agent: 'claude', tool: 'Read', input: { file_path: join(root, 'src', 'a.ts') }, root, at })).toEqual({ at, agent: 'claude', tool: 'Read', kind: 'read', paths: ['src/a.ts'] })
    expect(entryFor({ agent: 'claude', tool: 'Edit', input: { file_path: 'src/a.ts' }, root, at }).kind).toBe('edit')
    expect(entryFor({ agent: 'claude', tool: 'Grep', input: { pattern: 'useCart', path: 'src' }, root, at })).toMatchObject({ kind: 'search', paths: ['src'], query: 'useCart' })
    expect(entryFor({ agent: 'claude', tool: 'Bash', input: { command: 'npx vitest run src/cart' }, root, at })).toMatchObject({ kind: 'test' })
    expect(entryFor({ agent: 'claude', tool: 'Bash', input: { command: 'git status' }, root, at })).toMatchObject({ kind: 'run', cmd: 'git status' })
    expect(entryFor({ agent: 'claude', root, at })).toEqual({ at, agent: 'claude', kind: 'idle' })
  })

  it('keeps files outside the project out of the trail', () => {
    expect(entryFor({ agent: 'claude', tool: 'Read', input: { file_path: join(tmpdir(), 'elsewhere.txt') }, root }).paths).toEqual([])
  })
})

describe('the Claude Code hook', () => {
  it('appends a line for each tool call and for stopping, silently', () => {
    const out = hook({ hook_event_name: 'PreToolUse', session_id: 'abcdef123456', tool_name: 'Read', tool_input: { file_path: join(root, 'src/a.ts') } })
    hook({ hook_event_name: 'Stop', session_id: 'abcdef123456' })
    expect(out).toBe('')
    expect(lines()).toMatchObject([
      { agent: 'claude', session: 'abcdef12', kind: 'read', paths: ['src/a.ts'] },
      { agent: 'claude', session: 'abcdef12', kind: 'idle' },
    ])
  })

  it('never fails the tool call: bad input exits 0 and writes nothing', () => {
    expect(() => execFileSync('node', [HOOK], { input: 'not json', env: { ...process.env, CLAUDE_PROJECT_DIR: root } })).not.toThrow()
    expect(existsSync(join(root, TRAIL_FILE))).toBe(false)
  })

  it('does nothing in a project Sleipnir has not set up', () => {
    rmSync(join(root, '.planning'), { recursive: true })
    hook({ hook_event_name: 'PreToolUse', tool_name: 'Read', tool_input: { file_path: 'a.ts' } })
    expect(existsSync(join(root, '.planning'))).toBe(false)
  })

  it('logs in a project Sleipnir set up, even before its first plan', () => {
    rmSync(join(root, '.planning'), { recursive: true })
    mkdirSync(join(root, '.sleipnir'))
    hook({ hook_event_name: 'PreToolUse', tool_name: 'Read', tool_input: { file_path: 'a.ts' } })
    expect(lines()).toMatchObject([{ kind: 'read', paths: ['a.ts'] }])
  })
})

describe('skills and instructions', () => {
  it('tells instruction reads, skills and the vendored CLIs apart', () => {
    const at = 1
    expect(entryFor({ agent: 'claude', tool: 'Read', input: { file_path: 'AGENTS.md' }, root, at }).kind).toBe('instruction')
    expect(entryFor({ agent: 'claude', tool: 'Read', input: { file_path: '.claude/skills/review/SKILL.md' }, root, at }).kind).toBe('instruction')
    expect(entryFor({ agent: 'claude', tool: 'Read', input: { file_path: 'src/agents.md' }, root, at }).kind).toBe('read')
    expect(entryFor({ agent: 'claude', tool: 'Skill', input: { skill: 'review' }, root, at })).toMatchObject({ kind: 'skill', skill: 'review' })
    expect(entryFor({ agent: 'claude', tool: 'Bash', input: { command: 'node .sleipnir/plan.mjs list-steps --root .' }, root, at })).toMatchObject({ kind: 'run', cli: 'plan', skill: 'plan' })
    expect(entryFor({ agent: 'claude', tool: 'Bash', input: { command: 'node .sleipnir/analyze.mjs report --root .' }, root, at })).toMatchObject({ cli: 'analyze', skill: 'optimize' })
  })

  it("keeps a slash command's name from a prompt, and never the prompt's words", () => {
    hook({ hook_event_name: 'UserPromptSubmit', session_id: 's1', prompt: '/optimize my right click menu please' })
    hook({ hook_event_name: 'UserPromptSubmit', session_id: 's1', prompt: 'the secret plan is in notes.txt' })
    const [command, plain] = lines()
    expect(command).toMatchObject({ kind: 'skill', skill: 'optimize' })
    expect(plain).toMatchObject({ kind: 'prompt' })
    expect(readFileSync(join(root, TRAIL_FILE), 'utf8')).not.toMatch(/right click|secret|notes\.txt/)
  })

  it('notes a session starting with the context files it loads', () => {
    writeFileSync(join(root, 'CLAUDE.md'), '@AGENTS.md\n')
    writeFileSync(join(root, 'AGENTS.md'), '# x\n')
    expect(hook({ hook_event_name: 'SessionStart', session_id: 's2' })).toBe('')
    expect(lines()).toMatchObject([{ kind: 'session', paths: ['CLAUDE.md', 'AGENTS.md'] }])
  })
})

describe('appendTrail', () => {
  it('keeps only the newest lines once the file grows too big', () => {
    const big = { at: 1, agent: 'claude', kind: 'run', cmd: 'x'.repeat(2000) }
    const count = Math.ceil(MAX_TRAIL_BYTES / 2000) + 10
    for (let i = 0; i < count; i++) appendTrail(root, { ...big, at: i })
    const kept = lines()
    expect(kept.length).toBeLessThanOrEqual(KEEP_LINES)
    expect(kept.at(-1).at).toBe(count - 1)
  })
})

describe('the in-app agent', () => {
  it('writes the same kind of lines for its own tools, and leaves plan reports out', async () => {
    const trail = await import('./trail.mjs')
    expect(inAppEntry(trail, 'read_file', { path: 'src/a.ts' }, root, 'Sleipnir · m')).toMatchObject({ agent: 'Sleipnir · m', kind: 'read', paths: ['src/a.ts'] })
    expect(inAppEntry(trail, 'generate_code', { files: [{ path: 'src/a.ts' }, { path: 'src/b.ts' }] }, root, 's')).toMatchObject({ kind: 'edit', paths: ['src/a.ts', 'src/b.ts'] })
    expect(inAppEntry(trail, 'run_command', { command: 'npm test' }, root, 's')).toMatchObject({ kind: 'test' })
    expect(inAppEntry(trail, 'update_plan_step', {}, root, 's')).toBeNull()
  })
})

describe('reading it back', () => {
  it('hands the newest lines, oldest first, after a time', () => {
    for (const at of [1, 2, 3]) appendTrail(root, { at, agent: 'claude', kind: 'read', paths: [`f${at}`] })
    backend.setWorkspaceRoot(root)
    expect(backend.getAgentTrail({ since: 1 }).entries.map((e: { at: number }) => e.at)).toEqual([2, 3])
  })
})

describe('registering the hook', () => {
  it('adds it to this machine’s Claude settings, keeping everything else, once', () => {
    mkdirSync(join(root, '.claude'))
    writeFileSync(join(root, TRAIL_SETTINGS), JSON.stringify({ permissions: { allow: ['Bash(npm test)'] }, hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'mine.sh' }] }] } }))
    expect(ensureTrailHook(root)).toBe(true)
    expect(ensureTrailHook(root)).toBe(false)
    const settings = JSON.parse(readFileSync(join(root, TRAIL_SETTINGS), 'utf8'))
    expect(settings.permissions.allow).toEqual(['Bash(npm test)'])
    expect(settings.hooks.PreToolUse).toHaveLength(2)
    expect(settings.hooks.PreToolUse[1]).toEqual({ matcher: '*', hooks: [{ type: 'command', command: 'node .sleipnir/trail.mjs' }] })
    expect(settings.hooks.Stop).toEqual([{ hooks: [{ type: 'command', command: 'node .sleipnir/trail.mjs' }] }])
    expect(settings.hooks.UserPromptSubmit).toEqual([{ hooks: [{ type: 'command', command: 'node .sleipnir/trail.mjs' }] }])
    expect(settings.hooks.SessionStart).toEqual([{ hooks: [{ type: 'command', command: 'node .sleipnir/trail.mjs' }] }])
  })

  it('leaves a settings file it cannot read alone', () => {
    mkdirSync(join(root, '.claude'))
    writeFileSync(join(root, TRAIL_SETTINGS), '{ broken')
    expect(ensureTrailHook(root)).toBe(false)
    expect(readFileSync(join(root, TRAIL_SETTINGS), 'utf8')).toBe('{ broken')
  })
})

describe('reading through the shell', () => {
  it('counts read-only commands as reads of the files they name, and nothing that writes', () => {
    writeFileSync(join(root, 'a.ts'), 'x')
    const bash = (command: string) => entryFor({ agent: 'claude', tool: 'Bash', input: { command }, root, at: 1 })
    expect(bash('sed -n 1,20p a.ts')).toMatchObject({ kind: 'read', paths: ['a.ts'] })
    expect(bash('grep -n foo a.ts | head -5')).toMatchObject({ kind: 'read', paths: ['a.ts'] })
    expect(bash('sed -i s/x/y/ a.ts').kind).toBe('run')
    expect(bash('cat a.ts > b.ts').kind).toBe('run')
    expect(bash('npm run build').kind).toBe('run')
  })
})
