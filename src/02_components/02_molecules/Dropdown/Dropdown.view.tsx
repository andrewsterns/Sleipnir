import React from 'react';
import { useDropdownViewModel, DropdownOption } from './Dropdown.viewModel';
import { cn } from '../../../utils/cn';
import { Frame, FrameProps } from '../../01_atoms/Frame/Frame';

interface DropdownProps extends Omit<FrameProps, 'onChange' | 'variant'> {
  options: DropdownOption[];
  value?: string;
  onChange?: (value: string) => void;
  label?: string;
  variant?: 'surface' | 'none';
}

export const Dropdown: React.FC<DropdownProps> = ({ options, value, onChange, label, className, variant = 'surface', ...props }) => {
  const { 
    isOpen, 
    selectedValue, 
    selectedLabel, 
    toggle, 
    selectOption, 
    dropdownRef 
  } = useDropdownViewModel(options, value);

  const handleSelect = (val: string) => {
    selectOption(val);
    if (onChange) onChange(val);
  };

  return (
    <Frame 
      position="relative" 
      layout="inline-block" 
      className={cn('w-48 font-mono text-xs', className)} 
      ref={dropdownRef as any}
      {...props}
    >
      {label && (
        <Frame 
          as="label" 
          layout="block" 
          margin={{ bottom: 4 }} 
          className="text-[var(--text-2)] font-black uppercase tracking-widest"
        >
          {label}
        </Frame>
      )}
      
      <Frame
        as="button"
        onClick={toggle}
        layout="flex"
        align="center"
        justify="between"
        padding={{ x: 12, y: 8 }}
        variant={variant}
        borderRadius="var(--radius-1, 6px)"
        className={cn(
          'w-full text-left transition-all active:scale-[0.98] italic font-bold uppercase tracking-tighter',
          'shadow-[4px_4px_0px_0px_var(--primary-3)]'
        )}
      >
        <span className="truncate">{selectedLabel}</span>
        <span className={cn('transition-transform duration-200 text-[10px]', isOpen ? 'rotate-180' : 'rotate-0')}>▼</span>
      </Frame>

      {isOpen && (
        <Frame
          position="absolute"
          zIndex={50}
          width="100%"
          margin={{ top: 4 }}
          variant="surface"
          borderRadius="var(--radius-1, 6px)"
          className="overflow-hidden animate-in fade-in slide-in-from-top-1 duration-200 shadow-[4px_4px_0px_0px_var(--primary-3)]"
        >
          {options.map((option) => (
            <Frame
              as="button"
              key={option.value}
              onClick={() => handleSelect(option.value)}
              width="100%"
              layout="flex"
              align="center"
              padding={{ x: 12, y: 8 }}
              className={cn(
                'text-left transition-colors border-b last:border-0 border-[var(--border-1)] uppercase italic tracking-tighter',
                'hover:bg-[var(--bg-3)] text-[var(--text-1)]',
                selectedValue === option.value && 'bg-[var(--bg-3)] font-black'
              )}
            >
              {option.label}
            </Frame>
          ))}
        </Frame>
      )}
    </Frame>
  );
};
