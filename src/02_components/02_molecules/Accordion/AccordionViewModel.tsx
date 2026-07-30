import { useState } from 'react';
import { AccordionRootProps, AccordionType } from './iAccordion';

function normalize(v?: string | string[]): string[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

export function useAccordionViewModel({
  type = 'single' as AccordionType,
  defaultValue,
  value,
  onValueChange,
}: Pick<AccordionRootProps, 'type' | 'defaultValue' | 'value' | 'onValueChange'>) {
  const [internal, setInternal] = useState(() => normalize(defaultValue));
  const controlled = value !== undefined ? normalize(value) : internal;

  const toggle = (v: string) => {
    const next = controlled.includes(v)
      ? controlled.filter(x => x !== v)
      : type === 'single' ? [v] : [...controlled, v];
    setInternal(next);
    onValueChange?.(next);
  };

  return { value: controlled, toggle };
}
