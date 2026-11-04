// The one look every typed field in the app shares — text inputs, textareas,
// selects, number fields (counters) and dropdown triggers. Before this, the
// properties panel, Planning's modals, Settings, the Git panel and the file
// trees each carried their own copy (`FIELD`, `INPUT_STYLE`, `FIELD_STYLE`,
// inline objects), with radii from square to fully rounded.
//
// Components (TextField, TextArea, SelectField, NumberField) are the normal way
// in; `fieldStyle()` is for the few places that must style an element they
// don't own (a field inside a third-party widget, a native control).
//
// The corner radius is the `--radius-field` theme token — change it there and
// every field follows.

import type React from 'react'

export type FieldSize = 'sm' | 'md' | 'lg'

const SIZE: Record<FieldSize, React.CSSProperties> = {
  // Dense panels: the properties inspector, paint rows.
  sm: { fontSize: 11.5, padding: '4px 7px' },
  // Side panels and inline rows: file trees, Git, the run picker.
  md: { fontSize: 12.5, padding: '6px 10px' },
  // Dialogs and settings pages.
  lg: { fontSize: 13, padding: '8px 11px' },
}

export function fieldStyle(size: FieldSize = 'md'): React.CSSProperties {
  return {
    fontFamily: 'var(--font-ui)',
    background: 'var(--bg-2)',
    border: '1px solid var(--border-1)',
    borderRadius: 'var(--radius-field)',
    color: 'var(--text-1)',
    outline: 'none',
    width: '100%',
    minWidth: 0,
    boxSizing: 'border-box',
    ...SIZE[size],
  }
}

/** Class every field carries — focus, disabled and placeholder states live in index.css. */
export const FIELD_CLASS = 'ui-field'
