import { IconButton } from '../IconButton/IconButton'

export interface VisibilityToggleProps {
  visible: boolean
  onToggle: (visible: boolean) => void
  /** What it shows or hides, for the tooltip: "Show Sketch 1". Defaults to plain Show / Hide. */
  label?: string
  /** Icon size in px. @default 14 */
  iconSize?: number
}

/**
 * The eye: shows or hides a layer, a fill, a section of the layers panel —
 * one look for every visibility toggle in Sleipnir. The open eye means it's
 * shown; the struck-through one, hidden. Its click never reaches the row.
 */
export function VisibilityToggle({ visible, onToggle, label, iconSize = 14 }: VisibilityToggleProps) {
  const verb = visible ? 'Hide' : 'Show'
  return (
    <IconButton
      icon={visible ? 'eye' : 'eye-off'}
      iconSize={iconSize}
      size={20}
      textColor={visible ? 'var(--text-3)' : 'var(--text-2)'}
      title={label ? `${verb} ${label}` : verb}
      onClick={(e: React.MouseEvent) => {
        e.stopPropagation()
        onToggle(!visible)
      }}
    />
  )
}
