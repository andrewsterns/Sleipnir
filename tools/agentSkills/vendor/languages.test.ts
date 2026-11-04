// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { LANGUAGES, UI_FRAMEWORKS, extensionMap, languageById, languageForPath } from './languages.mjs'
import { LANGUAGES as PLANNING_LANGUAGES } from '../../../src/planning/graph/architectures'
import { extForLanguage, languageForExt } from '../../../src/planning/graph/naming'
import { parseFileSpec, PLANNED_LANGUAGES } from '../../planDoc.mjs'

describe('the language table', () => {
  it('has one entry per id, each with what every consumer reads', () => {
    const ids = LANGUAGES.map((l) => l.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const l of LANGUAGES) {
      expect(l.extensions.length, l.id).toBeGreaterThan(0)
      expect(l.comment.line || l.comment.block, l.id).toBeTruthy()
      expect(['camel', 'snake', 'pascal'], l.id).toContain(l.naming)
      if (l.server) expect(l.server.install, l.id).toBeTruthy()
    }
  })

  it('resolves extensions first-match, so shared families land on their canonical member', () => {
    expect(languageForPath('src/app.js')?.id).toBe('javascript')
    expect(languageForPath('src/App.tsx')?.id).toBe('react')
    expect(languageForPath('include/sensor.h')?.id).toBe('c')
    expect(languageForPath('src/engine.hpp')?.id).toBe('cpp')
    expect(languageForPath('Cart.kt')?.id).toBe('kotlin')
    expect(languageForPath('README')).toBeNull()
    expect(extensionMap().mjs).toBe('javascript')
  })

  it('targets UI frameworks only in languages it knows', () => {
    for (const f of UI_FRAMEWORKS) expect(languageById(f.language), f.id).toBeDefined()
    expect(UI_FRAMEWORKS.filter((f) => f.status === 'available').map((f) => f.id)).toEqual(['react'])
  })
})

describe('consumers agree with the table', () => {
  it('Planning scaffolds exactly the languages marked plannable, in table order', () => {
    const plannable = LANGUAGES.filter((l) => l.planning)
    expect(PLANNING_LANGUAGES.map((l) => l.id)).toEqual(plannable.map((l) => l.id))
    expect(PLANNED_LANGUAGES).toEqual(plannable.map((l) => l.id))
    for (const l of plannable) expect(extForLanguage(l.id as never)).toBe(l.extensions[0])
  })

  it('reads every extension of a plannable language, not just the one scaffolds write', () => {
    expect(languageForExt('mjs')).toBe('javascript')
    expect(languageForExt('.PYI')).toBe('python')
    expect(languageForExt('js')).toBe('javascript')
    expect(parseFileSpec('tools/run.cjs:node', 'react')).toMatchObject({ language: 'javascript' })
    expect(languageForExt('h')).toBe('c')
    expect(languageForExt('hpp')).toBe('cpp')
    // A language Planning can't scaffold doesn't resolve as one.
    expect(languageForExt('vue')).toBeNull()
  })
})
