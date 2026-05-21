import React from 'react';
import { Theme, applyTheme } from '../../00_themes';
import { Dropdown } from '../../01_atoms/Dropdown/Dropdown.view';
import { Logo } from '../../01_atoms/Logo/Logo';
import { Frame, FrameProps } from '../../01_atoms/Frame/Frame';
import { cn } from '../../../utils/cn';

interface HeaderProps extends FrameProps {
  currentTheme?: Theme;
  onThemeChange?: (theme: Theme) => void;
  showThemeSelector?: boolean;
}

const THEME_OPTIONS = [
  { value: 'default', label: 'DEFAULT_VIBE' },
  { value: 'houseplant', label: 'HOUSEPLANT_LIGHT' },
  { value: 'dark', label: 'NIGHT_OPERATIONS' },
];

export const Header: React.FC<HeaderProps> = ({ 
  currentTheme = 'default', 
  onThemeChange,
  showThemeSelector = false,
  className,
  variant = 'none',
  ...props
}) => {
  const handleThemeChange = (val: string) => {
    const nextTheme = val as Theme;
    applyTheme(nextTheme);
    if (onThemeChange) onThemeChange(nextTheme);
  };

  return (
    <Frame
      as="header"
      height={64}
      layout="flex"
      align="center"
      justify="between"
      padding={{ x: 24 }}
      variant={variant}
      background={variant === 'none' && !props.fill && !props.background ? "var(--bg-2)" : undefined}
      border={{ bottom: { width: 'var(--border-w)', color: 'var(--border-1)' } }}
      className={cn("sticky top-0 z-50 backdrop-blur-md transition-colors duration-500", className)}
      {...props}
    >
      <div className="flex items-center space-x-4">
        <Logo className="h-8 w-auto text-[var(--text-1)]" />
        <span className="text-[10px] bg-[var(--text-1,white)] text-[var(--bg-1,black)] px-2 py-0.5 font-black uppercase tracking-widest">v0.1.0-alpha</span>
      </div>
      
      <div className="flex items-center space-x-6">
        {showThemeSelector && (
          <Dropdown 
            options={THEME_OPTIONS} 
            value={currentTheme} 
            onChange={handleThemeChange} 
            className="w-40"
          />
        )}
        <div className="flex flex-col items-end border-l-2 border-[var(--border-1)] pl-6">
          <span className="text-[10px] font-black text-[var(--text-2,#d0c9c3)] uppercase tracking-[0.2em]">Active Project</span>
          <span className="text-xs font-mono font-bold text-[var(--text-3,#ff073a)]">IBCS_MISSION_ALPHA</span>
        </div>
      </div>
    </Frame>
  );
};
