import React, { useLayoutEffect, useRef, useState } from 'react'
import ReactDOM from 'react-dom'
import { useDropdownViewModel } from './DropdownViewModel'
import type { DropdownProps } from './iDropdown'
import { cn } from '../../../utils/cn'
import { Frame } from '../Frame/Frame'
import { Text } from '../Text/Text'
import { Icon } from '../Icon/Icon'

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
  // Grouped option lists (e.g. a filter dropdown mixing "ASSET TYPE" and
  // "FILE TYPE") read cramped at the plain single-column 160px floor — widen
  // the floor so labels + group headers don't wrap.
  const hasGroups = options.some((o) => o.group)
  const groupCount = new Set(options.map((o) => o.group).filter(Boolean)).size

  useLayoutEffect(() => {
    if (!isOpen) return
    const updateRect = () => {
      const rect = triggerRef.current?.getBoundingClientRect()
      if (!rect) return
      // Opens upward when there isn't room below but there is above — e.g. a
      // trigger in a panel docked to the bottom of the window. Height is an
      // estimate from row/header sizes below, capped at the grouped maxH.
      const estimated = Math.min(hasGroups ? 320 : Infinity, options.length * 24 + groupCount * 22 + 12)
      const spaceBelow = window.innerHeight - rect.bottom - 8
      const top = spaceBelow < estimated && rect.top > spaceBelow ? Math.max(8, rect.top - 4 - estimated) : rect.bottom + 4
      setMenuRect({ top, left: rect.left, width: Math.max(rect.width, hasGroups ? 240 : 160) })
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
  }, [isOpen, hasGroups, groupCount, options.length])

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
      className={className}
      {...frameProps}
    >
      {label && (
        <Frame as="label" layout="block" margin={{ bottom: 4 }}>
          <Text variant="xs" weight="black" color="text-2">{label}</Text>
        </Frame>
      )}

      <Frame
        ref={triggerRef}
        as="button"
        onClick={toggle}
        flow="horizontal"
        align="center"
        justify="between"
        padding={trigger ? { x: 0, y: 0 } : { x: 10, y: 7 }}
        variant={variant}
        radius="var(--radius-field)"
        w={trigger ? 'hug' : 'fill'}
        activeScale={0.98}
        transition="all"
      >
        {trigger ?? (
          <>
            <Text variant="small" size={12} color="text-1" noWrap>
              {selectedLabel}
            </Text>
            <Icon name="chevron-down" size={12} className={cn('shrink-0 text-[var(--text-3)] transition-transform duration-200', isOpen ? 'rotate-180' : '')} />
          </>
        )}
      </Frame>

      {isOpen && menuRect && portalTarget &&
        ReactDOM.createPortal(
          <Frame
            ref={menuRef as React.RefObject<HTMLElement>}
            data-floating-menu
            fixed
            y={menuRect.top}
            x={menuRect.left}
            w={menuRect.width}
            z={200}
            variant="surface"
            radius="var(--radius-float)"
            padding={4}
            clipContent
            maxH={hasGroups ? 320 : undefined}
            scroll={hasGroups ? 'y' : undefined}
            // eslint-disable-next-line no-restricted-syntax -- the theme's --shadow-1 token (a layered shadow + hairline); Frame effects only take literal colours.
            style={{ boxShadow: 'var(--shadow-1)' }}
            animate="fade-in"
            animationDuration={150}
          >
            {options.map((option, i) => {
              const isSelected = multiple ? selectedValues.includes(option.value) : selectedValue === option.value
              const startsGroup = !!option.group && option.group !== options[i - 1]?.group
              return (
                <React.Fragment key={option.value}>
                  {startsGroup && (
                    <Frame padding={{ x: 8, top: i === 0 ? 4 : 10, bottom: 4 }}>
                      <Text size={11} weight="medium" color="text-3">{option.group}</Text>
                    </Frame>
                  )}
                  <Frame
                    as="button"
                    onClick={() => handleSelect(option.value)}
                    w="fill"
                    flow="horizontal"
                    align="center"
                    gap={8}
                    minH={28}
                    padding={{ x: 8, y: 5 }}
                    radius="var(--radius-2)"
                    hoverFill="bg-3"
                    fill={{ solid: isSelected && !multiple ? 'bg-3' : 'transparent' }}
                  >
                    {multiple && <Icon name="check" size={12} className={isSelected ? 'shrink-0 text-[var(--text-1)]' : 'shrink-0 opacity-0'} />}
                    <Text variant="small" size={12} color={isSelected ? 'text-1' : 'text-2'} align="left">
                      {option.label}
                    </Text>
                  </Frame>
                </React.Fragment>
              )
            })}
          </Frame>,
          portalTarget,
        )}
    </Frame>
  )
})

Dropdown.displayName = 'Dropdown'
