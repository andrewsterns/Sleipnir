import { describe, it, expect } from 'vitest'
import { panesFromStored, shellFromStored } from './sessionState'

const SPACES = ['planning', 'canvas', 'workspace']
const DOCKS = ['terminal', 'agent']

describe('coming back after a reload', () => {
  it('restores the space, split and dock', () => {
    expect(shellFromStored({ active: 'canvas', secondary: 'workspace', dock: 'terminal' }, SPACES, DOCKS, 'planning')).toEqual({ active: 'canvas', secondary: 'workspace', dock: 'terminal' })
  })

  it('starts clean with nothing stored, and drops what no longer exists', () => {
    expect(shellFromStored(null, SPACES, DOCKS, 'planning')).toEqual({ active: 'planning', secondary: null, dock: null })
    expect(shellFromStored({ active: 'validation', secondary: 'gone', dock: 'nope' }, SPACES, DOCKS, 'planning')).toEqual({ active: 'planning', secondary: null, dock: null })
  })

  it('never splits a space beside itself', () => {
    expect(shellFromStored({ active: 'canvas', secondary: 'canvas' }, SPACES, DOCKS, 'planning').secondary).toBeNull()
  })

  it('reopens files with the active one, ignoring what it can’t read', () => {
    const panes = panesFromStored({ primary: { tabs: [{ path: 'a.ts', label: 'a.ts', line: 9 }, { path: 'b.ts', label: 'b.ts' }, { nonsense: true }], activeTabPath: 'a.ts' }, secondary: 'broken' })
    expect(panes.primary).toEqual({ tabs: [{ path: 'a.ts', label: 'a.ts' }, { path: 'b.ts', label: 'b.ts' }], activeTabPath: 'a.ts' })
    expect(panes.secondary).toEqual({ tabs: [], activeTabPath: null })
  })

  it('falls back to the last file when the active one is missing', () => {
    expect(panesFromStored({ primary: { tabs: [{ path: 'a.ts', label: 'a' }, { path: 'b.ts', label: 'b' }], activeTabPath: 'gone.ts' } }).primary.activeTabPath).toBe('b.ts')
  })
})
