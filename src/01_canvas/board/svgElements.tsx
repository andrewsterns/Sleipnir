// model/vector.ts's element descriptions as React elements — the board's half
// of the one SVG derivation (emit/svg.ts writes the same descriptions as JSX).

import { createElement, type ReactNode } from 'react'
import type { SvgEl } from '../model/vector'

export function renderSvgEl(el: SvgEl, key?: string | number, extra?: Record<string, unknown>): ReactNode {
  return createElement(
    el.tag,
    { ...el.attrs, ...(el.style ? { style: el.style } : {}), ...extra, key },
    el.children?.map((child, i) => renderSvgEl(child, i)),
  )
}
