import React from 'react';
import { cn } from '../../../utils/cn';
import { Frame } from '../../01_atoms/Frame/Frame';

interface MenuCardProps {
  title: string;
  icon?: React.ReactNode;
  subtitle?: string;
  onClick: () => void;
  variant?: 'primary' | 'surface' | 'accent';
  className?: string;
}

export const MenuCard: React.FC<MenuCardProps> = ({ 
  title, 
  icon, 
  subtitle, 
  onClick, 
  variant = 'primary',
  className 
}) => {
  return (
    <Frame
      as="button"
      onClick={onClick}
      variant={variant}
      layout="flex"
      direction="column"
      align="center"
      justify="center"
      gap={16}
      padding={{ x: 40, y: 48 }}
      borderRadius="var(--radius-1)"
      className={cn(
        'text-2xl font-black transition-all uppercase italic tracking-tighter active:scale-[0.98]',
        className
      )}
    >
      {icon && <span className={cn('text-4xl', variant === 'accent' ? 'text-5xl mb-2' : '')}>{icon}</span>}
      {title}
      {subtitle && <span className="text-xs font-mono opacity-70 tracking-widest mt-auto">{subtitle}</span>}
    </Frame>
  );
};
