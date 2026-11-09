// What a terminal session has printed, kept in the main process so a reloaded
// page can replay it. Bounded, and cut at a line break so the replay never
// starts halfway through an escape sequence. Plain JS with no Electron or
// node-pty in it, so it can be tested on its own.

const MAX_SCROLLBACK = 2_000_000

function appendScrollback(buffer, chunk, max = MAX_SCROLLBACK) {
  const next = buffer + chunk
  if (next.length <= max) return next
  const cut = next.length - max
  const lineBreak = next.indexOf('\n', cut)
  return lineBreak < 0 ? next.slice(cut) : next.slice(lineBreak + 1)
}

module.exports = { appendScrollback, MAX_SCROLLBACK }
