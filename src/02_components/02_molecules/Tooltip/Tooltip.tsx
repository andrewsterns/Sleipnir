import React, { useState } from 'react';
import { Frame } from '../../01_atoms/Frame/Frame';
import { cn } from '../../../utils/cn';

interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  panelClassName?: string;
}

export const Tooltip: React.FC<TooltipProps> = ({ content, children, className, panelClassName }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <span
      className={cn('relative inline-flex', className)}
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
    >
      {children}
      {isOpen && (
        <Frame
          position="absolute"
          top="100%"
          left={0}
          margin={{ top: 6 }}
          padding={{ x: 8, y: 6 }}
          border="1px solid var(--border-1)"
          borderRadius="var(--radius-2, 6px)"
          background="var(--bg-2)"
          zIndex={100}
          className={cn(
            'pointer-events-none whitespace-nowrap text-[10px] leading-tight text-[var(--text-1)] shadow-[0_8px_24px_rgba(0,0,0,0.35)]',
            panelClassName,
          )}
        >
          {content}
        </Frame>
      )}
    </span>
  );
};
