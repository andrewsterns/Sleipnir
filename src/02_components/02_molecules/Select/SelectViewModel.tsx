import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { RegisteredItem, SelectRootProps } from './iSelect';

export function useSelectViewModel({
  value,
  defaultValue = '',
  onValueChange,
}: Pick<SelectRootProps, 'value' | 'defaultValue' | 'onValueChange'>) {
  const [internal, setInternal]           = useState(defaultValue);
  const [open, setOpen]                   = useState(false);
  const [items, setItems]                 = useState<RegisteredItem[]>([]);
  const [focusedValue, setFocusedValue]   = useState('');
  const baseId  = useId();
  const rootRef = useRef<HTMLElement>(null);

  const controlled = value ?? internal;

  const onChange = (v: string) => {
    setInternal(v);
    onValueChange?.(v);
    setOpen(false);
    setFocusedValue('');
  };

  const registerItem = useCallback((item: RegisteredItem) => {
    setItems(prev => prev.find(i => i.value === item.value) ? prev : [...prev, item]);
  }, []);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Escape closes
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  return { value: controlled, onChange, open, setOpen, baseId, items, registerItem, focusedValue, setFocusedValue, rootRef };
}

// ── Pure keyboard-nav handlers ────────────────────────────────────────────────
// Operate purely on values already resolved from useSelectCtx() — no local hook needed.

export function handleSelectTriggerKeyDown(
  e: React.KeyboardEvent<HTMLButtonElement>,
  setOpen: (o: boolean | ((prev: boolean) => boolean)) => void,
) {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    setOpen(true);
  } else if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    setOpen(o => !o);
  }
}

export function handleSelectContentKeyDown(
  e: React.KeyboardEvent<HTMLElement>,
  enabledItems: RegisteredItem[],
  focusedValue: string,
  setFocusedValue: (v: string) => void,
  onChange: (v: string) => void,
) {
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    const idx  = enabledItems.findIndex(i => i.value === focusedValue);
    const next = enabledItems[(idx + 1) % enabledItems.length];
    if (next) setFocusedValue(next.value);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    const idx  = enabledItems.findIndex(i => i.value === focusedValue);
    const prev = enabledItems[(idx - 1 + enabledItems.length) % enabledItems.length];
    if (prev) setFocusedValue(prev.value);
  } else if (e.key === 'Enter' && focusedValue) {
    e.preventDefault();
    onChange(focusedValue);
  } else if (e.key === 'Home') {
    e.preventDefault();
    if (enabledItems[0]) setFocusedValue(enabledItems[0].value);
  } else if (e.key === 'End') {
    e.preventDefault();
    const last = enabledItems[enabledItems.length - 1];
    if (last) setFocusedValue(last.value);
  }
}
