// Drives index.html's boot screen: the Sleipnir loader stays up over the
// mounting app until the work registered here has finished, and its progress
// bar tracks how much of that work is done.
//
// Required work gates the boot screen. Optional work (warm-ups that only make
// later actions faster) counts toward the bar, but the screen only waits
// OPTIONAL_GRACE_MS for it once the required work is in — it keeps running in
// the background after that.

import { respectReducedMotion } from './app/UIKit/SleipnirLoader/reducedMotion'

const OPTIONAL_GRACE_MS = 2000
// Never trap the user behind the loader, whatever hangs.
const MAX_BOOT_MS = 15000
// index.html's pre-JS creep animation ends here; real progress fills the rest.
const BAR_START = 30

let total = 0
let settled = 0
let requiredPending = 0
let started = false
let finishing = false
const optional: Promise<unknown>[] = []

function screen(): HTMLElement | null {
  return document.getElementById('sleipnir-boot')
}

// The boot screen's horse is already galloping by the time this runs.
const bootScreen = screen()
if (bootScreen) respectReducedMotion(bootScreen)

function render() {
  const fill = screen()?.querySelector<HTMLElement>('.sleipnir-boot-bar-fill')
  if (!fill) return
  const pct = total === 0 ? BAR_START : BAR_START + ((100 - BAR_START) * settled) / total
  fill.style.animation = 'none'
  fill.style.width = `${pct}%`
}

function onSettled(isRequired: boolean) {
  settled++
  if (isRequired) requiredPending--
  render()
  maybeFinish()
}

function maybeFinish() {
  if (!started || finishing || requiredPending > 0) return
  finishing = true
  const grace = new Promise((resolve) => setTimeout(resolve, OPTIONAL_GRACE_MS))
  void Promise.race([Promise.allSettled(optional), grace]).then(hide)
}

function hide() {
  const el = screen()
  if (!el) return
  const fill = el.querySelector<HTMLElement>('.sleipnir-boot-bar-fill')
  if (fill) fill.style.width = '100%'
  el.classList.add('is-done')
  const remove = () => el.remove()
  el.addEventListener('transitionend', remove, { once: true })
  // transitionend never fires under reduced motion or a hidden window.
  setTimeout(remove, 600)
}

/** Registers work with the boot screen. Rejections count as finished. */
export function bootTask<T>(work: Promise<T>, opts: { optional?: boolean } = {}): Promise<T> {
  const isRequired = !opts.optional
  total++
  if (isRequired) requiredPending++
  else optional.push(work)
  render()
  work.then(
    () => onSettled(isRequired),
    () => onSettled(isRequired),
  )
  return work
}

/**
 * A required step completed by whoever calls the returned function (safe to
 * call more than once) — for work that only starts once the app has mounted.
 */
export function bootSignal(): () => void {
  let done!: () => void
  bootTask(new Promise<void>((resolve) => (done = resolve)))
  return () => done()
}

/** Call once every up-front task is registered; the screen can then close. */
export function startBoot() {
  started = true
  setTimeout(hide, MAX_BOOT_MS)
  maybeFinish()
}

/** /loader preview: no work to track, so the bar just loops. */
export function previewBoot() {
  screen()?.classList.add('is-preview')
}
