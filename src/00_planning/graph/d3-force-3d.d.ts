declare module 'd3-force-3d' {
  export interface SimulationNodeDatum3D {
    index?: number
    x?: number
    y?: number
    z?: number
    vx?: number
    vy?: number
    vz?: number
    fx?: number | null
    fy?: number | null
    fz?: number | null
  }

  export interface Simulation<N> {
    tick(iterations?: number): Simulation<N>
    nodes(): N[]
    nodes(nodes: N[]): Simulation<N>
    force(name: string): unknown
    force(name: string, force: unknown): Simulation<N>
    alpha(): number
    alpha(alpha: number): Simulation<N>
    alphaTarget(target: number): Simulation<N>
    restart(): Simulation<N>
    stop(): Simulation<N>
  }

  export function forceSimulation<N extends SimulationNodeDatum3D>(nodes?: N[], numDimensions?: number): Simulation<N>

  export interface ForceManyBody<N> {
    strength(v: number | ((n: N) => number)): ForceManyBody<N>
  }
  export function forceManyBody<N>(): ForceManyBody<N>

  export interface ForceLink<N, L> {
    id(fn: (n: N) => string): ForceLink<N, L>
    distance(v: number | ((l: L) => number)): ForceLink<N, L>
    strength(v: number | ((l: L) => number)): ForceLink<N, L>
  }
  export function forceLink<N, L>(links?: L[]): ForceLink<N, L>

  export function forceCenter(x?: number, y?: number, z?: number): unknown

  export interface ForceCollide<N> {
    radius(v: number | ((n: N) => number)): ForceCollide<N>
  }
  export function forceCollide<N>(radius?: number | ((node: N) => number)): ForceCollide<N>

  export interface ForceAxis<N> {
    strength(v: number | ((n: N) => number)): ForceAxis<N>
  }
  export function forceX<N>(x?: number | ((node: N) => number)): ForceAxis<N>
  export function forceY<N>(y?: number | ((node: N) => number)): ForceAxis<N>
  export function forceZ<N>(z?: number | ((node: N) => number)): ForceAxis<N>
}
