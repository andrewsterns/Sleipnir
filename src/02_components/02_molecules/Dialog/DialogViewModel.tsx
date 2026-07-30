import React, { useEffect, useId, useState } from 'react';
import { DialogRootProps } from './iDialog';

// ── Focus trap ────────────────────────────────────────────────────────────────

const FOCUSABLE = 'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

export function useFocusTrap(containerRef: React.RefObject<HTMLElement | null>, enabled: boolean) {
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

// ── Root state machine ───────────────────────────────────────────────────────

export function useDialogViewModel({ open, defaultOpen = false, onOpenChange }: Pick<DialogRootProps, 'open' | 'defaultOpen' | 'onOpenChange'>) {
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

  return { isOpen, onOpen, onClose, titleId: `${baseId}-title`, descId: `${baseId}-desc` };
}
