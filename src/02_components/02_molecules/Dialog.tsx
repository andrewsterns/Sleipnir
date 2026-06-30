import React, { createContext, useContext, useEffect, useId, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { Frame } from '../01_atoms/Frame/Frame';
import { TacticalPanel } from './Panel';
import type { TacticalVariant } from './Panel';

// ── Focus trap ────────────────────────────────────────────────────────────────

const FOCUSABLE = 'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

function useFocusTrap(containerRef: React.RefObject<HTMLElement | null>, enabled: boolean) {
  useEffect(() => {
    if (!enabled || !containerRef.current) return;
    const el = containerRef.current;

    const arr   = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE));
    const first = arr[0];
    const last  = arr[arr.length - 1];
    const prev  = document.activeElement as HTMLElement | null;

    setTimeout(() => first?.focus(), 10);

    const trap = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      if (e.shiftKey) {
        if (document.activeElement === first || document.activeElement === el) {
          e.preventDefault(); last?.focus();
        }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    };

    el.addEventListener('keydown', trap);
    return () => { el.removeEventListener('keydown', trap); prev?.focus(); };
  }, [enabled, containerRef]);
}

// ── Context ───────────────────────────────────────────────────────────────────

interface DialogCtx {
  open:    boolean;
  onOpen:  () => void;
  onClose: () => void;
  titleId: string;
  descId:  string;
}

const Ctx = createContext<DialogCtx | null>(null);

function useDialogCtx() {
  const c = useContext(Ctx);
  if (!c) throw new Error('<Dialog.*> must be used inside <Dialog.Root>');
  return c;
}

// ── Root ──────────────────────────────────────────────────────────────────────

export interface DialogRootProps {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}

const Root: React.FC<DialogRootProps> = ({ open, defaultOpen = false, onOpenChange, children }) => {
  const [internal, setInternal] = useState(defaultOpen);
  const isOpen = open ?? internal;
  const baseId = useId();

  const onOpen  = () => { setInternal(true);  onOpenChange?.(true); };
  const onClose = () => { setInternal(false); onOpenChange?.(false); };

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen]);

  return (
    <Ctx.Provider value={{ open: isOpen, onOpen, onClose, titleId: `${baseId}-title`, descId: `${baseId}-desc` }}>
      {children}
    </Ctx.Provider>
  );
};

// ── Trigger ───────────────────────────────────────────────────────────────────

export interface DialogTriggerProps {
  children: React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
}

const Trigger: React.FC<DialogTriggerProps> = ({ children, style, className }) => {
  const { onOpen } = useDialogCtx();
  return (
    <Frame
      as="span"
      onClick={onOpen}
      className={className}
      style={{ display: 'inline-flex', cursor: 'pointer', ...style }}
    >
      {children}
    </Frame>
  );
};

// ── Portal ────────────────────────────────────────────────────────────────────

const Portal: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { open } = useDialogCtx();
  if (!open || typeof document === 'undefined') return null;
  return ReactDOM.createPortal(children, document.body);
};

// ── Overlay ───────────────────────────────────────────────────────────────────

export interface DialogOverlayProps { style?: React.CSSProperties; className?: string }

const Overlay: React.FC<DialogOverlayProps> = ({ style, className }) => {
  const { onClose } = useDialogCtx();
  return (
    <Frame
      aria-hidden="true"
      className={className}
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(2,5,10,0.72)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        zIndex: 200,
        ...style,
      }}
    />
  );
};

// ── Content ───────────────────────────────────────────────────────────────────

export interface DialogContentProps {
  children: React.ReactNode;
  variant?: TacticalVariant;
  chamfer?: number;
  style?: React.CSSProperties;
  className?: string;
}

const Content: React.FC<DialogContentProps> = ({
  children,
  variant = 'default',
  chamfer = 10,
  style,
  className,
}) => {
  const { titleId, descId } = useDialogCtx();
  const ref = useRef<HTMLElement>(null);
  useFocusTrap(ref, true);

  return (
    <TacticalPanel
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descId}
      flow="vertical"
      gap={0}
      variant={variant}
      chamfer={chamfer}
      className={className}
      style={{
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 201,
        minWidth: 320,
        maxWidth: 'min(560px, calc(100vw - 32px))',
        maxHeight: '90vh',
        overflowY: 'auto',
        scrollbarWidth: 'none' as React.CSSProperties['scrollbarWidth'],
        ...style,
      }}
    >
      {children}
    </TacticalPanel>
  );
};

// ── Title ─────────────────────────────────────────────────────────────────────

export interface DialogTitleProps {
  children: React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
}

const Title: React.FC<DialogTitleProps> = ({ children, style, className }) => {
  const { titleId, onClose } = useDialogCtx();
  return (
    <Frame
      flow="horizontal"
      align="center"
      justify="between"
      padding={{ x: 14, y: 10 }}
      className={className}
      style={{ borderBottom: '1px solid var(--border-1)', flexShrink: 0, ...style }}
    >
      <h2
        id={titleId}
        style={{
          margin: 0,
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          fontWeight: 700,
          color: 'var(--text-1)',
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
        }}
      >
        {children}
      </h2>
      <Close aria-label="Close dialog" style={{ padding: '2px 4px', fontSize: 16 }}>×</Close>
    </Frame>
  );
};

// ── Description ───────────────────────────────────────────────────────────────

export interface DialogDescriptionProps {
  children: React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
}

const Description: React.FC<DialogDescriptionProps> = ({ children, style, className }) => {
  const { descId } = useDialogCtx();
  return (
    <p
      id={descId}
      className={className}
      style={{
        margin: 0,
        fontFamily: 'var(--font-mono)',
        fontSize: 9,
        color: 'var(--text-2)',
        lineHeight: 1.6,
        letterSpacing: '0.04em',
        ...style,
      }}
    >
      {children}
    </p>
  );
};

// ── Close ─────────────────────────────────────────────────────────────────────

export interface DialogCloseProps {
  children?: React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
  'aria-label'?: string;
}

const Close: React.FC<DialogCloseProps> = ({ children, style, className, 'aria-label': ariaLabel }) => {
  const { onClose } = useDialogCtx();
  return (
    <button
      onClick={onClose}
      aria-label={ariaLabel ?? 'Close dialog'}
      className={className}
      style={{
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        color: 'var(--text-3)',
        fontFamily: 'var(--font-mono)',
        fontSize: 9,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        lineHeight: 1,
        padding: '4px 8px',
        display: 'inline-flex',
        alignItems: 'center',
        outline: 'none',
        transition: 'color 0.12s',
        ...style,
      }}
      onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-1)')}
      onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-3)')}
    >
      {children ?? '× Close'}
    </button>
  );
};

// ── Export ────────────────────────────────────────────────────────────────────

export const Dialog = { Root, Trigger, Portal, Overlay, Content, Title, Description, Close };
