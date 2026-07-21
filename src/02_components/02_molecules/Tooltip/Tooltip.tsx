import React from 'react'
import { Frame } from '../../01_atoms/Frame/Frame'
import { cn } from '../../../utils/cn'
import { TooltipProps } from './iTooltip'
import { useTooltipViewModel } from './TooltipViewModel'

export const Tooltip: React.FC<TooltipProps> = ({
  content,
  children,
  className,
  panelProps,
}) => {
  const { isOpen, open, close } = useTooltipViewModel()

  return (
    <Frame
      className={cn('relative inline-flex', className)}
      onMouseEnter={open}
      onMouseLeave={close}
    >
      {children}
      {isOpen && (
        <Frame
          // ── Defaults ─────────────────────────────────────────────────────
          absolute
          y="100%"
          x={0}
          margin={{ top: 6 }}
          padding={{ x: 8, y: 6 }}
          fill={{ solid: 'bg-2' }}
          stroke={{ color: 'border-1' }}
          radius="var(--radius-2)"
          z={100}
          pointerEvents="none"
          effects={{ 'drop-shadow': { y: 8, blur: 24, color: 'rgba(0,0,0,0.35)' } }}
          // ── Caller overrides ─────────────────────────────────────────────
          {...panelProps}
          className={cn(
            'whitespace-nowrap text-[10px] leading-tight text-[var(--text-1)]',
            panelProps?.className,
          )}
        >
          {content}
        </Frame>
      )}
    </Frame>
  )
}
