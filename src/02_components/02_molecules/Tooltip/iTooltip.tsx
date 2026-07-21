import React from 'react';
import { FrameProps } from '../../01_atoms/Frame/Frame';

export interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /** Override any Frame prop on the tooltip panel */
  panelProps?: Partial<FrameProps>;
}
