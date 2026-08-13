import React from 'react';
import { Frame } from '../Frame/Frame';
import { Icon } from '../Icon/Icon';
import { Dropdown } from '../Dropdown/Dropdown';
import { cn } from '../../../utils/cn';
import { SearchProps } from './iSearch';
import { useSearchViewModel } from './SearchViewModel';

export const Search = React.forwardRef<HTMLElement, SearchProps>((
  {
    // ── Search-specific ────────────────────────────────────────────────────
    value,
    onChange,
    placeholder = 'Search…',
    onClear,
    autoFocus,
    filters,

    // ── Frame defaults — callers can override any of these ────────────────
    as      = 'div',
    flow    = 'horizontal',
    align   = 'center',
    gap     = 8,
    padding = { x: 10, y: 6 },
    // The shared interactive-control radius — rounded in every theme,
    // including tactical (whose panel radii stay square). See --radius-control.
    radius  = 'var(--radius-control)',
    variant = 'surface',

    className,
    ...frameProps
  },
  ref
) => {
  const { inputRef, handleChange, handleClear } = useSearchViewModel({ onChange, onClear });

  return (
    <Frame
      as={as}
      ref={ref}
      flow={flow}
      align={align}
      gap={gap}
      padding={padding}
      radius={radius}
      variant={variant}
      className={cn('font-mono text-[10px]', className)}
      {...frameProps}
    >
      <Icon name="search" size={13} className="text-[var(--text-3)] shrink-0" />
      <input
        ref={inputRef}
        value={value}
        onChange={handleChange}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className="flex-1 min-w-0 bg-transparent border-none outline-none font-mono text-[10px] text-[var(--text-1)] placeholder:text-[var(--text-3)]"
      />
      {filters && (
        <Dropdown
          options={filters.options.map((o) => ({ value: o.id, label: o.label }))}
          value={filters.active}
          onChange={(v) => filters.onChange(v as string[])}
          multiple
          variant="none"
          w="auto"
          trigger={
            <Icon
              name="filter"
              size={13}
              className={cn('shrink-0', filters.active.length > 0 ? 'text-[var(--text-1)]' : 'text-[var(--text-3)]')}
            />
          }
        />
      )}
      {value && (
        <button
          type="button"
          onClick={handleClear}
          aria-label="Clear search"
          className="shrink-0 p-0 border-none bg-transparent cursor-pointer text-[var(--text-3)] hover:text-[var(--text-1)] transition-colors"
        >
          <Icon name="x" size={12} />
        </button>
      )}
    </Frame>
  );
});

Search.displayName = 'Search';
