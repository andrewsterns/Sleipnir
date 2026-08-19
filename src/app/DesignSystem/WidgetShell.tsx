import { useState } from 'react'
import { Frame } from '../UIKit/Frame/Frame'
import { useWidgetShellViewModel } from './WidgetShell.ViewModel'
import { useAppTheme } from '../../00_themes/ThemeController'

export interface WidgetShellProps {
  /** Rendered at the current rail width — a rail control (e.g. LeftRailing) sizes itself via a `width` prop, so this is a render prop rather than a plain node. */
  rail: (width: number) => React.ReactNode
  /** Title + open-tabs bar, pinned above preview/code — see WorkspaceHeader. Omit for a rail-only layout with no header at all. */
  header?: React.ReactNode
  /** Omit entirely to collapse to a single rail+code layout (no preview pane) — e.g. a widget whose files aren't visually renderable. */
  preview?: React.ReactNode
  code: React.ReactNode
}

// Exported so FolderBrowserView.tsx can reuse it for the split-pane divider
// rather than keeping its own copy — same drag-handle look/feel as the
// rail/preview resize handles below.
export function ResizeHandle({ axis, onMouseDown }: { axis: 'x' | 'y'; onMouseDown: (e: React.MouseEvent) => void }) {
  const [hover, setHover] = useState(false)
  const lineStyle: React.CSSProperties = {
    position: 'absolute',
    background: hover ? 'rgba(var(--item-ink, 255,255,255), 0.28)' : 'var(--border-1)',
    transition: 'background 80ms',
    ...(axis === 'x' ? { left: '50%', top: 0, bottom: 0, width: 1 } : { top: '50%', left: 0, right: 0, height: 1 }),
  }
  return (
    <div
      onMouseDown={onMouseDown}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        flexShrink: 0,
        position: 'relative',
        cursor: axis === 'x' ? 'col-resize' : 'row-resize',
        ...(axis === 'x' ? { width: 8 } : { height: 8, width: '100%' }),
      }}
    >
      <div style={lineStyle} />
    </div>
  )
}

// Generic "rail + optional preview + code" widget layout. The rail runs the
// full height of the widget, from the true top — `header` (the tabs row) is
// scoped inside the content column beside the rail, not a sibling spanning
// above it, so the rail/sidebar never starts lower than the content it sits
// next to.
export function WidgetShell({ rail, header, preview, code }: WidgetShellProps) {
  const { railWidth, previewHeight, startDrag } = useWidgetShellViewModel()
  const { theme } = useAppTheme()

  return (
    <Frame theme={theme} flow="horizontal" h="fill" w="fill" fill={{ solid: 'bg-1' }}>
      {rail(railWidth)}

      <ResizeHandle axis="x" onMouseDown={(e) => startDrag('rail', e)} />

      <Frame flow="vertical" gap={0} minH={0} minW={0} grow h="fill">
        {header}

        {preview && (
          <>
            <Frame w="fill" h={previewHeight} shrink={0}>
              {preview}
            </Frame>
            <ResizeHandle axis="y" onMouseDown={(e) => startDrag('preview', e)} />
          </>
        )}

        <Frame flow="vertical" gap={0} grow minH={0} fill={{ solid: 'bg-1' }}>
          {code}
        </Frame>
      </Frame>
    </Frame>
  )
}
