import { useEffect, useRef, useState } from 'react'
import { TransformControls } from '@react-three/drei'
import type { Group } from 'three'
import type { Vec3 } from '../../document/sceneTypes'
import type { GizmoMode } from './Viewport3D.ViewModel'
import type { Move } from './modalTransform'

const DEG = 180 / Math.PI

/**
 * The move a drag of the handles has made so far: the stand-in's offset from
 * the pivot, its turn as an axis and angle, or its stretch.
 */
function moveOfProxy(proxy: Group, pivot: Vec3, mode: GizmoMode): Move {
  if (mode === 'translate') return { kind: 'translate', by: [proxy.position.x - pivot[0], proxy.position.y - pivot[1], proxy.position.z - pivot[2]] }
  if (mode === 'scale') return { kind: 'scale', by: [proxy.scale.x, proxy.scale.y, proxy.scale.z] }
  const q = proxy.quaternion
  const w = Math.max(-1, Math.min(1, q.w))
  const s = Math.sqrt(1 - w * w)
  const axis: Vec3 = s < 1e-6 ? [0, 0, 1] : [q.x / s, q.y / s, q.z / s]
  return { kind: 'rotate', axis, deg: 2 * Math.acos(w) * DEG }
}

/**
 * Move, rotate and scale handles on what's selected (the toolbox picks which;
 * modalTransform.ts says what moving them does). They hold an invisible
 * stand-in at the selection's middle and report how far it has gone, so a part
 * moves as a whole and a layer's plane moves, exactly as G / R / S move them.
 * The orbit controls step aside while it drags (drei hands that off through
 * makeDefault on the orbit controls).
 */
export function TransformGizmo({ pivot, mode, onStart, onMove, onEnd }: { pivot: Vec3; mode: GizmoMode; onStart: () => void; onMove: (move: Move) => void; onEnd: () => void }) {
  const [proxy, setProxy] = useState<Group | null>(null)
  const dragging = useRef(false)
  const startPivot = useRef<Vec3>(pivot)
  const latest = useRef(pivot)
  latest.current = pivot
  // Between drags the stand-in waits at the selection's middle, unturned.
  useEffect(() => {
    if (!proxy || dragging.current) return
    proxy.position.set(...pivot)
    proxy.rotation.set(0, 0, 0)
    proxy.scale.set(1, 1, 1)
  }, [proxy, pivot, mode])
  return (
    <>
      <group ref={setProxy} />
      {proxy && (
        <TransformControls
          object={proxy}
          mode={mode}
          size={0.8}
          // Turning in 15° steps reads cleanly; hold nothing to stay free in translate.
          rotationSnap={mode === 'rotate' ? Math.PI / 12 : null}
          onMouseDown={() => {
            dragging.current = true
            startPivot.current = [proxy.position.x, proxy.position.y, proxy.position.z]
            onStart()
          }}
          onObjectChange={() => dragging.current && onMove(moveOfProxy(proxy, startPivot.current, mode))}
          onMouseUp={() => {
            dragging.current = false
            onEnd()
            // Ready for the next drag, from wherever the selection now is.
            proxy.position.set(...latest.current)
            proxy.rotation.set(0, 0, 0)
            proxy.scale.set(1, 1, 1)
          }}
        />
      )}
    </>
  )
}
