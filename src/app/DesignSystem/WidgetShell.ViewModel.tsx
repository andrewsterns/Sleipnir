import { useEffect, useRef, useState } from 'react'

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

export type WidgetShellDragTarget = 'rail' | 'preview' | null

// Same drag-to-resize approach as DesignLibrary.view.tsx's treeWidth/
// previewHeight state (this hook is that logic, pulled out so a new widget
// doesn't need its own copy — see WidgetShell.tsx).
export function useWidgetShellViewModel() {
  const [railWidth, setRailWidth] = useState(260)
  const [previewHeight, setPreviewHeight] = useState(220)
  const dragRef = useRef<{ target: WidgetShellDragTarget; start: number; startSize: number }>({
    target: null,
    start: 0,
    startSize: 0,
  })

  const startDrag = (target: WidgetShellDragTarget, e: React.MouseEvent) => {
    e.preventDefault()
    dragRef.current = {
      target,
      start: target === 'rail' ? e.clientX : e.clientY,
      startSize: target === 'rail' ? railWidth : previewHeight,
    }
    document.body.style.cursor = target === 'rail' ? 'col-resize' : 'row-resize'
    document.body.style.userSelect = 'none'
  }

  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      const { target, start, startSize } = dragRef.current
      if (target === 'rail') setRailWidth(clamp(startSize + (e.clientX - start), 180, 900))
      else if (target === 'preview') setPreviewHeight(clamp(startSize + (e.clientY - start), 120, 520))
    }
    const stopDrag = () => {
      if (!dragRef.current.target) return
      dragRef.current.target = null
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', stopDrag)
    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', stopDrag)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [])

  return { railWidth, previewHeight, startDrag }
}
