// A top-level layer's solids on the 2D board, drawn as the 3D view's Front
// camera sees them (document/frontView.ts): every visible triangle projected,
// painted far to near, each shaded by the 3D view's lights — so a cube turned
// in 3D shows here as the same shaded diamond or hexagon. Board space; the
// viewport's camera transform places it.

import { memo, useMemo } from 'react'
import { frontShade } from '../../document/frontView'
import { resolveCssColor, type ProjectedSurface } from '../../modeling/scene3d/sceneMeshes'
import type { Vec3 } from '../../document/sceneTypes'

/** A resolved CSS color as sRGB channels (0–255); clay grey when it can't be read. */
function rgbOf(css: string): Vec3 {
  const resolved = resolveCssColor(css)
  // Six digits before three, or '#5b9dff' reads as '#5b9'.
  const hex = resolved.match(/^#([0-9a-f]{6}|[0-9a-f]{3})(?:[0-9a-f]{2})?$/i)?.[1]
  if (hex) {
    const full = hex.length === 3 ? [...hex].map((c) => c + c).join('') : hex
    return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as Vec3
  }
  const channels = resolved.match(/[\d.]+/g)?.slice(0, 3).map(Number)
  return channels && channels.length === 3 ? (channels as Vec3) : [185, 188, 196]
}

export const ProjectedSolid = memo(function ProjectedSolid({ layerId, surfaces }: { layerId: string; surfaces: ProjectedSurface[] }) {
  const polygons = useMemo(
    () =>
      surfaces.flatMap((surface) => {
        const base = rgbOf(surface.css)
        return surface.faces.map((face) => {
          const [r, g, b] = frontShade(base, face.normal)
          return { points: face.points.map((p) => `${p.x},${p.y}`).join(' '), fill: `rgb(${r}, ${g}, ${b})`, opacity: surface.opacity, depth: face.depth }
        })
      })
        // A layer's own solid and its tubes interleave: paint all of them far to near.
        .sort((a, b) => a.depth - b.depth),
    [surfaces],
  )
  return (
    <svg data-canvas-solid={layerId} style={{ position: 'absolute', left: 0, top: 0, width: 1, height: 1, overflow: 'visible', pointerEvents: 'none' }}>
      {polygons.map((p, i) => (
        // A hairline in the face's own color closes the seams antialiasing leaves between triangles.
        <polygon key={i} points={p.points} fill={p.fill} fillOpacity={p.opacity} stroke={p.fill} strokeOpacity={p.opacity} strokeWidth={0.75} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      ))}
    </svg>
  )
})
