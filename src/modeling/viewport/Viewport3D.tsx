// An environment in 3D (src/canvas/LAYOUT.md). Every layer stands on its plane
// (its `space`, or the Front plane), drawn from the same outline the board
// draws — flat, or as the solid its features make, carried by its part's own
// placement. The 2D board only shows an environment in sketch mode, laid over
// this view (SketchInScene.tsx).
//
// Loaded on demand (CanvasView lazy-imports this file), so three.js only
// reaches the app when someone opens an environment.

import { Suspense, useEffect, useMemo, useRef, useState, type ElementRef } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { Edges, GizmoHelper, Grid, Line, OrbitControls, OrthographicCamera, PerspectiveCamera } from '@react-three/drei'
import {
  CanvasTexture,
  Matrix4,
  Raycaster,
  Vector2,
  Vector3,
  type Camera as CameraImpl,
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  FrontSide,
  MOUSE,
  type OrthographicCamera as OrthographicCameraImpl,
  type PerspectiveCamera as PerspectiveCameraImpl,
} from 'three'
import type { CanvasDoc, CanvasNode, CanvasRect, NodeId } from '../../document/types'
import type { Mesh } from '../geometry/mesh'
import { placementOf } from '../../document/placement'
import { PX_PER_METER, type Vec3 } from '../../document/sceneTypes'
import { cameraFor, planeOfView, viewOfAxis, type Bounds, type DisplayMode, type ViewName } from './cameraViews'
import { CLICK_DRAG_THRESHOLD } from '../../utils/pointer'
import { TransformGizmo } from './TransformGizmo'
import { SketchCamera } from './SketchInScene'
import { bodiesOf, partMeshMatrix, type Body } from '../geometry/body'
import { boxSelect, elementKey, elementOfLayerHit, sameElement, type ElementKind, type ElementRef as PickRef } from './selectionModes'
import { applyWheelMove, unitsPerPixel, wheelMove, type WheelCamera } from './viewportControls'
import { useViewport3DViewModel, type Viewport3DProps } from './Viewport3D.ViewModel'
import { layerMesh, resolveCssColor, surfaceOf, sweepTolerance, sweptMesh } from '../scene3d/sceneMeshes'
import { partPlacementOf, solidOf } from '../../document/objects'
import type { Placement3D } from '../../document/sceneTypes'
import { applyMove, describeMove, elementsAfter, modalKey, modalTargetOf, moveOf, pivotOf, pushNormalOf, startModal, type Modal, type ModalKind, type ModalTarget, type Move, type ScreenView } from './modalTransform'

const UI_FONT: React.CSSProperties = { fontFamily: 'var(--font-ui)' }
const RAD = Math.PI / 180
// How far in front of its parent each child sits, in px — enough to never
// z-fight on a flat design, too little to read as depth.
const LAYER_GAP = 0.5
const SELECTED = '#5b9dff'
// The polygon outlines: quiet ink over a shaded part, and light lines through a see-through one.
const EDGE = '#111114'
const XRAY_EDGE = '#c8c8cc'

const toRadians = ([x, y, z]: Vec3): Vec3 => [x * RAD, y * RAD, z * RAD]

interface SceneContext {
  doc: CanvasDoc
  sweeps: Map<NodeId, CanvasNode[]>
  selected: ReadonlySet<NodeId>
  onSelect: (id: NodeId, additive: boolean) => void
  rectOf?: (id: NodeId) => CanvasRect | null
  /** Set while picking a face: a click reports the triangle rather than selecting; true when it picked one. */
  pickFace?: (layerId: NodeId, triangle: number) => boolean
  /** How parts are drawn (cameraViews.ts DisplayMode). */
  display: DisplayMode
  /** Edit mode: a click (or hover) on a layer's mesh reports the element under it instead of selecting the layer. */
  edit?: { kind: ElementKind; pick: (layerId: NodeId, triangle: number, hit: Vec3, additive: boolean) => void; hover: (layerId: NodeId | null, triangle: number, hit: Vec3) => void }
}

export default function Viewport3D(props: Viewport3DProps) {
  const vm = useViewport3DViewModel(props)
  const { doc, onSelect, rectOf, pickingFace, onPickFace, onCancelPick } = props
  // ── Edit mode: the parts' bodies, what's under the cursor, B's box ──
  const editKind: ElementKind | null = props.selectMode && props.selectMode !== 'object' && !props.sketchView ? props.selectMode : null
  const bodies = useMemo(() => (editKind ? bodiesOf(doc) : null), [doc, editKind])
  const [hovered, setHovered] = useState<PickRef | null>(null)
  const cameraTap = useRef<{ camera: CameraImpl; w: number; h: number } | null>(null)
  const [boxing, setBoxing] = useState(false)
  useEffect(() => {
    if (!editKind) {
      setHovered(null)
      setBoxing(false)
      return
    }
    const key = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return
      if ((e.key === 'b' || e.key === 'B') && !e.ctrlKey && !e.metaKey) setBoxing(true)
      if (e.key === 'Escape') setBoxing(false)
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [editKind])
  const onPickElement = props.onPickElement
  const edit = useMemo(
    () =>
      editKind && bodies
        ? {
            kind: editKind,
            pick: (layerId: NodeId, triangle: number, hit: Vec3, additive: boolean) => onPickElement?.(elementOfLayerHit(doc, bodies, layerId, triangle, hit, editKind), additive),
            hover: (layerId: NodeId | null, triangle: number, hit: Vec3) => {
              const next = layerId ? elementOfLayerHit(doc, bodies, layerId, triangle, hit, editKind) : null
              setHovered((prev) => (sameElement(prev, next) || (!prev && !next) ? prev : next))
            },
          }
        : undefined,
    [editKind, bodies, doc, onPickElement],
  )
  // ── G / R / S and the handles (modalTransform.ts): one live move, previewed through onModal ──
  const containerRef = useRef<HTMLDivElement>(null)
  const pointer = useRef<{ x: number; y: number; ctrl: boolean } | null>(null)
  const live = useRef<{ modal: Modal; target: ModalTarget; start: CanvasDoc; last: CanvasDoc; picked?: PickRef[]; waiting?: boolean } | null>(null)
  // Starts E from the toolbox, whose button is far from the part: the move measures from wherever the pointer next is.
  const beginModal = useRef<((kind: ModalKind, anchored: boolean) => boolean) | null>(null)
  const [hud, setHud] = useState<string | null>(null)
  const latest = useRef({ doc, selectedIds: props.selectedIds, selectMode: props.selectMode ?? 'object', elements: props.elements ?? [], onModal: props.onModal })
  latest.current = { doc, selectedIds: props.selectedIds, selectMode: props.selectMode ?? 'object', elements: props.elements ?? [], onModal: props.onModal }
  const modalOn = !!props.onModal && !props.sketchView && !pickingFace
  useEffect(() => {
    if (!modalOn) return
    const viewNow = (): ScreenView | null => (cameraTap.current ? screenViewOf(cameraTap.current) : null)
    const show = (modal: Modal) => {
      const run = live.current
      const view = viewNow()
      if (!run || !view) return
      const at = pointer.current ?? modal.start
      const move = moveOf(modal, at, view, !!pointer.current?.ctrl)
      const result = applyMove(run.start, run.target, move, modal.pivot)
      live.current = { ...run, modal, last: result.doc, picked: result.elements }
      latest.current.onModal?.preview(result.doc)
      setHud(result.blocked ? result.said : describeMove(modal, move))
    }
    const finish = (keep: boolean) => {
      const run = live.current
      live.current = null
      setHud(null)
      if (!run) return
      const picked = keep && run.target.kind === 'elements' ? (run.picked ?? elementsAfter(run.start, run.last, run.target.elements)) : undefined
      latest.current.onModal?.end(keep, picked)
    }
    const begin = (kind: ModalKind, anchored: boolean): boolean => {
      const { doc: now, selectedIds, selectMode, elements } = latest.current
      const target = modalTargetOf(now, selectedIds, selectMode, elements)
      const pivot = target && pivotOf(now, target)
      if (!target || !pivot) return false
      const normal = pushNormalOf(now, target)
      if (kind === 'extrude' && !normal) {
        setHud('That face isn’t flat enough to extrude')
        window.setTimeout(() => setHud((h) => (live.current ? h : null)), 2000)
        return true
      }
      const box = containerRef.current?.getBoundingClientRect()
      const at = pointer.current ?? { x: (box?.width ?? 0) / 2, y: (box?.height ?? 0) / 2, ctrl: false }
      live.current = { modal: startModal(kind, pivot, { x: at.x, y: at.y }, normal), target, start: now, last: now, waiting: !anchored }
      show(live.current.modal)
      return true
    }
    beginModal.current = begin
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return
      const run = live.current
      if (!run) {
        const key = e.key.toLowerCase()
        if (e.ctrlKey || e.metaKey || e.altKey || (key !== 'g' && key !== 'r' && key !== 's' && key !== 'e')) return
        // E grows one picked face; it means nothing without one.
        if (key === 'e' && !(latest.current.selectMode === 'face' && latest.current.elements.length === 1)) return
        const kind: ModalKind = key === 'g' ? 'grab' : key === 'r' ? 'rotate' : key === 's' ? 'scale' : 'extrude'
        if (begin(kind, true)) {
          e.preventDefault()
          e.stopImmediatePropagation()
        }
        return
      }
      // While moving, every key is the move's: nothing else hears it.
      e.preventDefault()
      e.stopImmediatePropagation()
      const next = modalKey(run.modal, e.key)
      if (next === 'keep' || next === 'cancel') finish(next === 'keep')
      else if (next) show(next)
    }
    const onMove = (e: PointerEvent) => {
      const box = containerRef.current?.getBoundingClientRect()
      if (!box) return
      pointer.current = { x: e.clientX - box.left, y: e.clientY - box.top, ctrl: e.ctrlKey || e.metaKey }
      if (live.current?.waiting) live.current = { ...live.current, waiting: false, modal: { ...live.current.modal, start: { x: pointer.current.x, y: pointer.current.y } } }
      if (live.current) show(live.current.modal)
    }
    // The click that keeps a move is the move's: the scene mustn't also read it as a click on nothing (which deselects).
    let swallow = false
    const onDown = (e: PointerEvent) => {
      swallow = false
      if (!live.current) return
      e.preventDefault()
      e.stopPropagation()
      swallow = true
      finish(e.button !== 2)
    }
    const onUp = (e: Event) => {
      if (!swallow) return
      e.stopPropagation()
      if (e.type === 'click' || e.type === 'contextmenu') swallow = false
    }
    const onMenu = (e: MouseEvent) => {
      if (live.current || swallow) e.preventDefault()
      onUp(e)
    }
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('pointermove', onMove, true)
    window.addEventListener('pointerdown', onDown, true)
    window.addEventListener('pointerup', onUp, true)
    window.addEventListener('click', onUp, true)
    window.addEventListener('contextmenu', onMenu, true)
    return () => {
      window.removeEventListener('pointerup', onUp, true)
      window.removeEventListener('click', onUp, true)
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('pointermove', onMove, true)
      window.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('contextmenu', onMenu, true)
      // Leaving mid-move puts it back.
      if (live.current) finish(false)
      beginModal.current = null
    }
  }, [modalOn])
  // The toolbox's Extrude, with a face picked.
  const extrudeSignal = props.extrudeSignal ?? 0
  useEffect(() => {
    if (extrudeSignal) beginModal.current?.('extrude', false)
  }, [extrudeSignal])
  // The handles: what they'd move, its middle, and a drag as one move.
  const handleTarget = useMemo(
    () => (modalOn && !editKind && props.selectedIds.size ? modalTargetOf(doc, props.selectedIds, 'object', []) : null),
    [modalOn, editKind, doc, props.selectedIds],
  )
  const handlePivot = useMemo(() => (handleTarget ? pivotOf(doc, handleTarget) : null), [doc, handleTarget])
  const handleDrag = useRef<{ target: ModalTarget; start: CanvasDoc; pivot: Vec3 } | null>(null)
  const handles = {
    onStart: () => {
      if (handleTarget && handlePivot) handleDrag.current = { target: handleTarget, start: doc, pivot: handlePivot }
    },
    onMove: (move: Move) => {
      const drag = handleDrag.current
      if (drag) props.onModal?.preview(applyMove(drag.start, drag.target, move, drag.pivot).doc)
    },
    onEnd: () => {
      if (handleDrag.current) props.onModal?.end(true)
      handleDrag.current = null
    },
  }
  const ctx: SceneContext = useMemo(
    () => ({ doc, sweeps: vm.sweeps, selected: vm.selected, onSelect: (id, additive) => onSelect(id, additive), rectOf, pickFace: pickingFace ? onPickFace : undefined, display: vm.display, edit: pickingFace ? undefined : edit }),
    [doc, vm.sweeps, vm.selected, onSelect, rectOf, pickingFace, onPickFace, vm.display, edit],
  )
  const theme = useMemo(() => ({ background: resolveCssColor('var(--bg-1)'), grid: resolveCssColor('var(--border-2)'), section: resolveCssColor('var(--text-3)') }), [])

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', height: '100%', minWidth: 0 }}>
      <Canvas dpr={[1, 2]} onPointerMissed={(e) => (edit ? onPickElement?.(null, e.shiftKey) : onSelect(null, false))}>
        <CameraTap tap={cameraTap} />
        <color attach="background" args={[theme.background]} />
        <hemisphereLight args={['#ffffff', '#3a3a40', 0.8]} />
        <directionalLight position={[5, 10, 7]} intensity={1.6} />
        <directionalLight position={[-6, 4, -5]} intensity={0.45} />
        {props.sketchView ? (
          // Sketch mode: the board over this view drives the camera; the grid, gizmos and view bar are the board's to replace.
          <SketchCamera view={props.sketchView} />
        ) : (
          <>
            <CameraRig key={`${vm.view}:${vm.framing}`} view={vm.view} bounds={vm.bounds} onLeaveDrafting={() => vm.chooseView('perspective')} />
            <ViewGrid view={vm.view} bounds={vm.bounds} cell={theme.grid} section={theme.section} />
          </>
        )}
        <Suspense fallback={null}>
          {doc.nodes.map((node) => (node.hidden || node.id === props.hideId ? null : <TopLevel key={node.id} node={node} ctx={ctx} />))}
        </Suspense>
        {bodies && editKind && <EditOverlay bodies={bodies} kind={editKind} elements={props.elements ?? []} hovered={hovered} xray={vm.display === 'xray'} />}
        {handlePivot && !hud && <TransformGizmo pivot={handlePivot} mode={vm.mode} {...handles} />}
        {!props.sketchView && (
          <GizmoHelper alignment="bottom-right" margin={[64, 64]}>
            {/* The views: click an axis to look straight down it, the middle for perspective. */}
            <ViewAxes view={vm.view} onView={vm.chooseView} />
          </GizmoHelper>
        )}
      </Canvas>
      {!props.sketchView && <Toolbar vm={vm} />}
      {boxing && bodies && editKind && (
        <BoxSelect
          onDone={(box, additive) => {
            setBoxing(false)
            const tap = cameraTap.current
            if (!box || !tap) return
            const project = (p: Vec3) => {
              const v = new Vector3(...p).project(tap.camera)
              return v.z > 1 ? null : { x: ((v.x + 1) / 2) * tap.w, y: ((1 - v.y) / 2) * tap.h }
            }
            props.onBoxSelect?.(boxSelect(bodies.values(), editKind, project, box), additive)
          }}
        />
      )}
      {pickingFace && <PickFaceHint onCancel={onCancelPick} />}
      {hud && <ModalHud said={hud} />}
    </div>
  )
}

// ── Camera and grid ────────────────────────────────────────────────────────

type OrbitHandle = ElementRef<typeof OrbitControls>

function CameraRig({ view, bounds, onLeaveDrafting }: { view: ViewName; bounds: Bounds | null; onLeaveDrafting?: () => void }) {
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
      {view !== 'perspective' && onLeaveDrafting && <LeaveDraftingOnDrag onLeave={onLeaveDrafting} />}
    </>
  )
}

/** In a drafting view, an orbit drag (left or right, without Space) turns back to perspective — there's no orbiting a plan. */
function LeaveDraftingOnDrag({ onLeave }: { onLeave: () => void }) {
  const gl = useThree((s) => s.gl)
  useEffect(() => {
    const el = gl.domElement
    let start: { x: number; y: number } | null = null
    let space = false
    const keys = (e: KeyboardEvent) => {
      if (e.code === 'Space') space = e.type === 'keydown'
    }
    const down = (e: PointerEvent) => {
      start = (e.button === 0 || e.button === 2) && !space ? { x: e.clientX, y: e.clientY } : null
    }
    const move = (e: PointerEvent) => {
      if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 6) {
        start = null
        onLeave()
      }
    }
    const up = () => {
      start = null
    }
    el.addEventListener('pointerdown', down)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('keydown', keys)
    window.addEventListener('keyup', keys)
    return () => {
      el.removeEventListener('pointerdown', down)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('keydown', keys)
      window.removeEventListener('keyup', keys)
    }
  }, [gl, onLeave])
  return null
}

// The axis gizmo's colours: X red, Y green, Z blue, as everywhere in 3D.
const AXES: { axis: 'x' | 'y' | 'z'; dir: Vec3; color: string; label: string }[] = [
  { axis: 'x', dir: [1, 0, 0], color: '#e5484d', label: 'X' },
  { axis: 'y', dir: [0, 1, 0], color: '#46a758', label: 'Y' },
  { axis: 'z', dir: [0, 0, 1], color: '#3987e5', label: 'Z' },
]

/** One axis head: a round label you click to look down that axis. */
function AxisHead({ color, label, at, active, onPick }: { color: string; label?: string; at: Vec3; active: boolean; onPick: () => void }) {
  const [hover, setHover] = useState(false)
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 64
    canvas.height = 64
    const g = canvas.getContext('2d')!
    g.beginPath()
    g.arc(32, 32, 26, 0, Math.PI * 2)
    g.fillStyle = color
    g.globalAlpha = label ? 1 : 0.55
    g.fill()
    if (label) {
      g.globalAlpha = 1
      g.font = 'bold 30px Helvetica, Arial, sans-serif'
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      g.fillStyle = '#ffffff'
      g.fillText(label, 32, 34)
    }
    return new CanvasTexture(canvas)
  }, [color, label])
  useEffect(() => () => texture.dispose(), [texture])
  const scale = (hover || active ? 0.62 : 0.5) * 40
  return (
    <sprite
      position={[at[0] * 40, at[1] * 40, at[2] * 40]}
      scale={[scale, scale, scale]}
      onPointerOver={(e) => {
        e.stopPropagation()
        setHover(true)
      }}
      onPointerOut={() => setHover(false)}
      onPointerDown={(e) => {
        e.stopPropagation()
        onPick()
      }}
    >
      <spriteMaterial map={texture} toneMapped={false} alphaTest={0.3} />
    </sprite>
  )
}

/**
 * The axis gizmo as the view picker (src/canvas/LAYOUT.md: view controls):
 * each axis end looks straight down that axis with no perspective — +Z
 * Front, +Y Top, +X Side and their backs — and the middle returns to
 * perspective. Replaces a row of view buttons that said the same thing.
 */
function ViewAxes({ view, onView }: { view: ViewName; onView: (view: ViewName) => void }) {
  return (
    <group>
      {AXES.map(({ axis, dir, color }) => (
        <mesh key={axis} position={[dir[0] * 20, dir[1] * 20, dir[2] * 20]} rotation={axis === 'x' ? [0, 0, Math.PI / 2] : axis === 'z' ? [Math.PI / 2, 0, 0] : [0, 0, 0]}>
          <cylinderGeometry args={[0.9, 0.9, 40, 8]} />
          <meshBasicMaterial color={color} toneMapped={false} />
        </mesh>
      ))}
      {AXES.flatMap(({ axis, dir, color, label }) => [
        <AxisHead key={`${axis}+`} color={color} label={label} at={dir} active={view === viewOfAxis(axis, true)} onPick={() => onView(viewOfAxis(axis, true))} />,
        <AxisHead key={`${axis}-`} color={color} at={[-dir[0], -dir[1], -dir[2]]} active={view === viewOfAxis(axis, false)} onPick={() => onView(viewOfAxis(axis, false))} />,
      ])}
      {/* The middle: back to perspective. */}
      <mesh
        onPointerDown={(e) => {
          e.stopPropagation()
          onView('perspective')
        }}
      >
        <sphereGeometry args={[5, 16, 12]} />
        <meshBasicMaterial color={view === 'perspective' ? '#ffffff' : '#8a8a92'} toneMapped={false} />
      </mesh>
    </group>
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
  const plane = planeOfView(view)
  const floor = bounds?.min[1] ?? 0
  const placement: { position: Vec3; rotation: Vec3 } =
    plane === 'front'
      ? { position: [0, 0, view === 'back' ? (bounds?.max[2] ?? 0) + 0.01 : (bounds?.min[2] ?? 0) - 0.01], rotation: [Math.PI / 2, 0, 0] }
      : plane === 'side'
        ? { position: [view === 'left' ? (bounds?.max[0] ?? 0) + 0.01 : (bounds?.min[0] ?? 0) - 0.01, 0, 0], rotation: [0, 0, Math.PI / 2] }
        : { position: [0, view === 'bottom' ? (bounds?.max[1] ?? 0) + 0.001 : Math.min(0, floor) - 0.001, 0], rotation: [0, 0, 0] }
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

function TopLevel({ node, ctx }: { node: CanvasNode; ctx: SceneContext }) {
  const placement = placementOf(node)
  return (
    <group position={placement.position} rotation={toRadians(placement.rotation)} scale={placement.scale ?? [1, 1, 1]}>
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
  return (
    <PartPlaced doc={ctx.doc} node={node} part={partPlacementOf(ctx.doc, node.id)}>
      <MeshView mesh={mesh} css={surface.css} opacity={surface.opacity} solid={solid} display={ctx.display} selected={ctx.selected.has(node.id)} onSelect={(additive) => ctx.onSelect(node.id, additive)} onPick={ctx.pickFace && ((t) => ctx.pickFace!(node.id, t))} onEdit={editHooks(ctx, node.id)} />
    </PartPlaced>
  )
}

function SweepMesh({ profile, path, ctx }: { profile: CanvasNode; path: CanvasNode; ctx: SceneContext }) {
  const mesh = useMemo(() => sweptMesh(profile, path, sweepTolerance(ctx.doc, profile)), [profile, path, ctx.doc])
  const surface = surfaceOf(profile, true)
  if (!mesh || !surface || !mesh.indices.length) return null
  return (
    <PartPlaced doc={ctx.doc} node={path} part={partPlacementOf(ctx.doc, path.id)}>
      <MeshView mesh={mesh} css={surface.css} opacity={surface.opacity} solid display={ctx.display} selected={ctx.selected.has(profile.id)} onSelect={(additive) => ctx.onSelect(profile.id, additive)} onPick={ctx.pickFace && ((t) => ctx.pickFace!(profile.id, t))} onEdit={editHooks(ctx, profile.id)} />
    </PartPlaced>
  )
}

/** A layer's mesh stood where its part's own placement moved it (geometry/body.ts partMeshMatrix) — its sketch stays on its plane. */
function PartPlaced({ doc, node, part, children }: { doc: CanvasDoc; node: CanvasNode; part: Placement3D | null; children: React.ReactNode }) {
  const matrix = useMemo(() => {
    const m = partMeshMatrix(doc, node, part)
    return m ? new Matrix4().fromArray(m) : null
  }, [doc, node, part])
  return matrix ? (
    <group matrix={matrix} matrixAutoUpdate={false}>
      {children}
    </group>
  ) : (
    <>{children}</>
  )
}

function MeshView({
  mesh,
  css,
  opacity,
  solid,
  display = 'shaded',
  selected,
  onSelect,
  onPick,
  onEdit,
}: {
  /** Edit mode: clicks and hovers report the triangle and where it was hit, instead of selecting the layer. */
  onEdit?: { pick: (triangle: number, hit: Vec3, additive: boolean) => void; hover: (triangle: number | null, hit: Vec3) => void }
  mesh: Mesh
  css: string
  opacity: number
  solid: boolean
  display?: DisplayMode
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
      onPointerMove={onEdit ? (e) => { e.stopPropagation(); if (e.faceIndex != null) onEdit.hover(e.faceIndex, e.point.toArray() as Vec3) } : undefined}
      onPointerOut={onEdit ? () => onEdit.hover(null, [0, 0, 0]) : undefined}
      onClick={(e) => {
        // A click selects; the end of an orbit or a pan over the mesh doesn't.
        if (e.delta > CLICK_DRAG_THRESHOLD) {
          e.stopPropagation()
          return
        }
        // Edit mode: the point, edge or face under the click.
        if (onEdit) {
          e.stopPropagation()
          if (e.faceIndex != null) onEdit.pick(e.faceIndex, e.point.toArray() as Vec3, e.nativeEvent.shiftKey)
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
      {display === 'wireframe' ? (
        // The polygons' lines alone, in the part's own colour; the faces still take a click.
        <meshBasicMaterial color={color} wireframe transparent={opacity < 1} opacity={opacity} />
      ) : (
        <meshStandardMaterial
          color={color}
          // X-ray: see-through, and nothing hides what's behind it.
          transparent={display === 'xray' || opacity < 1}
          opacity={display === 'xray' ? Math.min(opacity, 0.32) : opacity}
          depthWrite={display !== 'xray'}
          side={solid && display !== 'xray' ? FrontSide : DoubleSide}
          roughness={0.55}
          metalness={0.05}
          // In edit mode the surface sits a hair back, so the points and edges drawn on it win.
          polygonOffset={!!onEdit}
          polygonOffsetFactor={1}
          polygonOffsetUnits={1}
        />
      )}
      {/* Every polygon's outline (a 1° turn is a new facet), so a curve's smoothness shows. */}
      {!selected && (display === 'edges' || display === 'xray') && <Edges threshold={1} color={display === 'xray' ? XRAY_EDGE : EDGE} />}
      {selected && <Edges threshold={display === 'shaded' ? 20 : 1} color={SELECTED} />}
    </mesh>
  )
}

// ── Edit mode ──────────────────────────────────────────────────────────────

/** A layer's edit-mode hooks: its triangles report the element under them (selectionModes.ts). */
function editHooks(ctx: SceneContext, layerId: NodeId) {
  const edit = ctx.edit
  if (!edit) return undefined
  return {
    pick: (triangle: number, hit: Vec3, additive: boolean) => edit.pick(layerId, triangle, hit, additive),
    hover: (triangle: number | null, hit: Vec3) => edit.hover(triangle === null ? null : layerId, triangle ?? -1, hit),
  }
}

// Edit mode's marks: every point or edge of the mode drawn faint, the picked ones in the selection blue, the hovered one in ink.
const EDIT_DIM = '#8a8a92'
const EDIT_HOVER = '#ffffff'

/** Edit mode drawn over the parts: Blender's dots and lines for the mode, the picked and hovered ones marked. */
function EditOverlay({ bodies, kind, elements, hovered, xray }: { bodies: Map<string, Body>; kind: ElementKind; elements: PickRef[]; hovered: PickRef | null; xray: boolean }) {
  const picked = useMemo(() => new Set(elements.map(elementKey)), [elements])
  const list = [...bodies.values()]
  return (
    <group>
      {list.map((body) => (
        <group key={body.objectId}>
          {kind === 'vertex' && <Dots points={body.vertices.map((v) => v.at)} size={5} color={EDIT_DIM} xray={xray} />}
          {kind === 'vertex' && (
            <Dots
              points={body.vertices.filter((_, i) => picked.has(elementKey({ objectId: body.objectId, kind, index: i }))).map((v) => v.at)}
              size={9}
              color={SELECTED}
              xray
            />
          )}
          {kind === 'edge' &&
            body.edges.map((e, i) => {
              const key = elementKey({ objectId: body.objectId, kind, index: i })
              const on = picked.has(key)
              return e.points.length > 1 ? <Line key={i} points={e.points} color={on ? SELECTED : EDIT_DIM} lineWidth={on ? 3 : 1} depthTest={!xray && !on} /> : null
            })}
          {kind === 'face' &&
            body.faces.map((_, i) => (picked.has(elementKey({ objectId: body.objectId, kind, index: i })) ? <FaceMark key={i} body={body} face={i} color={SELECTED} opacity={0.38} /> : null))}
        </group>
      ))}
      {hovered && bodies.get(hovered.objectId) && <HoverMark body={bodies.get(hovered.objectId)!} ref_={hovered} />}
    </group>
  )
}

function HoverMark({ body, ref_ }: { body: Body; ref_: PickRef }) {
  if (ref_.kind === 'vertex') return body.vertices[ref_.index] ? <Dots points={[body.vertices[ref_.index].at]} size={9} color={EDIT_HOVER} xray /> : null
  if (ref_.kind === 'edge') return body.edges[ref_.index] ? <Line points={body.edges[ref_.index].points} color={EDIT_HOVER} lineWidth={2.5} depthTest={false} /> : null
  return <FaceMark body={body} face={ref_.index} color={EDIT_HOVER} opacity={0.16} />
}

/** Points drawn as screen-sized dots. `xray` draws them through the parts. */
function Dots({ points, size, color, xray }: { points: Vec3[]; size: number; color: string; xray: boolean }) {
  const geometry = useMemo(() => {
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute(points.flat(), 3))
    return g
  }, [points])
  useEffect(() => () => geometry.dispose(), [geometry])
  if (points.length === 0) return null
  return (
    <points geometry={geometry} renderOrder={2}>
      <pointsMaterial color={color} size={size} sizeAttenuation={false} depthTest={!xray} transparent />
    </points>
  )
}

/** One body face tinted over itself. */
function FaceMark({ body, face, color, opacity }: { body: Body; face: number; color: string; opacity: number }) {
  const geometry = useMemo(() => {
    const g = new BufferGeometry()
    const positions: number[] = []
    for (const t of body.faces[face]?.triangles ?? []) {
      for (let k = 0; k < 3; k += 1) {
        const i = body.mesh.indices[t * 3 + k]
        positions.push(body.mesh.positions[i * 3], body.mesh.positions[i * 3 + 1], body.mesh.positions[i * 3 + 2])
      }
    }
    g.setAttribute('position', new Float32BufferAttribute(positions, 3))
    return g
  }, [body, face])
  useEffect(() => () => geometry.dispose(), [geometry])
  return (
    <mesh geometry={geometry} renderOrder={1}>
      <meshBasicMaterial color={color} transparent opacity={opacity} side={DoubleSide} depthWrite={false} />
    </mesh>
  )
}

/** The live camera as G / R / S read it (modalTransform.ts ScreenView). */
function screenViewOf({ camera, w, h }: { camera: CameraImpl; w: number; h: number }): ScreenView {
  const raycaster = new Raycaster()
  return {
    ray: (x, y) => {
      raycaster.setFromCamera(new Vector2((x / w) * 2 - 1, -(y / h) * 2 + 1), camera)
      return { origin: raycaster.ray.origin.toArray() as Vec3, dir: raycaster.ray.direction.toArray() as Vec3 }
    },
    project: (p) => {
      const v = new Vector3(...p).project(camera)
      return v.z > 1 ? null : { x: ((v.x + 1) / 2) * w, y: ((1 - v.y) / 2) * h }
    },
    forward: camera.getWorldDirection(new Vector3()).toArray() as Vec3,
  }
}

/** What G / R / S is doing, and how to steer it. */
function ModalHud({ said }: { said: string }) {
  return (
    <div
      role="status"
      style={{ ...UI_FONT, position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, fontSize: 11, color: 'var(--text-1)', background: 'var(--bg-1)', border: '1px solid var(--border-1)', borderRadius: 'var(--radius-control)', padding: '5px 12px', pointerEvents: 'none', zIndex: 3, whiteSpace: 'nowrap' }}
    >
      <span style={{ fontVariantNumeric: 'tabular-nums' }}>{said}</span>
      <span style={{ color: 'var(--text-3)' }}>X / Y / Z locks · type an amount · Ctrl snaps · Enter or click keeps · Esc puts back</span>
    </div>
  )
}

/** Hands the live camera and canvas size out of the scene, for B's box to project with. */
function CameraTap({ tap }: { tap: React.MutableRefObject<{ camera: CameraImpl; w: number; h: number } | null> }) {
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  tap.current = { camera, w: size.width, h: size.height }
  return null
}

/** B: drag a box over the view; what's inside is picked (Shift adds). Esc or a click without a drag cancels. */
function BoxSelect({ onDone }: { onDone: (box: { x0: number; y0: number; x1: number; y1: number } | null, additive: boolean) => void }) {
  const [box, setBox] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null)
  const at = (e: React.PointerEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }
  return (
    <div
      data-viewport-box-select=""
      style={{ position: 'absolute', inset: 0, cursor: 'crosshair', zIndex: 3 }}
      onPointerDown={(e) => {
        ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
        const p = at(e)
        setBox({ x0: p.x, y0: p.y, x1: p.x, y1: p.y })
      }}
      onPointerMove={(e) => {
        if (!box) return
        const p = at(e)
        setBox({ ...box, x1: p.x, y1: p.y })
      }}
      onPointerUp={(e) => {
        const moved = box && Math.hypot(box.x1 - box.x0, box.y1 - box.y0) > 3
        onDone(moved ? box : null, e.shiftKey)
      }}
    >
      {box && (
        <div
          style={{
            position: 'absolute',
            left: Math.min(box.x0, box.x1),
            top: Math.min(box.y0, box.y1),
            width: Math.abs(box.x1 - box.x0),
            height: Math.abs(box.y1 - box.y0),
            border: '1px dashed var(--text-2)',
            background: 'rgba(var(--item-ink, 255,255,255), 0.06)',
            pointerEvents: 'none',
          }}
        />
      )}
      <div style={{ position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)', fontFamily: 'var(--font-ui)', fontSize: 11, color: 'var(--text-2)', background: 'var(--bg-1)', border: '1px solid var(--border-1)', borderRadius: 'var(--radius-control)', padding: '4px 10px', pointerEvents: 'none' }}>
        Drag a box to select — Shift adds, Esc cancels
      </div>
    </div>
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

/** What's left in the 3D view's own corner: what the scene costs to draw. Views are the axis gizmo's; display and select modes have homes of their own. */
function Toolbar({ vm }: { vm: ReturnType<typeof useViewport3DViewModel> }) {
  return (
    <div style={{ position: 'absolute', top: 10, left: 10, pointerEvents: 'none', ...UI_FONT, fontSize: 10, letterSpacing: '0.04em', color: 'var(--text-3)' }}>
      {vm.triangles.toLocaleString()} Tris
    </div>
  )
}
