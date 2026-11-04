// Where an agent is working, on the graph: four corner brackets (⌜⌝⌞⌟) held
// around the node it's on right now, in the graph's one ink. Four short SVG
// paths, not font glyphs: they scale with the node and stay crisp at any zoom.

export function FocusBox({
  x,
  y,
  half,
}: {
  x: number
  y: number
  /** Half the box's width: the node's radius plus breathing room. */
  half: number
}) {
  const h = half
  const a = half * 0.45
  const d = [
    `M ${-h} ${-h + a} L ${-h} ${-h} L ${-h + a} ${-h}`,
    `M ${h - a} ${-h} L ${h} ${-h} L ${h} ${-h + a}`,
    `M ${h} ${h - a} L ${h} ${h} L ${h - a} ${h}`,
    `M ${-h + a} ${h} L ${-h} ${h} L ${-h} ${h - a}`,
  ].join(' ')
  return (
    <g transform={`translate(${x}, ${y})`} pointerEvents="none">
      <path d={d} fill="none" style={{ stroke: 'var(--graph-node, #ffffff)' }} strokeWidth={1.5} strokeLinecap="square" vectorEffect="non-scaling-stroke" />
    </g>
  )
}
