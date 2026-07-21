import React, { createContext, useContext, useEffect } from 'react';
import { Frame } from '../../01_atoms/Frame/Frame';
import { TacticalPanel } from '../Panel/Panel';
import {
  SelectCtx as SelectCtxType,
  SelectRootProps,
  SelectTriggerProps,
  SelectContentProps,
  SelectItemProps,
  SelectLabelProps,
} from './iSelect';
import { useSelectViewModel, handleSelectTriggerKeyDown, handleSelectContentKeyDown } from './SelectViewModel';

// ── Context ───────────────────────────────────────────────────────────────────

const Ctx = createContext<SelectCtxType | null>(null);

function useSelectCtx() {
  const c = useContext(Ctx);
  if (!c) throw new Error('<Select.*> must be used inside <Select.Root>');
  return c;
}

// ── Root ──────────────────────────────────────────────────────────────────────

const Root: React.FC<SelectRootProps> = ({
  value,
  defaultValue = '',
  onValueChange,
  children,
  style,
  className,
}) => {
  const { value: controlled, onChange, open, setOpen, baseId, items, registerItem, focusedValue, setFocusedValue, rootRef } =
    useSelectViewModel({ value, defaultValue, onValueChange });

  return (
    <Ctx.Provider value={{ value: controlled, onChange, open, setOpen, baseId, items, registerItem, focusedValue, setFocusedValue }}>
      <Frame ref={rootRef} flow="vertical" className={className} style={{ position: 'relative', ...style }}>
        {children}
      </Frame>
    </Ctx.Provider>
  );
};

// ── Trigger ───────────────────────────────────────────────────────────────────

const Trigger: React.FC<SelectTriggerProps> = ({ placeholder = 'Select…', style, className }) => {
  const { value, open, setOpen, setFocusedValue, baseId, items } = useSelectCtx();
  const label = items.find(i => i.value === value)?.label ?? (value || placeholder);

  return (
    <button
      id={`${baseId}-trigger`}
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-controls={`${baseId}-content`}
      className={className}
      onClick={() => { setOpen(o => !o); setFocusedValue(''); }}
      onKeyDown={(e) => handleSelectTriggerKeyDown(e, setOpen)}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
        gap: 8,
        background: open ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.03)',
        border: `1px solid ${open ? 'rgba(255,255,255,0.22)' : 'var(--border-1)'}`,
        cursor: 'pointer',
        fontFamily: 'var(--font-mono)',
        fontSize: 9,
        color: value ? 'var(--text-1)' : 'var(--text-3)',
        letterSpacing: '0.07em',
        textTransform: 'uppercase',
        padding: '7px 10px',
        textAlign: 'left',
        outline: 'none',
        transition: 'border-color 0.12s, background 0.12s',
        ...style,
      }}
    >
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {label}
      </span>
      <span
        aria-hidden="true"
        style={{
          fontSize: 7,
          color: 'var(--text-3)',
          transform: open ? 'rotate(180deg)' : 'none',
          transition: 'transform 0.15s',
          flexShrink: 0,
        }}
      >
        ▾
      </span>
    </button>
  );
};

// ── Content ───────────────────────────────────────────────────────────────────
// Always rendered (display:none when closed) so items can register labels on mount.

const Content: React.FC<SelectContentProps> = ({ children, style, className }) => {
  const { open, baseId, items, onChange, focusedValue, setFocusedValue } = useSelectCtx();
  const enabledItems = items.filter(i => !i.disabled);

  return (
    <TacticalPanel
      id={`${baseId}-content`}
      role="listbox"
      aria-labelledby={`${baseId}-trigger`}
      aria-activedescendant={focusedValue ? `${baseId}-item-${focusedValue}` : undefined}
      flow="vertical"
      gap={0}
      variant="default"
      chamfer={4}
      onKeyDown={((e: React.KeyboardEvent<HTMLElement>) =>
        handleSelectContentKeyDown(e, enabledItems, focusedValue, setFocusedValue, onChange)) as unknown as React.KeyboardEventHandler<HTMLElement>}
      tabIndex={-1}
      className={className}
      style={{
        position: 'absolute',
        top: 'calc(100% + 4px)',
        left: 0,
        right: 0,
        zIndex: 100,
        maxHeight: 220,
        overflowY: 'auto',
        scrollbarWidth: 'none' as React.CSSProperties['scrollbarWidth'],
        display: open ? 'flex' : 'none',
        ...style,
      }}
    >
      {children}
    </TacticalPanel>
  );
};

// ── Item ──────────────────────────────────────────────────────────────────────

const Item: React.FC<SelectItemProps> = ({ value, children, disabled = false }) => {
  const { value: selected, onChange, registerItem, baseId, focusedValue, setFocusedValue } = useSelectCtx();
  const isSelected = selected === value;
  const isFocused  = focusedValue === value;
  const label = typeof children === 'string' ? children : value;

  useEffect(() => {
    registerItem({ value, label, disabled });
  }, [value, label, disabled, registerItem]);

  return (
    <div
      id={`${baseId}-item-${value}`}
      role="option"
      aria-selected={isSelected}
      aria-disabled={disabled || undefined}
      onClick={() => !disabled && onChange(value)}
      onMouseEnter={() => !disabled && setFocusedValue(value)}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '7px 10px',
        fontFamily: 'var(--font-mono)',
        fontSize: 9,
        color: disabled ? 'var(--text-3)' : isSelected ? 'var(--text-1)' : 'var(--text-2)',
        background: isFocused || isSelected ? 'rgba(255,255,255,0.06)' : 'transparent',
        cursor: disabled ? 'not-allowed' : 'pointer',
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        opacity: disabled ? 0.4 : 1,
        borderLeft: isSelected ? '2px solid rgba(255,255,255,0.28)' : '2px solid transparent',
        transition: 'background 0.08s',
      }}
    >
      <span style={{ flex: 1 }}>{children}</span>
      {isSelected && (
        <span aria-hidden="true" style={{ fontSize: 8, color: 'var(--text-3)', flexShrink: 0 }}>✓</span>
      )}
    </div>
  );
};

// ── Separator ─────────────────────────────────────────────────────────────────

const Separator: React.FC = () => (
  <div aria-hidden="true" style={{ height: 1, background: 'var(--border-1)', margin: '2px 0' }} />
);

// ── Label ─────────────────────────────────────────────────────────────────────

const Label: React.FC<SelectLabelProps> = ({ children }) => (
  <div
    aria-hidden="true"
    style={{
      fontFamily: 'var(--font-mono)',
      fontSize: 7,
      color: 'var(--text-3)',
      letterSpacing: '0.12em',
      textTransform: 'uppercase',
      padding: '6px 10px 2px',
    }}
  >
    {children}
  </div>
);

// ── Export ────────────────────────────────────────────────────────────────────

export const Select = { Root, Trigger, Content, Item, Separator, Label };
export type {
  SelectRootProps,
  SelectTriggerProps,
  SelectContentProps,
  SelectItemProps,
  SelectLabelProps,
} from './iSelect';
