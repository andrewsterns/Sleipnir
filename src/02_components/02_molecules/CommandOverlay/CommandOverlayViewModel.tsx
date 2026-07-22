import { useCallback, useEffect, useState } from 'react';
import type { DataReadoutItem } from '../DataReadout/DataReadout';
import { CommandOverlayRootProps, OverlayAction, OverlayMessage, OverlayPriority } from './iCommandOverlay';

// ── ID generator ──────────────────────────────────────────────────────────────

let _uid = 0;
export const uid = () => `tars-${++_uid}`;

// ── Demo responses ─────────────────────────────────────────────────────────────

export const DEMO: Array<{ text: string; data?: DataReadoutItem[]; actions?: OverlayAction[] }> = [
  {
    text: 'GROUP-1 nominal. 3 of 3 units active and within operational envelope.',
    data: [
      { label: 'ALT',  value: '12,400', unit: 'ft'   },
      { label: 'SPD',  value: '0.62',   unit: 'MACH' },
      { label: 'FUEL', value: '61%' },
      { label: 'HDG',  value: '247°' },
    ],
  },
  {
    text: 'Intercept vector calculated. HDG 112°, ETA 4min. Authorization required before commit.',
    actions: [
      { label: 'EXECUTE', variant: 'confirm', onClick: () => {} },
      { label: 'REVIEW',  onClick: () => {} },
      { label: 'ABORT',   variant: 'danger',  onClick: () => {} },
    ],
  },
  { text: 'RED-3 SAM radar lock confirmed at grid E7. XR-231 within threat envelope. Recommend evasive vector 270°.' },
  { text: 'Sensor coverage 70%. Blind spot confirmed NE quadrant. UAS-4 repositioning — ETA 2min.' },
  { text: 'COMMS LOSS ALPHA-3. Last ping 02:14:33Z. Fallback relay initiated. Awaiting handshake.' },
];

// ── Priority label ────────────────────────────────────────────────────────────

export const PRIORITY_STARS: Record<OverlayPriority, string> = {
  critical:  '★ ★ ★',
  warning:   '★ ★',
  suggested: '★',
};

export const PRIORITY_COLOR: Record<OverlayPriority, string> = {
  critical:  'var(--critical)',
  warning:   'var(--warn)',
  suggested: 'var(--text-2)',
};

// ── Action buttons ────────────────────────────────────────────────────────────

export const ACTION_BG: Record<NonNullable<OverlayAction['variant']>, string> = {
  confirm: 'rgba(255,255,255,0.08)',
  danger:  'rgba(255,48,48,0.10)',
  default: 'transparent',
};

export const ACTION_BORDER: Record<NonNullable<OverlayAction['variant']>, string> = {
  confirm: 'rgba(255,255,255,0.22)',
  danger:  'rgba(255,48,48,0.32)',
  default: 'var(--border-1)',
};

// ── Root state machine ───────────────────────────────────────────────────────

export function useCommandOverlayViewModel({
  open: controlledOpen,
  defaultOpen = false,
  onOpenChange,
  initialMessages = [],
  onSubmit,
}: Pick<CommandOverlayRootProps, 'open' | 'defaultOpen' | 'onOpenChange' | 'initialMessages' | 'onSubmit'>) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const [messages, setMessages] = useState<OverlayMessage[]>(
    initialMessages.map(m => ({ ...m, id: m.id ?? uid() })),
  );

  const open = controlledOpen ?? internalOpen;
  const isStreaming = messages.some(m => m.streaming);

  const onOpen  = () => { setInternalOpen(true);  onOpenChange?.(true);  };
  const onClose = () => { setInternalOpen(false); onOpenChange?.(false); };

  const addMessage = useCallback((msg: Omit<OverlayMessage, 'id' | 'ts'>) => {
    setMessages(prev => [...prev, { ...msg, id: uid(), ts: new Date() }]);
  }, []);

  const updateMessage = useCallback((id: string, patch: Partial<OverlayMessage>) => {
    setMessages(prev => prev.map(m => m.id === id ? { ...m, ...patch } : m));
  }, []);

  const send = useCallback((text: string) => {
    setMessages(prev => [...prev, { id: uid(), role: 'user', text, ts: new Date() }]);

    if (onSubmit) {
      onSubmit(text, (msg) => {
        setMessages(prev => [...prev, { ...msg, id: uid(), ts: new Date(), streaming: true }]);
      });
    } else {
      const pick = DEMO[Math.floor(Math.random() * DEMO.length)];
      setTimeout(() => {
        setMessages(prev => [...prev, {
          id: uid(),
          role: 'tars',
          text: pick.text,
          streaming: true,
          data: pick.data,
          actions: pick.actions,
          ts: new Date(),
        }]);
      }, 320);
    }
  }, [onSubmit]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  return { open, onOpen, onClose, messages, addMessage, updateMessage, send, isStreaming };
}
