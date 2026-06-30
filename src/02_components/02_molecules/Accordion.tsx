import React, { createContext, useContext, useId, useState } from 'react';
import { Frame } from '../01_atoms/Frame/Frame';

// ── Root context ──────────────────────────────────────────────────────────────

type AccordionType = 'single' | 'multiple';

interface AccordionCtx {
  type: AccordionType;
  value: string[];
  toggle: (v: string) => void;
}

const Ctx = createContext<AccordionCtx | null>(null);

function useAccordionCtx() {
  const c = useContext(Ctx);
  if (!c) throw new Error('<Accordion.*> must be used inside <Accordion.Root>');
  return c;
}

// ── Item context ──────────────────────────────────────────────────────────────

interface ItemCtx {
  value: string;
  isOpen: boolean;
  triggerId: string;
  panelId: string;
}

const ItemCtx = createContext<ItemCtx | null>(null);

function useItemCtx() {
  const c = useContext(ItemCtx);
  if (!c) throw new Error('<Accordion.Trigger/Content> must be used inside <Accordion.Item>');
  return c;
}

// ── Root ──────────────────────────────────────────────────────────────────────

export interface AccordionRootProps {
  type?: AccordionType;
  defaultValue?: string | string[];
  value?: string | string[];
  onValueChange?: (value: string[]) => void;
  children: React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
}

function normalize(v?: string | string[]): string[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

const Root: React.FC<AccordionRootProps> = ({
  type = 'single',
  defaultValue,
  value,
  onValueChange,
  children,
  style,
  className,
}) => {
  const [internal, setInternal] = useState(() => normalize(defaultValue));
  const controlled = value !== undefined ? normalize(value) : internal;

  const toggle = (v: string) => {
    const next = controlled.includes(v)
      ? controlled.filter(x => x !== v)
      : type === 'single' ? [v] : [...controlled, v];
    setInternal(next);
    onValueChange?.(next);
  };

  return (
    <Ctx.Provider value={{ type, value: controlled, toggle }}>
      <Frame flow="vertical" gap={0} className={className} style={style}>
        {children}
      </Frame>
    </Ctx.Provider>
  );
};

// ── Item ──────────────────────────────────────────────────────────────────────

export interface AccordionItemProps {
  value: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
}

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

export interface AccordionTriggerProps {
  children: React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
}

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

export interface AccordionContentProps {
  children: React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
}

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
