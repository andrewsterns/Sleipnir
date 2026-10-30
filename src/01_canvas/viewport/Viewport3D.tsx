// The board in 3D. Every layer stands on its plane (its `space`, or the front
// plane where the 2D board shows it), drawn from the same outline the board
// draws — flat, or as the solid its modifier makes. The 2D board is this scene
// seen straight-on in one plane; switching between them converts nothing.
//
// Loaded on demand (CanvasView lazy-imports this file), so three.js only
// reaches the app when someone opens a board in 3D.

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { Edges, GizmoHelper, GizmoViewport, Grid, OrbitControls, OrthographicCamera, PerspectiveCamera } from '@react-three/drei'
import { BufferGeometry, DoubleSide, Float32BufferAttribute, FrontSide, type Group } from 'three'
import type { CanvasDoc, CanvasNode, CanvasRect, NodeId } from '../model/types'
import type { Mesh } from '../geometry/mesh'
import { placementOf } from '../scene3d/placement'
import { PX_PER_METER, type Vec3 } from '../scene3d/sceneTypes'
import { cameraFor, type Bounds, type ViewName } from './cameraViews'
import { TransformGizmo } from './TransformGizmo'
import { layerMesh, resolveCssColor, surfaceOf, sweptMesh, useViewport3DViewModel, type GizmoMode, type Viewport3DProps } from './Viewport3D.ViewModel'

const MONO: React.CSSProperties = { fontFamily: 'var(--font-mono)' }
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
}

export default function Viewport3D(props: Viewport3DProps) {
  const vm = useViewport3DViewModel(props)
  const { doc, onSelect, onPlacementChange, rectOf } = props
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
    () => ({ doc, sweeps: vm.sweeps, selected: vm.selected, onSelect: (id, additive) => onSelect(id, additive), rectOf }),
    [doc, vm.sweeps, vm.selected, onSelect, rectOf],
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
        {target && vm.gizmoTarget && <TransformGizmo object={target} mode={vm.mode} onChange={(p) => onPlacementChange(vm.gizmoTarget!, p)} />}
        <GizmoHelper alignment="bottom-right" margin={[64, 64]}>
          <GizmoViewport axisColors={['#e5484d', '#46a758', '#3987e5']} labelColor="#ffffff" />
        </GizmoHelper>
      </Canvas>
      <Toolbar vm={vm} />
    </div>
  )
}

// ── Camera and grid ────────────────────────────────────────────────────────

function CameraRig({ view, bounds }: { view: ViewName; bounds: Bounds | null }) {
  const size = useThree((s) => s.size)
  // Framed once, when the view is chosen (or FIT pressed) — later edits don't yank the camera.
  const [setup] = useState(() => cameraFor(view, bounds, { w: size.width, h: size.height }))
  return (
    <>
      {view === 'perspective' ? (
        <PerspectiveCamera makeDefault position={setup.position} fov={45} near={0.01} far={2000} />
      ) : (
        <OrthographicCamera makeDefault position={setup.position} up={setup.up} zoom={setup.zoom} near={0.01} far={4000} />
      )}
      <OrbitControls makeDefault target={setup.target} enableRotate={view === 'perspective'} screenSpacePanning />
    </>
  )
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
  const surface = surfaceOf(node)
  if (!mesh || !surface || !mesh.indices.length) return null
  return <MeshView mesh={mesh} css={surface.css} opacity={surface.opacity} solid={!!node.solid} selected={ctx.selected.has(node.id)} onSelect={(additive) => ctx.onSelect(node.id, additive)} />
}

function SweepMesh({ profile, path, ctx }: { profile: CanvasNode; path: CanvasNode; ctx: SceneContext }) {
  const mesh = useMemo(() => sweptMesh(profile, path), [profile, path])
  const surface = surfaceOf(profile)
  if (!mesh || !surface || !mesh.indices.length) return null
  return <MeshView mesh={mesh} css={surface.css} opacity={surface.opacity} solid selected={ctx.selected.has(profile.id)} onSelect={(additive) => ctx.onSelect(profile.id, additive)} />
}

function MeshView({ mesh, css, opacity, solid, selected, onSelect }: { mesh: Mesh; css: string; opacity: number; solid: boolean; selected: boolean; onSelect: (additive: boolean) => void }) {
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
        e.stopPropagation()
        onSelect(e.nativeEvent.shiftKey)
      }}
    >
      <meshStandardMaterial color={color} transparent={opacity < 1} opacity={opacity} side={solid ? FrontSide : DoubleSide} roughness={0.55} metalness={0.05} />
      {selected && <Edges threshold={20} color={SELECTED} />}
    </mesh>
  )
}

// ── Toolbar ────────────────────────────────────────────────────────────────

const VIEWS: { id: ViewName; label: string }[] = [
  { id: 'perspective', label: 'PERSP' },
  { id: 'front', label: 'FRONT' },
  { id: 'top', label: 'TOP' },
  { id: 'side', label: 'SIDE' },
]
const MODES: { id: GizmoMode; label: string }[] = [
  { id: 'translate', label: 'MOVE' },
  { id: 'rotate', label: 'ROTATE' },
  { id: 'scale', label: 'SCALE' },
]

function Toolbar({ vm }: { vm: ReturnType<typeof useViewport3DViewModel> }) {
  const segment = (active: boolean): React.CSSProperties => ({
    ...MONO,
    fontSize: 9,
    letterSpacing: '0.1em',
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
        FIT
      </button>
      <span style={{ ...MONO, fontSize: 9, letterSpacing: '0.08em', color: 'var(--text-3)' }}>{vm.triangles.toLocaleString()} TRIS</span>
    </div>
  )
}
