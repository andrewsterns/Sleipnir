// Where a new sketch can go in an environment — on Front, Top or Side, on a
// face picked in 3D, or placed from a Sketch document, linked. The same
// choices from the left panel's + Sketch and the toolbox's Sketch tool.

import type { ContextMenuItem } from '../../app/UIKit/ContextMenu/ContextMenu'
import type { DefaultPlane, PlaneRef } from '../../document/objects'

const PLANES: { plane: DefaultPlane; label: string }[] = [
  { plane: 'front', label: 'Front plane' },
  { plane: 'top', label: 'Top plane' },
  { plane: 'side', label: 'Side plane' },
]

export interface CreateBarProps {
  onSketch: (plane: PlaneRef) => void
  /** Starts picking a face in 3D; absent when the board has no objects to pick from. */
  onPickFace?: () => void
  /** The project's Sketch documents, to place one here linked. */
  sketches?: { id: string; name: string }[]
  onPlace?: (docId: string) => void
}

/** Where a new sketch can go — the same choices from + Sketch and from the toolbox's Sketch tool. */
export function sketchMenuItems({ onSketch, onPickFace, sketches = [], onPlace }: CreateBarProps): ContextMenuItem[] {
  return [
    ...PLANES.map(({ plane, label }) => ({ label, onSelect: () => onSketch({ kind: 'default', plane }) })),
    { label: onPickFace ? 'On a face…' : 'On a face… (make an object first)', separator: true, disabled: !onPickFace, onSelect: () => onPickFace?.() },
    sketches.length > 0 && onPlace
      ? { label: 'From a sketch', children: sketches.map((s) => ({ label: s.name, icon: 'canvas' as const, onSelect: () => onPlace(s.id) })) }
      : { label: 'From a sketch (make a sketch first)', disabled: true },
  ]
}
