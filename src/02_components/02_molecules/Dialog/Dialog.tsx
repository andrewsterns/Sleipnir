import React, { createContext, useContext, useRef } from 'react';
import ReactDOM from 'react-dom';
import { Frame } from '../../01_atoms/Frame/Frame';
import { TacticalPanel } from '../Panel/Panel';
import {
  DialogCtx as DialogCtxType,
  DialogRootProps,
  DialogTriggerProps,
  DialogOverlayProps,
  DialogContentProps,
  DialogTitleProps,
  DialogDescriptionProps,
  DialogCloseProps,
} from './iDialog';
import { useDialogViewModel, useFocusTrap } from './DialogViewModel';

// ── Context ───────────────────────────────────────────────────────────────────

const Ctx = createContext<DialogCtxType | null>(null);

function useDialogCtx() {
  const c = useContext(Ctx);
  if (!c) throw new Error('<Dialog.*> must be used inside <Dialog.Root>');
  return c;
}

// ── Root ──────────────────────────────────────────────────────────────────────

const Root: React.FC<DialogRootProps> = ({ open, defaultOpen = false, onOpenChange, children }) => {
  const { isOpen, onOpen, onClose, titleId, descId } = useDialogViewModel({ open, defaultOpen, onOpenChange });

  return (
    <Ctx.Provider value={{ open: isOpen, onOpen, onClose, titleId, descId }}>
      {children}
    </Ctx.Provider>
  );
};

// ── Trigger ───────────────────────────────────────────────────────────────────

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

const Title: React.FC<DialogTitleProps> = ({ children, style, className }) => {
  const { titleId } = useDialogCtx();
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
export type {
  DialogRootProps,
  DialogTriggerProps,
  DialogOverlayProps,
  DialogContentProps,
  DialogTitleProps,
  DialogDescriptionProps,
  DialogCloseProps,
} from './iDialog';
