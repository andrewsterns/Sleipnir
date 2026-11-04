// The board in 3D. Every layer stands on its plane (its `space`, or the front
// plane where the 2D board shows it), drawn from the same outline the board
// draws — flat, or as the solid its modifier makes. The 2D board is this scene
// seen by the Front camera (document/frontView.ts); switching between them
// converts nothing.
//
// Loaded on demand (CanvasView lazy-imports this file), so three.js only
// reaches the app when someone opens a board in 3D.

import { Suspense, useCallback, useEffect, useMemo, useState, type ElementRef } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { Edges, GizmoHelper, GizmoViewport, Grid, OrbitControls, OrthographicCamera, PerspectiveCamera } from '@react-three/drei'
import {
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  FrontSide,
  MOUSE,
  type Group,
  type OrthographicCamera as OrthographicCameraImpl,
  type PerspectiveCamera as PerspectiveCameraImpl,
} from 'three'
import type { CanvasDoc, CanvasNode, CanvasRect, NodeId } from '../../document/types'
import type { Mesh } from '../geometry/mesh'
import { placementOf } from '../../document/placement'
import { PX_PER_METER, type Vec3 } from '../../document/sceneTypes'
import { cameraFor, type Bounds, type ViewName } from './cameraViews'
import { CLICK_DRAG_THRESHOLD } from '../../utils/pointer'
import { TransformGizmo } from './TransformGizmo'
import { applyWheelMove, unitsPerPixel, wheelMove, type WheelCamera } from './viewportControls'
import { useViewport3DViewModel, type GizmoMode, type Viewport3DProps } from './Viewport3D.ViewModel'
import { layerMesh, resolveCssColor, surfaceOf, sweptMesh } from '../scene3d/sceneMeshes'
import { solidOf } from '../../document/objects'

const UI_FONT: React.CSSProperties = { fontFamily: 'var(--font-ui)' }
const RAD = Math.PI / 180
// How far in front of its parent each child sits, in px — enough to never
// z-fight on a flat design, too little to read as depth.
const LAYER_GAP = 0.5
const SELECTED = '#5b9dff'

const toRadians = ([x, y, z]: Vec3): Vec3 => [x * RAD, y * RAD, z * RAD]

interface SceneContext {
  doc: CanvasDoc
  sweeps: Map<NodeId, CanvasNode[]>
  selected: ReadonlySet<NodeId>
  onSelect: (id: NodeId, additive: boolean) => void
  rectOf?: (id: NodeId) => CanvasRect | null
  /** Set while picking a face: a click reports the triangle rather than selecting; true when it picked one. */
  pickFace?: (layerId: NodeId, triangle: number) => boolean
}

export default function Viewport3D(props: Viewport3DProps) {
  const vm = useViewport3DViewModel(props)
  const { doc, onSelect, onPlacementChange, rectOf, pickingFace, onPickFace, onCancelPick } = props
  // The placed group of each top-level layer, for the gizmo to hold.
  const [objects, setObjects] = useState<Map<NodeId, Group>>(new Map())
  const register = useCallback((id: NodeId, group: Group | null) => {
    setObjects((prev) => {
      if ((prev.get(id) ?? null) === group) return prev
      const next = new Map(prev)
      if (group) next.set(id, group)
      else next.delete(id)
      return next
    })
  }, [])
  const ctx: SceneContext = useMemo(
    () => ({ doc, sweeps: vm.sweeps, selected: vm.selected, onSelect: (id, additive) => onSelect(id, additive), rectOf, pickFace: pickingFace ? onPickFace : undefined }),
    [doc, vm.sweeps, vm.selected, onSelect, rectOf, pickingFace, onPickFace],
  )
  const theme = useMemo(() => ({ background: resolveCssColor('var(--bg-1)'), grid: resolveCssColor('var(--border-2)'), section: resolveCssColor('var(--text-3)') }), [])
  const target = vm.gizmoTarget ? objects.get(vm.gizmoTarget) : undefined

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', minWidth: 0 }}>
      <Canvas dpr={[1, 2]} onPointerMissed={() => onSelect(null, false)}>
        <color attach="background" args={[theme.background]} />
        <hemisphereLight args={['#ffffff', '#3a3a40', 0.8]} />
        <directionalLight position={[5, 10, 7]} intensity={1.6} />
        <directionalLight position={[-6, 4, -5]} intensity={0.45} />
        <CameraRig key={`${vm.view}:${vm.framing}`} view={vm.view} bounds={vm.bounds} />
        <ViewGrid view={vm.view} bounds={vm.bounds} cell={theme.grid} section={theme.section} />
        <Suspense fallback={null}>
          {doc.nodes.map((node) => (node.hidden ? null : <TopLevel key={node.id} node={node} ctx={ctx} register={register} />))}
        </Suspense>
        {target && vm.gizmoTarget && !pickingFace && <TransformGizmo object={target} mode={vm.mode} onChange={(p) => onPlacementChange(vm.gizmoTarget!, p)} />}
        <GizmoHelper alignment="bottom-right" margin={[64, 64]}>
          <GizmoViewport axisColors={['#e5484d', '#46a758', '#3987e5']} labelColor="#ffffff" />
        </GizmoHelper>
      </Canvas>
      <Toolbar vm={vm} />
      {pickingFace && <PickFaceHint onCancel={onCancelPick} />}
    </div>
  )
}

// ── Camera and grid ────────────────────────────────────────────────────────

type OrbitHandle = ElementRef<typeof OrbitControls>

function CameraRig({ view, bounds }: { view: ViewName; bounds: Bounds | null }) {
  const size = useThree((s) => s.size)
  // Framed once, when the view is chosen (or FIT pressed) — later edits don't yank the camera.
  const [setup] = useState(() => cameraFor(view, bounds, { w: size.width, h: size.height }))
  const [orbit, setOrbit] = useState<OrbitHandle | null>(null)
  return (
    <>
      {view === 'perspective' ? (
        <PerspectiveCamera makeDefault position={setup.position} fov={45} near={0.01} far={2000} />
      ) : (
        <OrthographicCamera makeDefault position={setup.position} up={setup.up} zoom={setup.zoom} near={0.01} far={4000} />
      )}
      {/* The drafting views look straight at their plane, as the 2D board does, so only perspective orbits. */}
      <OrbitControls ref={setOrbit} makeDefault target={setup.target} enableRotate={view === 'perspective'} enableZoom={false} screenSpacePanning />
      {orbit && <BoardGestures orbit={orbit} />}
    </>
  )
}

// Bounds an orthographic zoom (px per meter) and a perspective camera's reach.
const MIN_ORTHO_ZOOM = 2
const MAX_ORTHO_ZOOM = 50_000
const MIN_DISTANCE = 0.05
const MAX_DISTANCE = 1500

const isTypingTarget = (target: EventTarget | null) => {
  const el = target as HTMLElement | null
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
}

/**
 * The 2D board's gestures on the 3D camera (see viewportControls.ts): a left
 * click selects, a left or right drag orbits, middle-drag or Space+left-drag
 * pans, scroll pans along the screen and Ctrl/Cmd+scroll zooms toward the
 * cursor. The gizmo's handles take a left drag before the orbit does.
 */
function BoardGestures({ orbit }: { orbit: OrbitHandle }) {
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)
  useEffect(() => {
    const el = gl.domElement
    const buttons = (spaceHeld: boolean) => {
      orbit.mouseButtons = { LEFT: spaceHeld ? MOUSE.PAN : MOUSE.ROTATE, MIDDLE: MOUSE.PAN, RIGHT: MOUSE.ROTATE }
      el.style.cursor = spaceHeld ? 'grab' : ''
    }
    buttons(false)

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const orthographic = (camera as OrthographicCameraImpl).isOrthographicCamera === true
      const distance = camera.position.distanceTo(orbit.target)
      camera.updateMatrixWorld()
      const m = camera.matrixWorld.elements
      const wheelCamera: WheelCamera = {
        position: camera.position.toArray() as Vec3,
        target: orbit.target.toArray() as Vec3,
        right: [m[0], m[1], m[2]],
        up: [m[4], m[5], m[6]],
        unitsPerPx: unitsPerPixel({ orthographic, zoom: camera.zoom, fov: (camera as PerspectiveCameraImpl).fov ?? 45, distance }, rect.height),
      }
      // Line- and page-mode wheels (some mice) report in lines, not pixels.
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? rect.height : 1
      const move = wheelMove(wheelCamera, {
        deltaX: e.deltaX * unit,
        deltaY: e.deltaY * unit,
        shiftKey: e.shiftKey,
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
        cursor: { x: e.clientX - rect.left - rect.width / 2, y: e.clientY - rect.top - rect.height / 2 },
      })
      const next = applyWheelMove({ ...wheelCamera, orthographic, zoom: camera.zoom }, move)
      if (move.kind === 'zoom') {
        const reach = orthographic ? next.zoom : distance / move.factor
        if (orthographic ? reach < MIN_ORTHO_ZOOM || reach > MAX_ORTHO_ZOOM : reach < MIN_DISTANCE || reach > MAX_DISTANCE) return
      }
      camera.position.fromArray(next.position)
      orbit.target.fromArray(next.target)
      if (orthographic && next.zoom !== camera.zoom) {
        camera.zoom = next.zoom
        camera.updateProjectionMatrix()
      }
      orbit.update()
    }
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat && !isTypingTarget(e.target)) buttons(true)
    }
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') buttons(false)
    }
    const blur = () => buttons(false)
    el.addEventListener('wheel', onWheel, { passive: false })
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    return () => {
      el.removeEventListener('wheel', onWheel)
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', blur)
      el.style.cursor = ''
    }
  }, [camera, gl, orbit])
  return null
}

// The grid lies in the plane each view looks at: the ground for perspective
// and Top, the front plane for Front, the side plane for Side.
function ViewGrid({ view, bounds, cell, section }: { view: ViewName; bounds: Bounds | null; cell: string; section: string }) {
  const floor = bounds?.min[1] ?? 0
  const placement: { position: Vec3; rotation: Vec3 } =
    view === 'front'
      ? { position: [0, 0, (bounds?.min[2] ?? 0) - 0.01], rotation: [Math.PI / 2, 0, 0] }
      : view === 'side'
        ? { position: [(bounds?.min[0] ?? 0) - 0.01, 0, 0], rotation: [0, 0, Math.PI / 2] }
        : { position: [0, Math.min(0, floor) - 0.001, 0], rotation: [0, 0, 0] }
  return (
    <Grid
      position={placement.position}
      rotation={placement.rotation}
      infiniteGrid
      cellSize={0.1}
      sectionSize={1}
      cellColor={cell}
      sectionColor={section}
      cellThickness={0.6}
      sectionThickness={1}
      fadeDistance={60}
    />
  )
}

// ── Layers ─────────────────────────────────────────────────────────────────

function TopLevel({ node, ctx, register }: { node: CanvasNode; ctx: SceneContext; register: (id: NodeId, g: Group | null) => void }) {
  const placement = placementOf(node)
  const ref = useCallback((g: Group | null) => register(node.id, g), [node.id, register])
  return (
    <group ref={ref} position={placement.position} rotation={toRadians(placement.rotation)} scale={placement.scale ?? [1, 1, 1]}>
      {/* The plane's own space: px, y up, its origin at the layer's top-left. */}
      <group scale={1 / PX_PER_METER}>
        <LayerTree node={node} ctx={ctx} size={ctx.rectOf?.(node.id) ?? node.rect} />
      </group>
    </group>
  )
}

function LayerTree({ node, ctx, size }: { node: CanvasNode; ctx: SceneContext; size: { w: number; h: number } }) {
  const { w, h } = size
  const turn = -(node.style.rotate ?? 0) * RAD
  const own = ctx.rectOf?.(node.id) ?? null
  return (
    // A 2D rotation turns the layer about its own center, clockwise on screen.
    <group position={[w / 2, -h / 2, 0]} rotation={[0, 0, turn]}>
      <group position={[-w / 2, h / 2, 0]}>
        <LayerMesh node={node} ctx={ctx} size={size} />
        {(ctx.sweeps.get(node.id) ?? []).map((profile) => (
          <SweepMesh key={profile.id} profile={profile} path={node} ctx={ctx} />
        ))}
        {node.kind === 'frame' &&
          node.children.map((child, i) => {
            if (child.hidden) return null
            const measured = ctx.rectOf?.(child.id) ?? null
            // Where the child sits in its parent's plane: as the board measured it, or its own rect.
            const x = measured && own ? measured.x - own.x : child.rect.x
            const y = measured && own ? measured.y - own.y : child.rect.y
            const z = (i + 1) * LAYER_GAP
            const inner = <LayerTree node={child} ctx={ctx} size={measured ?? child.rect} />
            // A child with its own placement stands off its parent's plane.
            return child.space ? (
              <group key={child.id} position={child.space.position.map((m) => m * PX_PER_METER) as Vec3} rotation={toRadians(child.space.rotation)}>
                {inner}
              </group>
            ) : (
              <group key={child.id} position={[x, -y, z]}>
                {inner}
              </group>
            )
          })}
      </group>
    </group>
  )
}

function LayerMesh({ node, ctx, size }: { node: CanvasNode; ctx: SceneContext; size: { w: number; h: number } }) {
  const mesh = layerMesh(node, ctx.doc, size)
  const solid = !!solidOf(ctx.doc, node.id)
  const surface = surfaceOf(node, solid)
  if (!mesh || !surface || !mesh.indices.length) return null
  return <MeshView mesh={mesh} css={surface.css} opacity={surface.opacity} solid={solid} selected={ctx.selected.has(node.id)} onSelect={(additive) => ctx.onSelect(node.id, additive)} onPick={ctx.pickFace && ((t) => ctx.pickFace!(node.id, t))} />
}

function SweepMesh({ profile, path, ctx }: { profile: CanvasNode; path: CanvasNode; ctx: SceneContext }) {
  const mesh = useMemo(() => sweptMesh(profile, path), [profile, path])
  const surface = surfaceOf(profile, true)
  if (!mesh || !surface || !mesh.indices.length) return null
  return <MeshView mesh={mesh} css={surface.css} opacity={surface.opacity} solid selected={ctx.selected.has(profile.id)} onSelect={(additive) => ctx.onSelect(profile.id, additive)} onPick={ctx.pickFace && ((t) => ctx.pickFace!(profile.id, t))} />
}

function MeshView({
  mesh,
  css,
  opacity,
  solid,
  selected,
  onSelect,
  onPick,
}: {
  mesh: Mesh
  css: string
  opacity: number
  solid: boolean
  selected: boolean
  onSelect: (additive: boolean) => void
  /** While picking a face: which triangle the click hit. True when it was a face to pick. */
  onPick?: (triangle: number) => boolean
}) {
  const geometry = useMemo(() => {
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute(mesh.positions, 3))
    g.setAttribute('normal', new Float32BufferAttribute(mesh.normals, 3))
    g.setAttribute('uv', new Float32BufferAttribute(mesh.uvs, 2))
    g.setIndex(mesh.indices)
    g.computeBoundingSphere()
    return g
  }, [mesh])
  useEffect(() => () => geometry.dispose(), [geometry])
  const color = useMemo(() => resolveCssColor(css), [css])
  return (
    <mesh
      geometry={geometry}
      onClick={(e) => {
        // A click selects; the end of an orbit or a pan over the mesh doesn't.
        if (e.delta > CLICK_DRAG_THRESHOLD) {
          e.stopPropagation()
          return
        }
        // Picking a face: a flat layer in the way lets the click through to the solid behind it.
        if (onPick) {
          if (e.faceIndex != null && onPick(e.faceIndex)) e.stopPropagation()
          return
        }
        e.stopPropagation()
        onSelect(e.nativeEvent.shiftKey)
      }}
    >
      <meshStandardMaterial color={color} transparent={opacity < 1} opacity={opacity} side={solid ? FrontSide : DoubleSide} roughness={0.55} metalness={0.05} />
      {selected && <Edges threshold={20} color={SELECTED} />}
    </mesh>
  )
}

// ── Picking a face ─────────────────────────────────────────────────────────

function PickFaceHint({ onCancel }: { onCancel?: () => void }) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel?.()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [onCancel])
  return (
    <div
      data-viewport-pick-face=""
      style={{
        position: 'absolute',
        top: 10,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '5px 6px 5px 12px',
        background: 'var(--bg-1)',
        border: '1px solid var(--border-2)',
        borderRadius: 'var(--radius-control)',
        ...UI_FONT,
        fontSize: 11,
        color: 'var(--text-2)',
        whiteSpace: 'nowrap',
      }}
    >
      <span>Click a face of an object to sketch on it</span>
      <button
        type="button"
        onClick={onCancel}
        title="Stop picking (Esc)"
        style={{ ...UI_FONT, fontSize: 11, color: 'var(--text-1)', background: 'rgba(var(--item-ink, 255,255,255), 0.08)', border: 'none', borderRadius: 'var(--radius-control)', padding: '3px 8px', cursor: 'pointer' }}
      >
        Cancel
      </button>
    </div>
  )
}

// ── Toolbar ────────────────────────────────────────────────────────────────

const VIEWS: { id: ViewName; label: string }[] = [
  { id: 'perspective', label: 'Persp' },
  { id: 'front', label: 'Front' },
  { id: 'top', label: 'Top' },
  { id: 'side', label: 'Side' },
]
const MODES: { id: GizmoMode; label: string }[] = [
  { id: 'translate', label: 'Move' },
  { id: 'rotate', label: 'Rotate' },
  { id: 'scale', label: 'Scale' },
]

function Toolbar({ vm }: { vm: ReturnType<typeof useViewport3DViewModel> }) {
  const segment = (active: boolean): React.CSSProperties => ({
    ...UI_FONT,
    fontSize: 10,
    letterSpacing: '0.04em',
    padding: '4px 8px',
    border: 'none',
    cursor: 'pointer',
    background: active ? 'rgba(var(--item-ink, 255,255,255), 0.14)' : 'transparent',
    color: active ? 'var(--text-1)' : 'var(--text-3)',
  })
  const group: React.CSSProperties = { display: 'flex', border: '1px solid var(--border-2)', borderRadius: 'var(--radius-control)', overflow: 'hidden', background: 'var(--bg-1)' }
  return (
    <div style={{ position: 'absolute', top: 10, left: 10, display: 'flex', gap: 8, alignItems: 'center', pointerEvents: 'none' }}>
      <div style={{ ...group, pointerEvents: 'auto' }}>
        {VIEWS.map((v) => (
          <button key={v.id} type="button" aria-pressed={vm.view === v.id} style={segment(vm.view === v.id)} onClick={() => vm.chooseView(v.id)}>
            {v.label}
          </button>
        ))}
      </div>
      <div style={{ ...group, pointerEvents: 'auto' }}>
        {MODES.map((m) => (
          <button key={m.id} type="button" aria-pressed={vm.mode === m.id} style={segment(vm.mode === m.id)} onClick={() => vm.setMode(m.id)} title="Handles on the selected top-level layer">
            {m.label}
          </button>
        ))}
      </div>
      <button type="button" style={{ ...segment(false), ...group, pointerEvents: 'auto' }} onClick={vm.fit} title="Frame the whole scene">
        Fit
      </button>
      <span style={{ ...UI_FONT, fontSize: 10, letterSpacing: '0.04em', color: 'var(--text-3)' }}>{vm.triangles.toLocaleString()} Tris</span>
    </div>
  )
}
