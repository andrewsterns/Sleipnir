import React from 'react'
import { useDropdownViewModel } from './DropdownViewModel'
import { DropdownProps } from './iDropdown'
import { cn } from '../../../utils/cn'
import { Frame } from '../../01_atoms/Frame/Frame'

export const Dropdown = React.forwardRef<HTMLElement, DropdownProps>((
  {
    // ── Dropdown-specific ─────────────────────────────────────────────────────
    options,
    value,
    onChange,
    label,
    variant = 'surface',

    // ── Frame defaults ────────────────────────────────────────────────────────
    flow   = 'freeform',   // children (menu) use absolute positioning
    w      = 192,

    // ── Everything else passes straight through ───────────────────────────────
    className,
    ...frameProps
  },
  ref
) => {
  const { isOpen, selectedValue, selectedLabel, toggle, selectOption, dropdownRef } =
    useDropdownViewModel(options, value)

  const handleSelect = (val: string) => {
    selectOption(val)
    onChange?.(val)
  }

  return (
    <Frame
      ref={(node) => {
        // forward both the consumer ref and the click-outside ref
        if (typeof ref === 'function') ref(node)
        else if (ref) (ref as React.MutableRefObject<HTMLElement | null>).current = node
        ;(dropdownRef as React.MutableRefObject<HTMLElement | null>).current = node
      }}
      flow={flow}
      w={w}
      className={cn('font-mono text-xs', className)}
      {...frameProps}
    >
      {label && (
        <Frame
          as="label"
          layout="block"
          margin={{ bottom: 4 }}
          className="text-[var(--text-2)] font-black uppercase tracking-widest"
        >
          {label}
        </Frame>
      )}

      <Frame
        as="button"
        onClick={toggle}
        flow="horizontal"
        align="center"
        justify="between"
        padding={{ x: 12, y: 8 }}
        variant={variant}
        radius="var(--radius-1)"
        w="fill"
        effects={{ 'drop-shadow': { x: 4, y: 4, blur: 0, spread: 0, color: 'var(--primary-3)' } }}
        activeScale={0.98}
        transition="all"
        className="italic font-bold uppercase tracking-tighter"
      >
        <span className="truncate">{selectedLabel}</span>
        <span className={cn('transition-transform duration-200 text-[10px]', isOpen ? 'rotate-180' : '')}>
          ▼
        </span>
      </Frame>

      {isOpen && (
        <Frame
          absolute
          z={50}
          w="fill"
          margin={{ top: 4 }}
          variant="surface"
          radius="var(--radius-1)"
          clipContent
          effects={{ 'drop-shadow': { x: 4, y: 4, blur: 0, spread: 0, color: 'var(--primary-3)' } }}
          animate="fade-in"
          animationDuration={150}
        >
          {options.map((option) => (
            <Frame
              as="button"
              key={option.value}
              onClick={() => handleSelect(option.value)}
              w="fill"
              flow="horizontal"
              align="center"
              padding={{ x: 12, y: 8 }}
              stroke={{ bottom: { color: 'border-1' } }}
              hoverFill="bg-3"
              fill={{ solid: selectedValue === option.value ? 'bg-3' : 'transparent' }}
              className="text-left uppercase italic tracking-tighter text-[var(--text-1)]"
            >
              {option.label}
            </Frame>
          ))}
        </Frame>
      )}
    </Frame>
  )
})

Dropdown.displayName = 'Dropdown'
