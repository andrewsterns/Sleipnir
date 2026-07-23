import React from 'react';
import type { DataReadoutItem } from '../DataReadout/DataReadout';

export type OverlayRole = 'system' | 'user' | 'tars';
export type OverlayPriority = 'critical' | 'warning' | 'suggested';

export interface OverlayAction {
  label: string;
  variant?: 'confirm' | 'danger' | 'default';
  onClick: () => void;
}

export interface OverlayMessage {
  id: string;
  role: OverlayRole;
  text: string;
  streaming?: boolean;
  priority?: OverlayPriority;
  data?: DataReadoutItem[];
  actions?: OverlayAction[];
  ts: Date;
}

export interface OverlayCtx {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  messages: OverlayMessage[];
  addMessage: (msg: Omit<OverlayMessage, 'id' | 'ts'>) => void;
  updateMessage: (id: string, patch: Partial<OverlayMessage>) => void;
  send: (text: string) => void;
  isStreaming: boolean;
}

export interface CommandOverlayRootProps {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  initialMessages?: OverlayMessage[];
  onSubmit?: (text: string, respond: (msg: Omit<OverlayMessage, 'id' | 'ts'>) => void) => void;
  children: React.ReactNode;
}
