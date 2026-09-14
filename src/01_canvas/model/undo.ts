// Undo/redo for the canvas.
//
// Trivial because model/doc.ts is immutable: history is just an array of
// previous docs, and undo is a pointer move. This is only sound as long as
// nothing mutates a doc in place — see the immutability tests in doc.test.ts,
// which exist to protect exactly this.

import type { CanvasDoc } from './types'

/** Bounded so a long editing session can't grow unboundedly in memory. */
export const MAX_HISTORY = 100

export interface History {
  past: CanvasDoc[]
  present: CanvasDoc
  future: CanvasDoc[]
}

export function initHistory(doc: CanvasDoc): History {
  return { past: [], present: doc, future: [] }
}

/**
 * Records a new state.
 *
 * `coalesce` merges this edit into the previous entry instead of pushing a new
 * one — used for continuous gestures, so dragging a node 200px produces one
 * undo step rather than 200. The drag's first frame commits normally; every
 * frame after it coalesces.
 */
export function commit(history: History, next: CanvasDoc, coalesce = false): History {
  if (next === history.present) return history
  if (coalesce && history.past.length > 0) {
    return { past: history.past, present: next, future: [] }
  }
  const past = [...history.past, history.present]
  return {
    past: past.length > MAX_HISTORY ? past.slice(past.length - MAX_HISTORY) : past,
    present: next,
    future: [],
  }
}

export function undo(history: History): History {
  if (history.past.length === 0) return history
  const present = history.past[history.past.length - 1]
  return {
    past: history.past.slice(0, -1),
    present,
    future: [history.present, ...history.future],
  }
}

export function redo(history: History): History {
  if (history.future.length === 0) return history
  return {
    past: [...history.past, history.present],
    present: history.future[0],
    future: history.future.slice(1),
  }
}

export function canUndo(history: History): boolean {
  return history.past.length > 0
}

export function canRedo(history: History): boolean {
  return history.future.length > 0
}

/**
 * Replaces the present without recording history — for an external reload
 * (the planning watcher seeing a git pull or a hand edit). History is dropped
 * because undoing back past someone else's change would silently clobber it.
 */
export function reset(doc: CanvasDoc): History {
  return initHistory(doc)
}
