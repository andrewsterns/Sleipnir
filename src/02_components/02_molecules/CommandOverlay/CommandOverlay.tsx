import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { Frame } from '../../01_atoms/Frame/Frame';
import { TacticalPanel } from '../Panel/Panel';
import { StreamText } from '../../01_atoms/StreamText/StreamText';
import type { DataReadoutItem } from '../DataReadout/DataReadout';
import { OverlayCtx as OverlayCtxType, OverlayAction, OverlayMessage, CommandOverlayRootProps } from './iCommandOverlay';
import {
  ACTION_BG,
  ACTION_BORDER,
  PRIORITY_COLOR,
  PRIORITY_STARS,
  useCommandOverlayViewModel,
} from './CommandOverlayViewModel';

// ── Context ───────────────────────────────────────────────────────────────────

const Ctx = createContext<OverlayCtxType | null>(null);

function useCtx() {
  const c = useContext(Ctx);
  if (!c) throw new Error('<CommandOverlay.*> must be inside <CommandOverlay.Root>');
  return c;
}

// ── Action buttons ────────────────────────────────────────────────────────────

const ActionRow: React.FC<{ actions: OverlayAction[] }> = ({ actions }) => (
  <Frame flow="horizontal" gap={6} margin={{ top: 8 }}>
    {actions.map((a, i) => {
      const v = a.variant ?? 'default';
      return (
        <button
          key={i}
          onClick={a.onClick}
          style={{
            background: ACTION_BG[v],
            border: `1px solid ${ACTION_BORDER[v]}`,
            cursor: 'pointer',
            fontFamily: 'var(--font-mono)',
            fontSize: 8,
            letterSpacing: '0.10em',
            textTransform: 'uppercase' as const,
            color: v === 'danger' ? 'var(--critical)' : 'var(--text-1)',
            padding: '4px 10px',
            outline: 'none',
            transition: 'background 0.12s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = v === 'danger' ? 'rgba(255,48,48,0.18)' : 'rgba(255,255,255,0.12)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = ACTION_BG[v]; }}
        >
          {a.label}
        </button>
      );
    })}
  </Frame>
);

// ── Inline data block ─────────────────────────────────────────────────────────

const DataBlock: React.FC<{ items: DataReadoutItem[] }> = ({ items }) => (
  <Frame
    flow="grid"
    cols={4}
    gap="6px 12px"
    margin={{ top: 8 }}
    padding={{ x: 10, y: 8 }}
    fill={{ solid: 'rgba(255,255,255,0.025)' }}
    stroke={{ color: 'border-1' }}
  >
    {items.map((item, i) => (
      <Frame key={i} flow="vertical" gap={2}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 7, color: 'var(--text-3)', letterSpacing: '0.10em', textTransform: 'uppercase' }}>
          {item.label}
        </span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: item.valueColor ?? 'var(--text-1)' }}>
          {item.value}{item.unit ? <span style={{ color: 'var(--text-3)', marginLeft: 2, fontSize: 7 }}>{item.unit}</span> : null}
        </span>
      </Frame>
    ))}
  </Frame>
);

// ── Message row ───────────────────────────────────────────────────────────────

const MessageRow: React.FC<{ message: OverlayMessage }> = ({ message }) => {
  const { updateMessage } = useCtx();

  if (message.role === 'system') {
    return (
      <Frame flow="vertical" gap={0} padding={{ y: 8 }} stroke={{ bottom: { color: 'rgba(255,255,255,0.05)' } }}>
        {message.priority && (
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 7,
            letterSpacing: '0.18em',
            color: PRIORITY_COLOR[message.priority],
            textTransform: 'uppercase',
            marginBottom: 4,
            display: 'block',
          }}>
            {PRIORITY_STARS[message.priority]} {message.priority}
          </span>
        )}
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-2)', lineHeight: 1.55 }}>
          {message.text}
        </span>
        {message.actions && <ActionRow actions={message.actions} />}
      </Frame>
    );
  }

  if (message.role === 'user') {
    return (
      <Frame flow="horizontal" gap={8} align="baseline" padding={{ y: 5 }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-3)', flexShrink: 0 }}>›</span>
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 9,
          color: 'var(--text-2)',
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
        }}>
          {message.text}
        </span>
      </Frame>
    );
  }

  // tars role
  return (
    <Frame flow="vertical" padding={{ y: 6 }}>
      <Frame flow="horizontal" gap={8} align="baseline">
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 7,
          color: 'var(--text-3)',
          letterSpacing: '0.08em',
          flexShrink: 0,
          paddingTop: 1,
        }}>
          TARS ↳
        </span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-1)', lineHeight: 1.55 }}>
          {message.streaming
            ? (
              <StreamText
                text={message.text}
                onComplete={() => updateMessage(message.id, { streaming: false })}
              />
            )
            : message.text
          }
        </span>
      </Frame>
      {!message.streaming && message.data && <DataBlock items={message.data} />}
      {!message.streaming && message.actions && <ActionRow actions={message.actions} />}
    </Frame>
  );
};

// ── Compound sub-components ───────────────────────────────────────────────────

const Trigger: React.FC<{ children: React.ReactNode; className?: string; style?: React.CSSProperties }> = ({
  children, className, style,
}) => {
  const { onOpen } = useCtx();
  return (
    <Frame
      as="span"
      onClick={onOpen}
      className={className}
      layout="inline-flex"
      cursor="pointer"
      style={style}
    >
      {children}
    </Frame>
  );
};

const Portal: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { open } = useCtx();
  if (!open || typeof document === 'undefined') return null;
  return ReactDOM.createPortal(children, document.body);
};

const Backdrop: React.FC<{ style?: React.CSSProperties }> = ({ style }) => {
  const { onClose } = useCtx();
  return (
    <div
      aria-hidden="true"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(2,5,10,0.85)',
        backdropFilter: 'blur(6px)',
        zIndex: 200,
        ...style,
      }}
    />
  );
};

const Window: React.FC<{
  children: React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
}> = ({ children, style, className }) => (
  <TacticalPanel
    flow="vertical"
    gap={0}
    variant="default"
    chamfer={12}
    className={className}
    fixed
    y="5vh"
    x="5vw"
    w="90vw"
    h="90vh"
    z={201}
    clipContent
    style={style}
  >
    {children}
  </TacticalPanel>
);

const Header: React.FC<{ title?: string; style?: React.CSSProperties }> = ({
  title = 'TARS — TACTICAL AI',
  style,
}) => {
  const { onClose } = useCtx();
  return (
    <Frame
      flow="horizontal"
      align="center"
      justify="between"
      padding={{ x: 16, y: 10 }}
      stroke={{ bottom: { color: 'border-1' } }}
      shrink={0}
      style={style}
    >
      <Frame flow="horizontal" align="center" gap={10}>
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 8,
          fontWeight: 700,
          color: 'var(--text-1)',
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
        }}>
          {title}
        </span>
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 7,
          color: 'var(--text-3)',
          letterSpacing: '0.08em',
          padding: '1px 6px',
          border: '1px solid var(--border-1)',
        }}>
          ONLINE
        </span>
      </Frame>
      <button
        onClick={onClose}
        aria-label="Close"
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--text-3)',
          fontFamily: 'var(--font-mono)',
          fontSize: 16,
          lineHeight: 1,
          padding: '2px 4px',
          outline: 'none',
          transition: 'color 0.12s',
        }}
        onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-1)'; }}
        onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-3)'; }}
      >
        ×
      </button>
    </Frame>
  );
};

const Feed: React.FC<{ style?: React.CSSProperties }> = ({ style }) => {
  const { messages } = useCtx();
  const bottomRef = useRef<HTMLDivElement>(null);

  const systemMsgs = messages.filter(m => m.role === 'system');
  const thread     = messages.filter(m => m.role !== 'system');

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  return (
    <Frame
      flow="vertical"
      grow
      scroll="y"
      className="no-scrollbar"
      padding={{ x: 16 }}
      minH={0}
      style={style}
    >
      {systemMsgs.length > 0 && (
        <Frame flow="vertical" padding={{ top: 14 }}>
          {systemMsgs.map(m => <MessageRow key={m.id} message={m} />)}
        </Frame>
      )}

      {systemMsgs.length > 0 && thread.length > 0 && (
        <Frame flow="horizontal" align="center" gap={10} padding={{ y: 10 }}>
          <div style={{ flex: 1, height: 1, background: 'var(--border-1)' }} />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 7, color: 'var(--text-3)', letterSpacing: '0.14em' }}>
            THREAD
          </span>
          <div style={{ flex: 1, height: 1, background: 'var(--border-1)' }} />
        </Frame>
      )}

      {thread.length > 0 && (
        <Frame flow="vertical" gap={0} padding={{ bottom: 14 }}>
          {thread.map(m => <MessageRow key={m.id} message={m} />)}
        </Frame>
      )}

      {systemMsgs.length === 0 && thread.length === 0 && (
        <Frame flow="vertical" align="center" justify="center" grow minH={80}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--text-3)', letterSpacing: '0.10em' }}>
            NO ACTIVE ADVISORIES
          </span>
        </Frame>
      )}

      <div ref={bottomRef} />
    </Frame>
  );
};

const Input: React.FC = () => {
  const { send, isStreaming } = useCtx();
  const [value,   setValue]   = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [histIdx, setHistIdx] = useState(-1);
  const [saved,   setSaved]   = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const submit = () => {
    const text = value.trim();
    if (!text || isStreaming) return;
    send(text);
    setHistory(h => [text, ...h]);
    setHistIdx(-1);
    setSaved('');
    setValue('');
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { submit(); return; }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (histIdx === -1) setSaved(value);
      const next = Math.min(histIdx + 1, history.length - 1);
      setHistIdx(next);
      if (history[next] !== undefined) setValue(history[next]);
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = histIdx - 1;
      if (next < 0) { setHistIdx(-1); setValue(saved); } else { setHistIdx(next); setValue(history[next] ?? ''); }
    }
  };

  return (
    <Frame
      flow="horizontal"
      align="center"
      gap={8}
      padding={{ x: 16, y: 10 }}
      stroke={{ top: { color: 'border-1' } }}
      shrink={0}
    >
      <span style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 9,
        color: isStreaming ? 'var(--text-3)' : 'var(--text-2)',
        letterSpacing: '0.08em',
        flexShrink: 0,
        userSelect: 'none',
        transition: 'color 0.15s',
      }}>
        TARS ›
      </span>
      <input
        ref={inputRef}
        value={value}
        onChange={e => { setValue(e.target.value); setHistIdx(-1); }}
        onKeyDown={handleKeyDown}
        disabled={isStreaming}
        placeholder={isStreaming ? 'processing…' : 'enter command or query…'}
        autoFocus
        style={{
          flex: 1,
          background: 'transparent',
          border: 'none',
          outline: 'none',
          fontFamily: 'var(--font-mono)',
          fontSize: 9,
          color: 'var(--text-1)',
          letterSpacing: '0.06em',
          caretColor: 'var(--text-1)',
          opacity: isStreaming ? 0.35 : 1,
          transition: 'opacity 0.15s',
        }}
      />
      {history.length > 0 && (
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 7,
          color: 'var(--text-3)',
          letterSpacing: '0.06em',
          userSelect: 'none',
          flexShrink: 0,
        }}>
          ↑↓ history
        </span>
      )}
    </Frame>
  );
};

// ── Root ──────────────────────────────────────────────────────────────────────

const Root: React.FC<CommandOverlayRootProps> = ({
  open: controlledOpen,
  defaultOpen = false,
  onOpenChange,
  initialMessages = [],
  onSubmit,
  children,
}) => {
  const { open, onOpen, onClose, messages, addMessage, updateMessage, send, isStreaming } =
    useCommandOverlayViewModel({ open: controlledOpen, defaultOpen, onOpenChange, initialMessages, onSubmit });

  return (
    <Ctx.Provider value={{ open, onOpen, onClose, messages, addMessage, updateMessage, send, isStreaming }}>
      {children}
    </Ctx.Provider>
  );
};

// ── Export compound ───────────────────────────────────────────────────────────

export const CommandOverlay = {
  Root,
  Trigger,
  Portal,
  Backdrop,
  Window,
  Header,
  Feed,
  Input,
};

export type {
  OverlayRole,
  OverlayPriority,
  OverlayAction,
  OverlayMessage,
  CommandOverlayRootProps,
} from './iCommandOverlay';
