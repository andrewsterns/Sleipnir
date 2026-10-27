// The gallop is SMIL, which CSS can't pause, so reduced motion is honoured
// here: the horse holds its first pose. Kept out of loaderMarkup.ts, which
// vite.config imports and so can't touch the DOM.
export function respectReducedMotion(root: ParentNode): void {
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) return
  root.querySelectorAll<SVGSVGElement>('.sleipnir-loader svg').forEach((svg) => {
    svg.pauseAnimations()
    svg.setCurrentTime(0)
  })
}
