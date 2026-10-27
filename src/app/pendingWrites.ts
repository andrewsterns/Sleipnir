// Debounced autosaves that haven't reached disk yet, reachable from the shell.
//
// Canvas and the code editors write on a debounce, so for a moment after every
// edit the newest state lives only in memory. That's fine while the app stays
// open, but File ▸ Save Project copies the project folder and closing the
// window tears the views down — either one inside the debounce window would
// silently drop the last edit. Views register a flusher here; the shell awaits
// flushPendingWrites() before saving or closing.

type Flusher = () => Promise<void> | void

const flushers = new Set<Flusher>()

/** Registers `flush` until the returned cleanup runs (call it on unmount). */
export function registerPendingWrite(flush: Flusher): () => void {
  flushers.add(flush)
  return () => {
    flushers.delete(flush)
  }
}

/** Writes every pending autosave now. Never rejects — a failed write is the view's to report. */
export async function flushPendingWrites(): Promise<void> {
  await Promise.all([...flushers].map(async (flush) => {
    try {
      await flush()
    } catch {
      // The view surfaces its own save errors; one failure mustn't block the rest.
    }
  }))
}
