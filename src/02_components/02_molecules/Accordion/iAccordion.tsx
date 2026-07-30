import React from 'react';

export type AccordionType = 'single' | 'multiple';

export interface AccordionCtx {
  type: AccordionType;
  value: string[];
  toggle: (v: string) => void;
}

export interface ItemCtx {
  value: string;
  isOpen: boolean;
  triggerId: string;
  panelId: string;
}

export interface AccordionRootProps {
  type?: AccordionType;
  defaultValue?: string | string[];
  value?: string | string[];
  onValueChange?: (value: string[]) => void;
  children: React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
}

export interface AccordionItemProps {
  value: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
}

export interface AccordionTriggerProps {
  children: React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
}

export interface AccordionContentProps {
  children: React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
}
