import { TransformControls } from '@react-three/drei'
import type { Object3D } from 'three'
import type { Placement3D, Vec3 } from '../scene3d/sceneTypes'
import type { GizmoMode } from './Viewport3D.ViewModel'

const DEG = 180 / Math.PI
const round = (n: number, places = 4) => Math.round(n * 10 ** places) / 10 ** places

/** A placed object's transform back as a placement — meters and degrees, rounded so the board file stays readable. */
export function placementOfObject(object: Object3D): Placement3D {
  const position: Vec3 = [round(object.position.x), round(object.position.y), round(object.position.z)]
  const rotation: Vec3 = [round(object.rotation.x * DEG, 2), round(object.rotation.y * DEG, 2), round(object.rotation.z * DEG, 2)]
  const s: Vec3 = [round(object.scale.x), round(object.scale.y), round(object.scale.z)]
  return s.every((v) => v === 1) ? { position, rotation } : { position, rotation, scale: s }
}

/**
 * Move, rotate and scale handles on a top-level layer's plane. Writes the new
 * placement back as it changes; the orbit controls step aside while it drags
 * (drei hands that off through makeDefault on the orbit controls).
 */
export function TransformGizmo({ object, mode, onChange }: { object: Object3D; mode: GizmoMode; onChange: (placement: Placement3D) => void }) {
  return (
    <TransformControls
      object={object}
      mode={mode}
      size={0.8}
      // Turning in 15° steps reads cleanly; hold nothing to stay free in translate.
      rotationSnap={mode === 'rotate' ? Math.PI / 12 : null}
      onObjectChange={() => onChange(placementOfObject(object))}
    />
  )
}
