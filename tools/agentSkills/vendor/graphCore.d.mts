// Types for graphCore.mjs, so the app's TypeScript can import the same
// analysis the vendored CLI runs. Only what the app uses is declared.

export interface CoreEdge {
  source: string
  target: string
  kind?: 'static' | 'dynamic' | 'type'
}

export interface CoreGraph {
  files: string[]
  edges: CoreEdge[]
}

export function roleOf(path: string): string
export function layerOf(role: string): number | null
/** Everything that depends on `path`, directly or not, nearest first. */
export function blastRadius(graph: CoreGraph, path: string): { path: string; distance: number }[]
/** Everything `path` depends on, directly or not, nearest first. */
export function dependenciesOf(graph: CoreGraph, path: string): { path: string; distance: number }[]
export function featureTerms(query: string): string[]
