import React from 'react';

export interface RegisteredItem { value: string; label: string; disabled?: boolean }

export interface SelectCtx {
  value: string;
  onChange: (v: string) => void;
  open: boolean;
  setOpen: (o: boolean | ((prev: boolean) => boolean)) => void;
  baseId: string;
  items: RegisteredItem[];
  registerItem: (item: RegisteredItem) => void;
  focusedValue: string;
  setFocusedValue: (v: string) => void;
}

export interface SelectRootProps {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  children: React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
}

export interface SelectTriggerProps {
  placeholder?: string;
  style?: React.CSSProperties;
  className?: string;
}

export interface SelectContentProps {
  children: React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
}

export interface SelectItemProps {
  value: string;
  children: React.ReactNode;
  disabled?: boolean;
}

export interface SelectLabelProps { children: React.ReactNode }
