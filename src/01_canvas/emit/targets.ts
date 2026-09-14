// The emit-target registry behind the frame's language dropdown.
//
// This is where "would we need to build a base <frame/> in all languages?" gets
// its concrete answer: no — but a target is a LANGUAGE + FRAMEWORK pair, and
// most languages have no framework chosen, so they cannot receive a frame at
// all. Rather than hiding them (which just moves the question into a doc), they
// are listed and disabled with the reason shown inline.
//
// Labels are pulled from graph/architectures.ts's LANGUAGES so there is one
// source of truth for language naming across Planning and Canvas.

import { LANGUAGES, type LanguageId } from '../../00_planning/graph/architectures'
import type { CanvasTarget, CanvasTargetDef } from '../model/types'

/**
 * Exactly the three LanguageIds that can express a box without a framework
 * choice nobody has made yet. `react` emits <Frame/> JSX against UIKit, which
 * is the same component the board renders with — so its output is WYSIWYG by
 * construction rather than by approximation.
 */
export const AVAILABLE_TARGETS: CanvasTarget[] = ['react']

/**
 * Why each unavailable language can't take a frame yet. Kept as prose because
 * it's shown to the user in the dropdown — this text is the feature's honest
 * answer to "why can't I pick Rust?".
 */
const UNAVAILABLE_REASON: Partial<Record<LanguageId, string>> = {
  html: 'Emitter planned — semantic markup plus a paired stylesheet.',
  css: 'Emitted alongside HTML, not selectable on its own.',
  typescript: 'No UI framework chosen — a box needs one to render into.',
  javascript: 'No UI framework chosen — a box needs one to render into.',
  jquery: 'No UI framework chosen — a box needs one to render into.',
  python: 'No UI framework chosen. A props dataclass can be emitted instead.',
  rust: 'Needs a UI framework (Leptos would reuse the same box model; egui would not).',
  go: 'Needs a UI framework (templ would reuse the same box model; Gio would not).',
}

export const CANVAS_TARGETS: CanvasTargetDef[] = LANGUAGES.map((lang) => ({
  id: lang.id,
  label: lang.label,
  available: (AVAILABLE_TARGETS as LanguageId[]).includes(lang.id),
  unavailableReason: UNAVAILABLE_REASON[lang.id],
}))

export function isAvailableTarget(id: LanguageId): id is CanvasTarget {
  return (AVAILABLE_TARGETS as LanguageId[]).includes(id)
}

export function targetLabel(id: LanguageId): string {
  return CANVAS_TARGETS.find((t) => t.id === id)?.label ?? id
}
