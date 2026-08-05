import React, { useLayoutEffect, useRef, useState } from 'react'
import ReactDOM from 'react-dom'
import { useDropdownViewModel } from './DropdownViewModel'
import { DropdownProps } from './iDropdown'
import { cn } from '../../../utils/cn'
import { Frame } from '../Frame/Frame'

export const Dropdown = React.forwardRef<HTMLElement, DropdownProps>((
  {
    // ── Dropdown-specific ─────────────────────────────────────────────────────
    options,
    value,
    onChange,
    label,
    variant = 'surface',
    trigger,
    multiple = false,

    // ── Frame defaults ────────────────────────────────────────────────────────
    flow   = 'freeform',   // children (menu) use absolute positioning
    // A custom `trigger` is typically icon-only — let the call site size it
    // instead of forcing the 192px label-dropdown default on it.
    w      = trigger ? 'auto' : 192,

    // ── Everything else passes straight through ───────────────────────────────
    className,
    ...frameProps
  },
  ref
) => {
  const { isOpen, selectedValue, selectedValues, selectedLabel, toggle, selectOption, toggleOption, dropdownRef, menuRef } =
    useDropdownViewModel(options, value, multiple)

  const triggerRef = useRef<HTMLElement>(null)
  const [menuRect, setMenuRect] = useState<{ top: number; left: number; width: number } | null>(null)
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null)

  // The menu portals out (below) so it can visually escape an ancestor
  // ScrollWindow's clipping — any container with overflow-y:auto forces
  // overflow-x to clip too per the CSS spec, regardless of the menu's own
  // position:absolute. Recomputed on open and kept in sync with
  // scroll/resize while open, since the portal is no longer positioned by
  // the normal DOM flow relative to the trigger.
  //
  // Portals into the nearest `.theme-*` ancestor, NOT document.body directly:
  // every CSS custom property this component reads (--bg-2, --text-1,
  // --border-1, ...) is scoped to that class (see ThemeProvider.tsx), so a
  // portal straight to document.body would sit outside any theme scope —
  // every var() resolves to nothing, backgrounds go transparent and borders
  // vanish, which read as "white/invisible" over the page behind it.
  useLayoutEffect(() => {
    if (!isOpen) return
    const updateRect = () => {
      const rect = triggerRef.current?.getBoundingClientRect()
      if (!rect) return
      setMenuRect({ top: rect.bottom + 4, left: rect.left, width: Math.max(rect.width, 160) })
    }
    let node: HTMLElement | null = triggerRef.current
    while (node && !Array.from(node.classList).some((c) => c.startsWith('theme-'))) {
      node = node.parentElement
    }
    setPortalTarget(node ?? document.body)
    updateRect()
    window.addEventListener('resize', updateRect)
    window.addEventListener('scroll', updateRect, true)
    return () => {
      window.removeEventListener('resize', updateRect)
      window.removeEventListener('scroll', updateRect, true)
    }
  }, [isOpen])

  const handleSelect = (val: string) => {
    if (multiple) {
      toggleOption(val)
      onChange?.(selectedValues.includes(val) ? selectedValues.filter((v) => v !== val) : [...selectedValues, val])
    } else {
      selectOption(val)
      onChange?.(val)
    }
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
        ref={triggerRef}
        as="button"
        onClick={toggle}
        flow="horizontal"
        align="center"
        justify="between"
        padding={trigger ? { x: 0, y: 0 } : { x: 12, y: 8 }}
        variant={variant}
        radius="var(--radius-3)"
        w={trigger ? 'hug' : 'fill'}
        effects={{ 'drop-shadow': { x: 0, y: 4, blur: 12, spread: 0, color: 'rgba(0,0,0,0.06)' } }}
        activeScale={0.98}
        transition="all"
        className={trigger ? undefined : 'italic font-bold uppercase tracking-tighter'}
      >
        {trigger ?? (
          <>
            <span className="truncate">{selectedLabel}</span>
            <span className={cn('transition-transform duration-200 text-[10px]', isOpen ? 'rotate-180' : '')}>
              ▼
            </span>
          </>
        )}
      </Frame>

      {isOpen && menuRect && portalTarget &&
        ReactDOM.createPortal(
          <Frame
            ref={menuRef as React.RefObject<HTMLElement>}
            fixed
            y={menuRect.top}
            x={menuRect.left}
            w={menuRect.width}
            z={200}
            variant="surface"
            radius="var(--radius-3)"
            clipContent
            effects={{ 'drop-shadow': { x: 0, y: 8, blur: 24, spread: 0, color: 'rgba(0,0,0,0.06)' } }}
            animate="fade-in"
            animationDuration={150}
            className="font-mono text-xs"
          >
            {options.map((option) => {
              const isSelected = multiple ? selectedValues.includes(option.value) : selectedValue === option.value
              return (
                <Frame
                  as="button"
                  key={option.value}
                  onClick={() => handleSelect(option.value)}
                  w="fill"
                  flow="horizontal"
                  align="center"
                  gap={8}
                  padding={{ x: 12, y: 8 }}
                  radius="var(--radius-2)"
                  stroke={{ bottom: { color: 'border-1' } }}
                  hoverFill="bg-3"
                  fill={{ solid: isSelected && !multiple ? 'bg-3' : 'transparent' }}
                  className="text-left uppercase italic tracking-tighter text-[var(--text-1)]"
                >
                  {multiple && <span className="not-italic">{isSelected ? '☑' : '☐'}</span>}
                  {option.label}
                </Frame>
              )
            })}
          </Frame>,
          portalTarget,
        )}
    </Frame>
  )
})

Dropdown.displayName = 'Dropdown'
