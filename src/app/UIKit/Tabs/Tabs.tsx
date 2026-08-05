import React, { createContext, useContext, useRef, useState } from 'react';
import { Frame } from '../Frame/Frame';
import { TabsCtx as TabsCtxType, TabsRootProps, TabsListProps, TabProps, TabsPanelProps } from './iTabs';
import { useTabsViewModel, handleTabsListKeyDown } from './TabsViewModel';

// ── Context ───────────────────────────────────────────────────────────────────

const Ctx = createContext<TabsCtxType | null>(null);

function useTabsCtx() {
  const c = useContext(Ctx);
  if (!c) throw new Error('<Tabs.*> must be used inside <Tabs.Root>');
  return c;
}

// ── Root ──────────────────────────────────────────────────────────────────────

const Root: React.FC<TabsRootProps> = ({
  defaultValue = '',
  value,
  onValueChange,
  children,
  style,
  className,
}) => {
  const { activeValue, setActiveValue, baseId } = useTabsViewModel({ defaultValue, value, onValueChange });

  return (
    <Ctx.Provider value={{ activeValue, setActiveValue, baseId }}>
      <Frame flow="vertical" className={className} style={style}>
        {children}
      </Frame>
    </Ctx.Provider>
  );
};

// ── List ──────────────────────────────────────────────────────────────────────

const List: React.FC<TabsListProps> = ({ children, style, className }) => {
  const ref = useRef<HTMLDivElement>(null);

  return (
    <Frame
      ref={ref as React.RefObject<HTMLElement>}
      flow="horizontal"
      role="tablist"
      onKeyDown={(e) => handleTabsListKeyDown(ref as React.RefObject<HTMLElement>, e)}
      className={className}
      style={{
        borderBottom: '1px solid var(--border-1)',
        overflowX: 'auto',
        scrollbarWidth: 'none' as React.CSSProperties['scrollbarWidth'],
        flexShrink: 0,
        gap: 0,
        ...style,
      }}
    >
      {children}
    </Frame>
  );
};

// ── Tab ───────────────────────────────────────────────────────────────────────
// Styled like a page/editor tab (VS Code, browser tabs) rather than an
// underlined nav link: a bordered segment with its own background, divided
// from its neighbors by a right-hand rule, with the active tab reading as a
// raised, lit chip (bg-2 fill + a top accent) instead of an underline.

const Tab: React.FC<TabProps> = ({ value, children, disabled = false, style, className }) => {
  const { activeValue, setActiveValue, baseId } = useTabsCtx();
  const isActive = activeValue === value;
  const [hovered, setHovered] = useState(false);

  return (
    <button
      role="tab"
      id={`${baseId}-tab-${value}`}
      aria-controls={`${baseId}-panel-${value}`}
      aria-selected={isActive}
      tabIndex={isActive ? 0 : -1}
      disabled={disabled}
      className={className}
      onClick={() => !disabled && setActiveValue(value)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: isActive ? 'var(--bg-2)' : hovered && !disabled ? 'rgba(255,255,255,0.03)' : 'transparent',
        border: 'none',
        borderRight: '1px solid var(--border-1)',
        borderTop: `2px solid ${isActive ? 'var(--text-1)' : 'transparent'}`,
        borderBottom: 'none',
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontFamily: 'var(--font-mono)',
        fontSize: 10,
        fontWeight: isActive ? 700 : 400,
        color: isActive ? 'var(--text-1)' : 'var(--text-3)',
        padding: '6px 14px 5px',
        whiteSpace: 'nowrap',
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        flexShrink: 0,
        opacity: disabled ? 0.35 : 1,
        outline: 'none',
        transition: 'color 0.12s, background 0.12s, border-color 0.12s',
        ...style,
      }}
    >
      {children}
    </button>
  );
};

// ── Panel ─────────────────────────────────────────────────────────────────────

const Panel: React.FC<TabsPanelProps> = ({ value, children, style, className }) => {
  const { activeValue, baseId } = useTabsCtx();
  if (activeValue !== value) return null;

  return (
    <div
      role="tabpanel"
      id={`${baseId}-panel-${value}`}
      aria-labelledby={`${baseId}-tab-${value}`}
      tabIndex={0}
      className={className}
      style={{ outline: 'none', ...style }}
    >
      {children}
    </div>
  );
};

// ── Export ────────────────────────────────────────────────────────────────────

export const Tabs = { Root, List, Tab, Panel };
export type { TabsRootProps, TabsListProps, TabProps, TabsPanelProps } from './iTabs';
