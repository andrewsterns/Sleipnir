import { EditorView } from '@codemirror/view'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags as t } from '@lezer/highlight'

// Reskins CodeMirror's chrome (background, gutters, cursor, selection) to
// match the active app theme's tokens. Chrome washes use the --item-ink
// triple (white in dark, near-black in light) so the active-line highlight and
// selection stay visible on both grounds instead of being a fixed white alpha.
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
      backgroundColor: 'rgba(var(--item-ink, 255,255,255), 0.04)',
    },
    '.cm-activeLineGutter': {
      backgroundColor: 'rgba(var(--item-ink, 255,255,255), 0.04)',
    },
    '.cm-selectionBackground, ::selection': {
      backgroundColor: 'rgba(var(--item-ink, 255,255,255), 0.12) !important',
    },
    '.cm-cursor': {
      borderLeftColor: 'var(--text-1)',
    },
    '&.cm-focused': {
      outline: 'none',
    },
    // While Ctrl/Cmd is held over the code (class toggled by
    // goToDefinitionOnModClick in lspClient.ts), show the "drill into" pointer
    // so mod-click-to-definition is discoverable, like VS Code's link cursor.
    '&.cm-goToDef .cm-content': {
      cursor: 'pointer',
    },
    // Ctrl/Cmd-hover "definition confirmed here" underline (see lspClient.ts's
    // modHoverDefinitionLink) — only ever applied to a word the language
    // server has actually confirmed resolves, so this is direct visual proof
    // the LSP connection is alive and definitions are resolving correctly.
    '.cm-hoverDefLink': {
      textDecoration: 'underline',
      textDecorationColor: 'var(--code-keyword, #a8c8ff)',
      cursor: 'pointer',
    },
    // Native hover tooltip (lspClient.ts's lspHoverTooltips) — match the
    // app's own panel styling instead of CodeMirror's plain default box.
    '.cm-tooltip': {
      backgroundColor: 'var(--bg-2)',
      border: '1px solid var(--border-2)',
      color: 'var(--text-1)',
      fontSize: '11px',
      fontFamily: 'var(--font-mono)',
    },
  },
  { dark: true },
)

// Custom syntax palette — replaces CodeMirror's bundled default highlight
// style (part of `basicSetup`), which leaned on a harsh red for tags/atoms.
// Colors are driven by per-theme --code-* tokens (defined in tactical.css /
// light.css) so the syntax palette inverts with the app theme: dark mode keeps
// the soft grey/blue/green/salmon scheme (the hex fallbacks here match it
// exactly), while light mode restrains to a grey/black/blue palette with red
// reserved for invalid tokens. Comments/variables/punctuation reuse the shared
// --text-* tokens, so they invert automatically without a dedicated token.
export const tacticalHighlightStyle = HighlightStyle.define([
  { tag: [t.comment, t.lineComment, t.blockComment], color: 'var(--text-3)', fontStyle: 'italic' },
  { tag: [t.keyword, t.controlKeyword, t.moduleKeyword, t.operatorKeyword], color: 'var(--code-keyword, #a8c8ff)' },
  { tag: [t.string, t.special(t.string), t.regexp], color: 'var(--code-string, #a8e6b2)' },
  { tag: [t.number, t.bool, t.null, t.atom], color: 'var(--code-number, #ffa89d)' },
  { tag: [t.tagName, t.self], color: 'var(--code-tag, #ffa89d)' },
  { tag: [t.attributeName], color: 'var(--code-attribute, #a8e6b2)' },
  { tag: [t.typeName, t.className, t.namespace], color: 'var(--code-type, #a8c8ff)' },
  { tag: [t.function(t.variableName), t.definition(t.function(t.variableName))], color: 'var(--code-function, #f4f5f7)' },
  { tag: [t.propertyName, t.definition(t.propertyName)], color: 'var(--code-property, #a8c8ff)' },
  { tag: [t.variableName, t.definition(t.variableName)], color: 'var(--text-1)' },
  { tag: [t.operator, t.punctuation, t.bracket, t.separator], color: 'var(--text-2)' },
  { tag: [t.meta, t.annotation], color: 'var(--text-3)' },
  { tag: t.invalid, color: 'var(--code-invalid, #ffa89d)', textDecoration: 'underline' },
])

export const tacticalCodeHighlighting = syntaxHighlighting(tacticalHighlightStyle)
