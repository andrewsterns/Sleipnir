import { describe, it, expect } from 'vitest'
import { EditorState } from '@codemirror/state'
import { language } from '@codemirror/language'
import { grammarKeyForPath, loadLanguageForPath } from './codeEditorLanguages'
import { LANGUAGES } from '../../../tools/agentSkills/vendor/languages.mjs'

describe('editor grammars', () => {
  it('gives every language in the table a grammar that loads', async () => {
    for (const lang of LANGUAGES.filter((l) => l.editor)) {
      const support = await loadLanguageForPath(`src/file.${lang.extensions[0]}`)
      const state = EditorState.create({ doc: '', extensions: support })
      expect(state.facet(language), `${lang.id} (.${lang.extensions[0]})`).not.toBeNull()
    }
  })

  it('highlights build files and config formats by name or extension', () => {
    expect(grammarKeyForPath('CMakeLists.txt')).toBe('cmake')
    expect(grammarKeyForPath('docker/Dockerfile')).toBe('dockerfile')
    expect(grammarKeyForPath('Cargo.toml')).toBe('toml')
    expect(grammarKeyForPath('.github/workflows/ci.yml')).toBe('yaml')
    expect(grammarKeyForPath('include/sensor.h')).toBe('cpp')
    expect(grammarKeyForPath('App.vue')).toBe('html')
  })

  it('leaves unknown files as plain text', async () => {
    expect(grammarKeyForPath('notes.txt')).toBeNull()
    expect(await loadLanguageForPath('LICENSE')).toEqual([])
  })
})
