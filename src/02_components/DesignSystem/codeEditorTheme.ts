import { EditorView } from '@codemirror/view'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags as t } from '@lezer/highlight'

// Reskins CodeMirror's chrome (background, gutters, cursor, selection) to
// match the app's tactical theme tokens.
export const tacticalEditorTheme = EditorView.theme(
  {
    '&': {
      color: 'var(--text-1)',
      backgroundColor: 'var(--bg-1)',
      height: '100%',
      fontSize: '12px',
    },
    '.cm-content': {
      fontFamily: 'var(--font-mono)',
      caretColor: 'var(--text-1)',
    },
    '.cm-gutters': {
      backgroundColor: 'var(--bg-1)',
      color: 'var(--text-3)',
      border: 'none',
    },
    '.cm-activeLine': {
      backgroundColor: 'rgba(255,255,255,0.04)',
    },
    '.cm-activeLineGutter': {
      backgroundColor: 'rgba(255,255,255,0.04)',
    },
    '.cm-selectionBackground, ::selection': {
      backgroundColor: 'rgba(255,255,255,0.12) !important',
    },
    '.cm-cursor': {
      borderLeftColor: 'var(--text-1)',
    },
    '&.cm-focused': {
      outline: 'none',
    },
  },
  { dark: true },
)

// Custom syntax palette — replaces CodeMirror's bundled default highlight
// style (part of `basicSetup`), which leaned on a harsh red for tags/atoms.
// Softer grey/white base, light green for strings, light blue for
// keywords/types, soft salmon-orange (never red) for numbers/atoms/tags.
export const tacticalHighlightStyle = HighlightStyle.define([
  { tag: [t.comment, t.lineComment, t.blockComment], color: 'var(--text-3)', fontStyle: 'italic' },
  { tag: [t.keyword, t.controlKeyword, t.moduleKeyword, t.operatorKeyword], color: '#a8c8ff' },
  { tag: [t.string, t.special(t.string), t.regexp], color: '#a8e6b2' },
  { tag: [t.number, t.bool, t.null, t.atom], color: '#ffa89d' },
  { tag: [t.tagName, t.self], color: '#ffa89d' },
  { tag: [t.attributeName], color: '#a8e6b2' },
  { tag: [t.typeName, t.className, t.namespace], color: '#a8c8ff' },
  { tag: [t.function(t.variableName), t.definition(t.function(t.variableName))], color: '#f4f5f7' },
  { tag: [t.propertyName, t.definition(t.propertyName)], color: '#a8c8ff' },
  { tag: [t.variableName, t.definition(t.variableName)], color: 'var(--text-1)' },
  { tag: [t.operator, t.punctuation, t.bracket, t.separator], color: 'var(--text-2)' },
  { tag: [t.meta, t.annotation], color: 'var(--text-3)' },
  { tag: t.invalid, color: '#ffa89d', textDecoration: 'underline' },
])

export const tacticalCodeHighlighting = syntaxHighlighting(tacticalHighlightStyle)
