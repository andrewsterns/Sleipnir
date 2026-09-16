// @vitest-environment node
import { createRequire } from 'node:module'
import { describe, it, expect } from 'vitest'

const require = createRequire(import.meta.url)
const { decide, isOffered, canRemember, ruleKeyFor, normalizeMode } = require('./permissions.cjs')

type Kind = 'read' | 'edit' | 'exec' | 'external'
const tool = (kind: Kind, extra: Record<string, unknown> = {}) => ({ name: `t_${kind}`, kind, ...extra })

describe('decide', () => {
  it('always lets read tools run, in every mode', () => {
    for (const mode of ['ask', 'acceptEdits', 'plan', 'auto', 'headless']) {
      expect(decide({ mode, tool: tool('read') })).toBe('allow')
    }
  })

  it('asks before any change in ask mode', () => {
    expect(decide({ mode: 'ask', tool: tool('edit') })).toBe('ask')
    expect(decide({ mode: 'ask', tool: tool('exec') })).toBe('ask')
    expect(decide({ mode: 'ask', tool: tool('external') })).toBe('ask')
  })

  it('applies edits but still asks for commands in acceptEdits mode', () => {
    expect(decide({ mode: 'acceptEdits', tool: tool('edit') })).toBe('allow')
    expect(decide({ mode: 'acceptEdits', tool: tool('exec') })).toBe('ask')
    expect(decide({ mode: 'acceptEdits', tool: tool('external') })).toBe('ask')
  })

  it('runs everything in auto mode except alwaysAsk tools', () => {
    expect(decide({ mode: 'auto', tool: tool('edit') })).toBe('allow')
    expect(decide({ mode: 'auto', tool: tool('exec') })).toBe('allow')
    expect(decide({ mode: 'auto', tool: tool('external') })).toBe('allow')
    expect(decide({ mode: 'auto', tool: tool('exec', { alwaysAsk: true }) })).toBe('ask')
  })

  it('only lets plan mode write the plan itself', () => {
    expect(decide({ mode: 'plan', tool: tool('edit', { allowInPlan: true }) })).toBe('allow')
    expect(decide({ mode: 'plan', tool: tool('edit') })).toBe('deny')
    expect(decide({ mode: 'plan', tool: tool('exec') })).toBe('deny')
    expect(decide({ mode: 'plan', tool: tool('external') })).toBe('deny')
  })

  it('never asks in headless mode, since nobody is there to answer', () => {
    expect(decide({ mode: 'headless', tool: tool('edit') })).toBe('allow')
    expect(decide({ mode: 'headless', tool: tool('exec') })).toBe('deny')
    expect(decide({ mode: 'headless', tool: tool('external') })).toBe('deny')
    expect(decide({ mode: 'headless', tool: tool('edit', { alwaysAsk: true }) })).toBe('deny')
  })

  it('honors a saved rule in ask mode, but never for alwaysAsk tools', () => {
    expect(decide({ mode: 'ask', tool: tool('exec'), rules: ['t_exec'] })).toBe('allow')
    expect(decide({ mode: 'ask', tool: tool('exec', { alwaysAsk: true }), rules: ['t_exec'] })).toBe('ask')
    expect(decide({ mode: 'acceptEdits', tool: tool('exec'), rules: new Set(['t_exec']) })).toBe('allow')
  })

  it('matches narrowed rules per input', () => {
    const run = tool('exec', { name: 'run_command', ruleKey: (i: { command?: string }) => `run_command:${i.command}` })
    expect(decide({ mode: 'ask', tool: run, input: { command: 'npm' }, rules: ['run_command:npm'] })).toBe('allow')
    expect(decide({ mode: 'ask', tool: run, input: { command: 'rm' }, rules: ['run_command:npm'] })).toBe('ask')
  })

  it('treats an unknown mode as ask', () => {
    expect(normalizeMode('yolo')).toBe('ask')
    expect(decide({ mode: 'yolo', tool: tool('edit') })).toBe('ask')
  })
})

describe('isOffered / canRemember / ruleKeyFor', () => {
  it('hides tools the mode would only ever deny', () => {
    expect(isOffered('plan', tool('exec'))).toBe(false)
    expect(isOffered('plan', tool('read'))).toBe(true)
    expect(isOffered('headless', tool('exec'))).toBe(false)
    expect(isOffered('ask', tool('exec'))).toBe(true)
  })

  it('never offers "always allow" for alwaysAsk or read tools', () => {
    expect(canRemember(tool('exec'), {})).toBe(true)
    expect(canRemember(tool('exec', { alwaysAsk: true }), {})).toBe(false)
    expect(canRemember(tool('read'), {})).toBe(false)
  })

  it('keys a rule by tool name unless the tool narrows it', () => {
    expect(ruleKeyFor(tool('edit'), {})).toBe('t_edit')
    expect(ruleKeyFor(tool('exec', { ruleKey: () => 'narrow' }), {})).toBe('narrow')
  })

  it('treats a null ruleKey as "can never be pre-approved"', () => {
    const unsafe = tool('exec', { ruleKey: () => null })
    expect(ruleKeyFor(unsafe, {})).toBeNull()
    expect(canRemember(unsafe, {})).toBe(false)
    // Even a blanket rule under the tool's own name doesn't let it through.
    expect(decide({ mode: 'ask', tool: unsafe, input: {}, rules: ['t_exec'] })).toBe('ask')
  })
})
