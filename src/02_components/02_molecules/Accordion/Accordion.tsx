import React, { createContext, useContext, useId } from 'react';
import { Frame } from '../../01_atoms/Frame/Frame';
import {
  AccordionCtx as AccordionCtxType,
  ItemCtx as ItemCtxType,
  AccordionRootProps,
  AccordionItemProps,
  AccordionTriggerProps,
  AccordionContentProps,
} from './iAccordion';
import { useAccordionViewModel } from './AccordionViewModel';

// ── Root context ──────────────────────────────────────────────────────────────

const Ctx = createContext<AccordionCtxType | null>(null);

function useAccordionCtx() {
  const c = useContext(Ctx);
  if (!c) throw new Error('<Accordion.*> must be used inside <Accordion.Root>');
  return c;
}

// ── Item context ──────────────────────────────────────────────────────────────

const ItemCtx = createContext<ItemCtxType | null>(null);

function useItemCtx() {
  const c = useContext(ItemCtx);
  if (!c) throw new Error('<Accordion.Trigger/Content> must be used inside <Accordion.Item>');
  return c;
}

// ── Root ──────────────────────────────────────────────────────────────────────

const Root: React.FC<AccordionRootProps> = ({
  type = 'single',
  defaultValue,
  value,
  onValueChange,
  children,
  style,
  className,
}) => {
  const { value: controlled, toggle } = useAccordionViewModel({ type, defaultValue, value, onValueChange });

  return (
    <Ctx.Provider value={{ type, value: controlled, toggle }}>
      <Frame flow="vertical" gap={0} className={className} style={style}>
        {children}
      </Frame>
    </Ctx.Provider>
  );
};

// ── Item ──────────────────────────────────────────────────────────────────────

const Item: React.FC<AccordionItemProps> = ({ value, children, style, className }) => {
  const { value: active } = useAccordionCtx();
  const isOpen = active.includes(value);
  const baseId = useId();

  return (
    <ItemCtx.Provider value={{
      value,
      isOpen,
      triggerId: `${baseId}-trigger`,
      panelId:   `${baseId}-panel`,
    }}>
      <Frame
        flow="vertical"
        gap={0}
        className={className}
        style={{
          borderBottom: '1px solid var(--border-1)',
          ...style,
        }}
      >
        {children}
      </Frame>
    </ItemCtx.Provider>
  );
};

// ── Trigger ───────────────────────────────────────────────────────────────────

const Trigger: React.FC<AccordionTriggerProps> = ({ children, style, className }) => {
  const { toggle } = useAccordionCtx();
  const { value, isOpen, triggerId, panelId } = useItemCtx();

  return (
    <button
      id={triggerId}
      aria-expanded={isOpen}
      aria-controls={panelId}
      className={className}
      onClick={() => toggle(value)}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
        background: isOpen ? 'rgba(255,255,255,0.03)' : 'transparent',
        border: 'none',
        cursor: 'pointer',
        fontFamily: 'var(--font-mono)',
        fontSize: 9,
        color: 'var(--text-1)',
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        padding: '9px 12px',
        textAlign: 'left',
        outline: 'none',
        transition: 'background 0.12s',
        ...style,
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.04)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = isOpen ? 'rgba(255,255,255,0.03)' : 'transparent'; }}
    >
      <span style={{ flex: 1 }}>{children}</span>
      <span
        aria-hidden="true"
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 7,
          color: 'var(--text-3)',
          transform: isOpen ? 'rotate(180deg)' : 'none',
          transition: 'transform 0.18s',
          lineHeight: 1,
          flexShrink: 0,
          marginLeft: 8,
        }}
      >
        ▾
      </span>
    </button>
  );
};

// ── Content ───────────────────────────────────────────────────────────────────

const Content: React.FC<AccordionContentProps> = ({ children, style, className }) => {
  const { isOpen, triggerId, panelId } = useItemCtx();

  return (
    <div
      id={panelId}
      role="region"
      aria-labelledby={triggerId}
      aria-hidden={!isOpen}
      className={className}
      style={{
        display: 'grid',
        gridTemplateRows: isOpen ? '1fr' : '0fr',
        transition: 'grid-template-rows 0.2s ease',
        ...style,
      }}
    >
      <div style={{ overflow: 'hidden', minHeight: 0 }}>
        {children}
      </div>
    </div>
  );
};

// ── Export ────────────────────────────────────────────────────────────────────

export const Accordion = { Root, Item, Trigger, Content };
export type { AccordionRootProps, AccordionItemProps, AccordionTriggerProps, AccordionContentProps } from './iAccordion';
