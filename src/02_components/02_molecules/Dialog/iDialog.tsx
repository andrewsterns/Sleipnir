import React from 'react';
import { TacticalVariant } from '../Panel/iPanel';

export interface DialogCtx {
  open:    boolean;
  onOpen:  () => void;
  onClose: () => void;
  titleId: string;
  descId:  string;
}

export interface DialogRootProps {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}

export interface DialogTriggerProps {
  children: React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
}

export interface DialogOverlayProps { style?: React.CSSProperties; className?: string }

export interface DialogContentProps {
  children: React.ReactNode;
  variant?: TacticalVariant;
  chamfer?: number;
  style?: React.CSSProperties;
  className?: string;
}

export interface DialogTitleProps {
  children: React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
}

export interface DialogDescriptionProps {
  children: React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
}

export interface DialogCloseProps {
  children?: React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
  'aria-label'?: string;
}
