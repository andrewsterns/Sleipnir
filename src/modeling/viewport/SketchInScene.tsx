// Sketch mode inside an environment (src/canvas/LAYOUT.md): the 3D view keeps
// showing the scene, turned to face the open sketch's plane with no
// perspective, while the live 2D board is laid over it — so Figma's tools draw
// on the plane with the parts behind. The board's pan and zoom drive this
// camera (cameraViews.ts sketchCameraPose); it has no controls of its own.

import { useLayoutEffect, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import { OrthographicCamera } from '@react-three/drei'
import type { OrthographicCamera as OrthographicCameraImpl } from 'three'
import { sketchCameraPose, type SketchView } from './cameraViews'

export type { SketchView } from './cameraViews'

export function SketchCamera({ view }: { view: SketchView }) {
  const size = useThree((s) => s.size)
  const invalidate = useThree((s) => s.invalidate)
  const ref = useRef<OrthographicCameraImpl>(null)
  useLayoutEffect(() => {
    const camera = ref.current
    if (!camera) return
    const pose = sketchCameraPose(view, { w: size.width, h: size.height })
    camera.position.set(...pose.position)
    camera.up.set(...pose.up)
    camera.zoom = pose.zoom
    camera.lookAt(...pose.target)
    camera.updateProjectionMatrix()
    invalidate()
  }, [view, size.width, size.height, invalidate])
  return <OrthographicCamera ref={ref} makeDefault near={0.01} far={4000} />
}
