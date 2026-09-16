// @vitest-environment node
import { createRequire } from 'node:module'
import { describe, it, expect } from 'vitest'

const require = createRequire(import.meta.url)
const [runCommand] = require('./command.cjs')
const { decide } = require('../permissions.cjs')

describe('run_command rules', () => {
  it('remembers approval per executable', () => {
    expect(runCommand.ruleKey({ command: 'NPM', args: ['test'] })).toBe('run_command:npm')
    expect(decide({ mode: 'ask', tool: runCommand, input: { command: 'npm', args: ['run', 'build'] }, rules: ['run_command:npm'] })).toBe('allow')
    expect(decide({ mode: 'ask', tool: runCommand, input: { command: 'git', args: ['status'] }, rules: ['run_command:npm'] })).toBe('ask')
  })

  it('never pre-approves a command line that could chain a second command through the shell', () => {
    for (const args of [['test', '&', 'del', 'x'], ['test && rm -rf /'], ['test|more'], ['$(whoami)'], ['a\nb']]) {
      expect(runCommand.ruleKey({ command: 'npm', args })).toBeNull()
      expect(decide({ mode: 'ask', tool: runCommand, input: { command: 'npm', args }, rules: ['run_command:npm', 'run_command'] })).toBe('ask')
    }
  })
})
