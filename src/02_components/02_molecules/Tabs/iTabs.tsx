import React from 'react';

export interface TabsRootProps {
  defaultValue?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  children: React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
}

export interface TabsListProps {
  children: React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
}

export interface TabProps {
  value: string;
  children: React.ReactNode;
  disabled?: boolean;
  style?: React.CSSProperties;
  className?: string;
}

export interface TabsPanelProps {
  value: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
}

export interface TabsCtx {
  activeValue: string;
  setActiveValue: (v: string) => void;
  baseId: string;
}
