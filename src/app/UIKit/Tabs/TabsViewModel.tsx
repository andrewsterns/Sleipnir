import React, { useId, useState } from 'react';
import { TabsRootProps } from './iTabs';

export function useTabsViewModel({
  defaultValue = '',
  value,
  onValueChange,
}: Pick<TabsRootProps, 'defaultValue' | 'value' | 'onValueChange'>) {
  const [internal, setInternal] = useState(defaultValue);
  const activeValue = value ?? internal;
  const setActiveValue = (v: string) => { setInternal(v); onValueChange?.(v); };
  const baseId = useId();

  return { activeValue, setActiveValue, baseId };
}

export function handleTabsListKeyDown(ref: React.RefObject<HTMLElement>, e: React.KeyboardEvent<HTMLElement>) {
  const tabs = Array.from(
    ref.current?.querySelectorAll<HTMLElement>('[role="tab"]:not([disabled])') ?? []
  );
  const idx = tabs.findIndex(t => t === document.activeElement);
  if (idx === -1) return;

  let next = idx;
  if      (e.key === 'ArrowRight') { e.preventDefault(); next = (idx + 1) % tabs.length; }
  else if (e.key === 'ArrowLeft')  { e.preventDefault(); next = (idx - 1 + tabs.length) % tabs.length; }
  else if (e.key === 'Home')       { e.preventDefault(); next = 0; }
  else if (e.key === 'End')        { e.preventDefault(); next = tabs.length - 1; }
  else return;

  tabs[next]?.focus();
  tabs[next]?.click();
}
